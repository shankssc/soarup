# SoarUp — Scaling & Technical Debt: Voice Pipeline (API)

# Path: specs/scaling/api/voice_pipeline.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 4

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the voice processing pipeline introduced in
Milestone 4. This covers the audio upload flow, faster-whisper transcription,
the Celery audio task, and storage configuration. Items are ordered by
expected impact, not urgency. None of these are blockers for early-stage use.

---

## Issue 1 — Sync boto3 Blocks the Worker Process During Audio Download

**Where:** `apps/api/app/workers/tasks.py` → `_process_audio_update_async`

**What:** The Celery task downloads audio from Minio/R2 using sync `boto3`,
which blocks the thread for the duration of the download. While this runs
inside `asyncio.run()` in a dedicated Celery process (not the FastAPI event
loop), it still blocks one worker process entirely during the download window.

```python
# Current — sync download, blocks worker process
s3 = boto3.client("s3", ...)
audio_buffer = io.BytesIO()
s3.download_fileobj(settings.r2_bucket_name, update.audio_key, audio_buffer)
```

**Impact:** Low — each Celery worker process handles one task at a time.
A 10MB audio file on a local network takes well under a second. On a remote
R2 endpoint it could take 1-5 seconds depending on bandwidth. With 12 worker
processes (default concurrency), this means up to 12 simultaneous blocking
downloads with no other tasks being processed in those processes.

**Fix (post-M5):** Replace `boto3` with `aioboto3` for the download:

```python
async with aioboto3.Session().client("s3", ...) as client:
    response = await client.get_object(Bucket=bucket, Key=key)
    audio_buffer = io.BytesIO(await response["Body"].read())
```

This requires moving to a proper async task runner (e.g. `celery-pool-asyncio`)
since `aioboto3` cannot be used with `asyncio.run()` safely — it requires a
persistent event loop.

**Effort:** Medium — dependent on `celery-pool-asyncio` adoption (see M3
scaling doc Issue 2). Revisit together.

---

## Issue 2 — Whisper Model Loaded Per Worker Process (~150MB × N Workers)

**Where:** `apps/api/app/workers/whisper_setup.py` → `get_whisper_model`

**What:** The faster-whisper `base` model is approximately 150MB resident
memory. With Celery's default prefork pool of 12 workers, all 12 processes
load the model independently on first use (or on startup via the
`@worker_ready` signal). This means ~1.8GB of model memory for 12 workers,
regardless of how many voice updates are actually being processed.

```python
# Current — model singleton per process, no cross-process sharing
_model: WhisperModel | None = None

def get_whisper_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = _load_model()
    return _model
```

**Impact:** Low on developer machines (16GB+ RAM). In a constrained staging
or production environment (2-4GB RAM), this is a significant overhead. With
4 workers at `base` model size: ~600MB. With 12 workers: ~1.8GB.

**Fix options:**

Option A — Reduce worker count for the audio queue:

```python
# celery_app.py — dedicate fewer workers to audio tasks
celery_app.conf.task_routes = {
    "app.workers.tasks.process_audio_update": {"queue": "audio"},
    "app.workers.tasks.process_update": {"queue": "default"},
}

# Run audio queue with fewer workers
# docker: celery worker -Q audio --concurrency=2
```

Option B — Use a smaller model in memory-constrained environments:

```
WHISPER_MODEL_SIZE=tiny  # ~75MB vs ~150MB for base
```

`tiny` model has noticeably lower accuracy for accented speech or technical
vocabulary but is adequate for standup updates in most cases.

Option C (post-M5) — Dedicated transcription microservice that loads the
model once and handles requests via a queue, rather than per-worker loading.

**Effort:** Low for Options A and B (config changes). High for Option C.

---

## Issue 3 — No Audio File Cleanup After Transcription

**Where:** `apps/api/app/workers/tasks.py` → `_process_audio_update_async`
and `apps/api/app/repositories/storage_repo.py`

**What:** After transcription completes, the original audio file remains in
Minio/R2 indefinitely. There is no TTL, lifecycle policy, or explicit deletion
step after the transcript is stored. For a voice standup tool, the raw audio
file has limited long-term value once the transcript and summary are available.

```python
# Current — audio file uploaded, never deleted
s3.download_fileobj(settings.r2_bucket_name, update.audio_key, audio_buffer)
# ... transcription + summarisation ...
# No cleanup of update.audio_key from storage
```

**Impact:** Storage cost accumulates over time. A 5-minute voice note at
WebM/Opus quality is approximately 1-3MB. At 100 updates/day, that's 100-300MB
per day or 3-9GB per month. Not significant at early scale but grows linearly.

**Fix (Milestone 5):** Two options:

Option A — Delete audio after successful transcription in the task:

```python
# After update_transcript succeeds
storage = StorageRepository()
await storage.delete_file(update.audio_key)
await update_repo.clear_audio_key(update)  # set audio_key = null in DB
```

Option B — R2 lifecycle policy (production only): configure a bucket
lifecycle rule to expire objects in the `audio/` prefix after 30 days.
This is zero-code and handles orphaned files from failed tasks.

**Recommendation:** Option B for production (set-and-forget), Option A
as an explicit step for completeness and immediate space recovery.

**Effort:** Near-zero for Option B (R2 console config). Low for Option A
(one storage call + one repo method).

---

## Issue 4 — No Maximum Concurrent Transcription Cap

**Where:** `apps/api/app/workers/celery_app.py`
and `apps/api/app/workers/tasks.py`

**What:** Transcription is CPU-intensive. faster-whisper with `int8`
quantisation on CPU takes approximately 0.5-2x real-time (a 1-minute
audio clip takes 30s-2min to transcribe on a modern CPU). With no concurrency
cap, all 12 Celery worker processes could simultaneously run transcription,
saturating the CPU and causing significant latency for all other tasks
including text update summarisation.

```python
# Current — no cap, all workers can transcribe simultaneously
@celery_app.task(
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.process_audio_update",
    ...
)
def process_audio_update(self, update_id: str) -> None:
    asyncio.run(_process_audio_update_async(self, update_id))
```

**Impact:** Medium on resource-constrained hosts. On a shared server,
simultaneous transcriptions from multiple users will compete for CPU and
degrade all processing times. Text updates (which have no transcription
step) will also be delayed if all workers are occupied.

**Fix (Milestone 5):** Route audio tasks to a dedicated queue with limited
concurrency, separate from text update tasks:

```python
# celery_app.py
celery_app.conf.task_routes = {
    "app.workers.tasks.process_audio_update": {"queue": "audio"},
    "app.workers.tasks.process_update": {"queue": "default"},
}
```

Start the audio queue worker with limited concurrency:

```bash
# docker-compose.yml — dedicated audio worker
celery -A app.workers.celery_app worker -Q audio --concurrency=2 --loglevel=info
```

**Effort:** Low — queue routing config + docker-compose worker split.

---

## Issue 5 — Presigned Upload URLs Are Not Validated After Upload

**Where:** `apps/api/app/routers/audio.py` → `get_upload_url`
and `apps/api/app/services/update_service.py` → `submit_update`

**What:** The flow issues a presigned PUT URL, the browser uploads directly
to Minio/R2, then the client calls `POST /updates` with the `object_key`.
The API trusts that the object at `object_key` exists and is a valid audio
file — it never verifies the upload succeeded before enqueuing the
transcription task.

```python
# Current — object_key accepted without verification
if request.mode == "voice" and request.audio_key:
    update = await repo.create(..., audio_key=request.audio_key, ...)
    process_audio_update.delay(update.id)
```

**Scenarios this breaks:**

1. Client submits `audio_key` for an object that was never uploaded
   (e.g. upload failed silently, client submitted anyway)
2. Client submits a malicious `audio_key` pointing to another user's file
   (cross-user object access — partially mitigated by the key structure
   `audio/{workspace_id}/{user_id}/{hex}` but not enforced server-side)

**Impact:** Low for scenario 1 — the Celery task will fail on `download_fileobj`
and retry/fail gracefully. Moderate for scenario 2 — a user could construct
an `audio_key` pointing to another user's audio file and trigger transcription
of it.

**Fix (pre-public launch):**

Option A — Verify object exists before creating the update:

```python
# In submit_update, before repo.create
storage = StorageRepository()
if not await storage.object_exists(request.audio_key):
    raise UpdateError("audio_not_found", "Audio file not found in storage.")
```

Option B — Validate object key prefix matches the requesting user:

```python
expected_prefix = f"audio/{workspace_id}/{user_id}/"
if not request.audio_key.startswith(expected_prefix):
    raise UpdateError("invalid_audio_key", "Audio key does not match user.")
```

**Recommendation:** Implement Option B immediately (near-zero cost) and
Option A when object verification is worth the storage API call.

**Effort:** Near-zero for Option B. Low for Option A.

---

## Issue 6 — `audio_url` Column Is Unused Dead Code

**Where:** `apps/api/app/models/update.py`

**What:** The `audio_url` column was added to the `Update` model per the
original spec as a potential cache for the public audio URL. In the
current implementation, URLs are always generated on demand via the
playback endpoint — `audio_url` is never written to and is always null.

```python
# Current — column exists but is never written
audio_url: Mapped[str | None] = mapped_column(
    String(500), nullable=True,
    doc="Not stored long-term — pre-signed URLs generated on demand"
)
```

**Impact:** None functional — dead column adds minor schema noise.

**Fix:** Remove the column in a future migration when the schema is next
touched, or leave it as an intentional placeholder for a future URL
caching strategy.

**Effort:** Near-zero (one migration).

---

## Issue 7 — Audio Duration Derived From Client Interval, Not Blob Metadata

**Where:** `apps/api/app/workers/tasks.py` → `_process_audio_update_async`

**What:** `audio_duration_seconds` is derived from a client-side `setInterval`
counter in `VoiceRecorder` — a wall-clock approximation that may diverge by
1-2 seconds from the actual encoded audio duration. faster-whisper returns
the accurate duration via `info.duration` after transcription, but this value
is not written back to the DB.

```python
# Accurate duration available here but discarded
segments, info = model.transcribe(wav_path, ...)
# info.duration = actual audio duration in seconds — not stored
```

**Impact:** Minor — duration shown in `AudioPlayer` may be off by 1-2 seconds.
No functional impact.

**Fix:** Write `info.duration` back to the update record after transcription:

```python
# In _process_audio_update_async, after transcription
await update_repo.update_audio_duration(update, int(info.duration))
```

**Effort:** Low — one repo method + one call in the task.

---

## Issue 8 — R2 Public Endpoint URL Is Environment-Specific With No Validation

**Where:** `apps/api/app/config.py` → `r2_public_endpoint_url`
and `apps/api/app/repositories/storage_repo.py`

**What:** The presigned URL hostname (`r2_public_endpoint_url`) defaults to
`http://localhost:9000` for local development and must be explicitly set to
the actual R2 public URL in production. If misconfigured, presigned URLs
returned to the browser will be unreachable and all audio uploads will fail
silently.

```python
# config.py — must be set correctly per environment, no guard
r2_public_endpoint_url: str = Field(
    default="http://localhost:9000",
    description="Public-facing URL used in presigned URLs returned to the browser.",
)
```

**Impact:** Would be a complete audio upload outage in production if
misconfigured. Not a risk in development where both values are localhost.

**Fix (pre-production deploy):** Add a startup validation that checks
`r2_public_endpoint_url` does not contain `localhost` or `minio` when
`environment == "production"`:

```python
@field_validator("r2_public_endpoint_url", mode="after")
@classmethod
def validate_public_endpoint(cls, v: str, info: ValidationInfo) -> str:
    if info.data.get("environment") == "production":
        if "localhost" in v or "minio" in v:
            raise ValueError("r2_public_endpoint_url must be a public URL in production")
    return v
```

**Effort:** Near-zero — one validator in `config.py`.

---

## Summary Table

| #   | Issue                                          | Impact                        | Fix Milestone  | Effort    |
| --- | ---------------------------------------------- | ----------------------------- | -------------- | --------- |
| 1   | Sync boto3 blocks worker during download       | Low (fast local network)      | Post-M5        | Medium    |
| 2   | Whisper model loaded per worker (~150MB × N)   | Medium (constrained hosts)    | Milestone 5    | Low–High  |
| 3   | No audio file cleanup after transcription      | Low (storage cost over time)  | Milestone 5    | Near-zero |
| 4   | No concurrent transcription cap                | Medium (CPU saturation)       | Milestone 5    | Low       |
| 5   | Upload not verified before task enqueue        | Low–Moderate (trust boundary) | Pre-launch     | Near-zero |
| 6   | `audio_url` column is unused dead code         | None                          | Next migration | Near-zero |
| 7   | Audio duration from interval not blob metadata | Minor (1-2s inaccuracy)       | Milestone 5    | Low       |
| 8   | R2 public endpoint misconfiguration risk       | High if wrong in production   | Pre-production | Near-zero |

---

## Pre-Production Checklist (API items)

```
[ ] Issue 5:  Add audio_key prefix validation in submit_update (Option B)
[ ] Issue 8:  Add production validator for r2_public_endpoint_url in config.py
[ ] Issue 3:  Configure R2 lifecycle policy for audio/ prefix (30-day expiry)
[ ] Issue 4:  Split audio tasks to dedicated queue with --concurrency=2
```
