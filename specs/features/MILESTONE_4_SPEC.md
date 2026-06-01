# SoarUp — Milestone 4: Voice Update Submission

# Branch: feature/milestone-4

# Merges into: develop

# Prerequisites: feature/milestone-3 merged to develop ✅

---

## What This Milestone Delivers

1. Users can record a voice note as their standup update
2. Browser uploads audio directly to Minio/R2 via pre-signed URL
3. Celery worker transcribes audio using self-hosted faster-whisper (base model)
4. Claude summarises the transcript (same pipeline as M3 text updates)
5. Dashboard card shows inline audio player, collapsible transcript, and summary
6. VoiceRecorder component handles all recording states cleanly on mobile + desktop
7. WebSocket events carry transcription progress through the existing M3 architecture
8. Audio playback via short-lived pre-signed GET URLs (fetched on demand)
9. Works across Chrome, Firefox, and mobile Safari with server-side transcoding

---

## Branch Strategy

```
develop
└── feature/milestone-4
    ├── feature/milestone-4-audio-upload        ← pre-signed URL + R2 upload flow ✅ squash merged
    └── feature/milestone-4-stories-and-tests  ← Storybook + unit tests

Merge order:
  feature/milestone-4-audio-upload → feature/milestone-4  ✅ squash merged
  feature/milestone-4-stories-and-tests → feature/milestone-4
  feature/milestone-4 → develop
```

Note: Sub-branches were consolidated during implementation. The transcription
task, voice recorder, voice card, and dashboard integration were all built
directly on `feature/milestone-4` after `feature/milestone-4-audio-upload`
was squash merged. `feature/milestone-4-transcription` and
`feature/milestone-4-voice-card` were not created as separate branches since
the work was tightly coupled to the audio upload changes.

---

## Google Stitch Prompt

```
Design a voice recorder component for SoarUp, an async standup tool.
Use the Electric Atelier design system.

Colors (dark mode): Background #0e0e10, Primary #53ddfc (cyan),
Surface High #1f1f22, On-surface #f9f5f8, Error #ff716c, Amber #fbbf24
Colors (light mode): Background #ebfdfc, Primary #00687a, Surface Lowest #ffffff

Design rules: 0px border radius, asymmetric CTA buttons, Space Grotesk UI,
Newsreader italic headlines, bottom-border-only inputs.

VoiceRecorder component states:

1. IDLE state:
   - Large circular record button (primary cyan fill, mic icon centred)
   - Asymmetric shape for the outer container card
   - Label below: "TAP TO RECORD" (10px uppercase Space Grotesk)
   - Subtle dot-grid texture on card background

2. RECORDING state:
   - Same circular button but now shows a red square stop icon
   - Pulsing red ring animation around the button
   - Live duration counter below: "0:42" (monospace, large)
   - Audio waveform visualisation (animated bars, cyan colour)
   - "RECORDING" label pulsing in red (10px uppercase)

3. PREVIEW state (after stopping):
   - Native audio player styled with Electric Atelier tokens
     (play/pause button, scrub bar in cyan, time display)
   - Duration shown: "1:47"
   - Two CTAs side by side:
     "Submit update →" (primary asymmetric button)
     "Re-record" (ghost/secondary button)
   - Option to add text note alongside the voice update (optional)

4. UPLOADING state:
   - Progress bar (cyan fill, animated) showing upload percentage
   - "Uploading... 67%" label
   - CTAs disabled

5. ERROR state:
   - Red border on card
   - Error message below (e.g. "Microphone permission denied",
     "File too large", "Upload failed — tap to retry")
   - Retry button (ghost variant)

Dashboard UpdateCard — voice variant:
- Same card structure as text variant
- Audio player row: [▶] [──────────────] [1:47] replacing the text content
- "VOICE UPDATE" badge in outline style next to timestamp
- [Transcript ▾] collapsible section (Space Grotesk, smaller text)
- [Summary ▾] collapsible section (Newsreader italic, cyan left border)
- Status badge same as text variant: Processing... / Summarised / Failed
```

---

## Existing Stack Reference

### Backend

- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local, port 54322)
- Alembic migrations
- Structlog logging
- Redis (port 6379 dev, 6380 test) — Celery broker + broadcaster pub/sub
- Celery worker — process_update task wired ✅
- broadcaster — WebSocket pub/sub ✅
- Minio (local dev, port 9000) / Cloudflare R2 (production)
- StorageRepository — upload_file, delete_file, get_presigned_url ✅
- pytest + pytest-asyncio, conftest.py fixtures available

### Frontend

- Next.js 14 App Router, TypeScript
- Tailwind CSS + Electric Atelier CSS variable token system
- @tanstack/react-query v5 — all data fetching
- Zustand + persist — auth state, WebSocket connection state ✅
- WebSocket registry (subscribe/dispatch) ✅
- useWebSocket hook — exponential backoff reconnect ✅
- Vitest + React Testing Library
- Playwright (E2E deferred to post-major-milestones)

### Design tokens

```
text-on-surface, text-on-surface-variant, text-outline
bg-surface, bg-surface-high, bg-surface-highest, bg-container
text-primary, bg-primary-container, text-primary-on-container
text-error, bg-error-container, border-error
border-outline-variant, border-outline
shadow-electric, shadow-electric-sm
animation: pulse-slow (defined in tailwind.config.ts)
```

### Established WebSocket event types (from M3 events.py)

```python
EVENT_TYPES = {
    "update.status_changed",           # M3 ✅
    "audio.transcription_started",     # M4 — implement now
    "audio.transcription_complete",    # M4 — implement now
    "audio.transcription_failed",      # M4 — implement now
    "member.update_submitted",         # M5 reserved
    "member.joined",                   # M5 reserved
    "member.left",                     # M5 reserved
}
```

### React Query cache keys

```typescript
updateKeys.byDate(workspaceId, date); // ['updates', workspaceId, date]
workspaceKeys.mine(); // ['workspace', 'mine']
```

### conftest.py fixtures

```python
db_session, api_client, client_with_mocks, unauthenticated_client
make_jwt(user_id, email), auth_headers(user_id)
test_user_id, seeded_profile, workspace_repo
login_response(), profile_response()
```

---

## Audio Pipeline Overview

```
Browser records audio (MediaRecorder API)
       ↓
VoiceRecorder component accumulates Blob chunks
       ↓
On stop: single Blob created (WebM/Opus Chrome, MP4/AAC Safari)
       ↓
1. POST /workspaces/:id/audio/upload-url
   → FastAPI returns pre-signed PUT URL + object_key
       ↓
2. Browser PUT directly to Minio/R2 pre-signed URL
   → No audio data touches the FastAPI server
       ↓
3. POST /workspaces/:id/updates (mode: "voice", audio_key: object_key)
   → Update record created (status: "pending")
   → process_audio_update.delay(update_id) enqueued
       ↓
Celery worker:
4. Fetch audio from Minio/R2 by object_key
5. Transcode to WAV/16kHz mono using ffmpeg (via pydub)
6. Publish audio.transcription_started event
7. Transcribe with faster-whisper (base model)
8. Store transcript, publish audio.transcription_complete
9. Build Claude prompt with transcript text
10. Summarise with Claude (Haiku → Sonnet fallback)
11. Store summary, set status → "processed"
12. Publish update.status_changed (processed)
       ↓
Frontend receives WebSocket events
Updates React Query cache at each stage
UpdateCard shows live progress
```

---

## Backend — Build Order

### Step 1: Update Model — Audio Fields

```python
# apps/api/app/models/update.py — add to existing Update model

# Audio fields — populated for mode="voice", null for mode="text"
audio_key: Mapped[str | None] = mapped_column(
    String(500), nullable=True,
    doc="Minio/R2 object key for the original audio file"
)
audio_url: Mapped[str | None] = mapped_column(
    String(500), nullable=True,
    doc="Cached public URL — NOT stored long-term, "
        "pre-signed URLs generated on demand"
)
audio_duration_seconds: Mapped[int | None] = mapped_column(
    nullable=True,
    doc="Audio duration in seconds — stored on upload, "
        "shown in card without re-fetching"
)
```

Alembic migration:

```bash
docker compose exec api alembic revision --autogenerate -m "add_audio_fields_to_updates"
docker compose exec api alembic upgrade head
```

⚠️ All three columns are nullable — no `server_default` needed.

Add `get_presigned_url` to StorageRepository if not already there
(it exists in the original spec — verify in your codebase):

```python
async def get_presigned_url(
    self,
    object_key: str,
    expires_in: int = 900,  # 15 minutes
) -> str:
    """Generate a short-lived pre-signed GET URL for audio playback."""
    ...
```

---

### Step 2: Schemas — Audio

```python
# apps/api/app/schemas/audio.py

from pydantic import BaseModel, Field


class PresignedUploadUrlRequest(BaseModel):
    """Request schema for POST /workspaces/:id/audio/upload-url"""
    content_type: str = Field(
        ...,
        description="MIME type of the audio file from the browser. "
                    "e.g. audio/webm, audio/mp4, audio/ogg",
        examples=["audio/webm", "audio/mp4"],
    )
    file_size_bytes: int = Field(
        ...,
        gt=0,
        le=10 * 1024 * 1024,  # 10MB max
        description="File size in bytes — validated before issuing URL",
    )


class PresignedUploadUrlResponse(BaseModel):
    """Response schema for POST /workspaces/:id/audio/upload-url"""
    upload_url: str = Field(..., description="Pre-signed PUT URL for direct browser upload")
    object_key: str = Field(..., description="R2/Minio object key — pass to submit update")
    expires_in: int = Field(default=900, description="URL expiry in seconds (15 minutes)")


class AudioPlaybackUrlResponse(BaseModel):
    """Response for GET /workspaces/:id/updates/:update_id/audio"""
    playback_url: str = Field(..., description="Pre-signed GET URL for audio playback")
    expires_in: int = Field(default=900, description="URL expiry in seconds")
    duration_seconds: int | None = Field(None)
```

Update `SubmitUpdateRequest` in `schemas/update.py`:

```python
class SubmitUpdateRequest(BaseModel):
    content: str = Field(default="", max_length=1000)
    # content is now optional for voice updates — transcript fills it later
    mode: str = Field(default="text")
    update_date: str = Field(..., description="ISO date YYYY-MM-DD")
    audio_key: str | None = Field(
        None,
        description="R2/Minio object key from pre-signed upload. "
                    "Required when mode='voice'.",
    )
    audio_duration_seconds: int | None = Field(None, gt=0, le=600)

    @model_validator(mode="after")
    def validate_voice_fields(self) -> "SubmitUpdateRequest":
        if self.mode == "voice" and not self.audio_key:
            raise ValueError("audio_key is required for voice updates")
        if self.mode == "text" and not self.content:
            raise ValueError("content is required for text updates")
        return self
```

Update `UpdateResponse` in `schemas/update.py`:

```python
class UpdateResponse(BaseModel):
    ...  # existing fields unchanged
    audio_duration_seconds: int | None = None
    # Note: no audio_key or audio_url in the response —
    # audio URLs are generated on demand via GET /audio endpoint
    # to avoid storing long-lived URLs in the client
```

---

### Step 3: Audio Router

```python
# apps/api/app/routers/audio.py

import uuid
import structlog
from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep, DBSessionDep, OnboardedDep,
    create_error_response, create_success_response,
)
from app.config import settings
from app.repositories.storage_repo import StorageRepository
from app.repositories.update_repo import UpdateRepository
from app.schemas.audio import (
    PresignedUploadUrlRequest,
    PresignedUploadUrlResponse,
    AudioPlaybackUrlResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/workspaces", tags=["audio"])

ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/webm",           # Chrome, Firefox (WebM/Opus)
    "audio/mp4",            # Safari (MP4/AAC)
    "audio/ogg",            # Firefox (Ogg/Opus)
    "audio/mpeg",           # MP3 fallback
    "audio/wav",            # WAV fallback
    "audio/webm;codecs=opus",
}

MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024  # 10MB


@router.post("/{workspace_id}/audio/upload-url", status_code=200)
async def get_upload_url(
    workspace_id: str,
    request: PresignedUploadUrlRequest,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
) -> Response:
    """
    Issue a pre-signed PUT URL for direct browser-to-storage upload.
    Validates content type and file size before issuing the URL.
    """
    # Normalise content type — strip codec parameters for validation
    base_content_type = request.content_type.split(";")[0].strip()

    if base_content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        return create_error_response(
            error_code="invalid_audio_format",
            message=f"Audio format '{base_content_type}' is not supported.",
            status_code=400,
            details={"allowed_types": list(ALLOWED_AUDIO_CONTENT_TYPES)},
            api_version=api_version,
        )

    if request.file_size_bytes > MAX_AUDIO_SIZE_BYTES:
        return create_error_response(
            error_code="audio_too_large",
            message="Audio file must be under 10MB.",
            status_code=413,
            api_version=api_version,
        )

    # Generate unique object key
    ext_map = {
        "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg",
        "audio/mpeg": "mp3", "audio/wav": "wav",
    }
    ext = ext_map.get(base_content_type, "bin")
    object_key = f"audio/{workspace_id}/{user_ctx['user_id']}/{uuid.uuid4().hex}.{ext}"

    try:
        storage = StorageRepository()
        upload_url = await storage.get_presigned_upload_url(
            object_key=object_key,
            content_type=request.content_type,
            expires_in=900,
        )
    except Exception as e:
        logger.exception("presigned_url_error", workspace_id=workspace_id, error=str(e))
        return create_error_response(
            error_code="storage_error",
            message="Could not generate upload URL. Please try again.",
            status_code=500,
            api_version=api_version,
        )

    logger.info(
        "presigned_upload_url_issued",
        workspace_id=workspace_id,
        user_id=user_ctx["user_id"],
        object_key=object_key,
    )

    return create_success_response(
        PresignedUploadUrlResponse(
            upload_url=upload_url,
            object_key=object_key,
            expires_in=900,
        ),
        api_version=api_version,
    )


@router.get("/{workspace_id}/updates/{update_id}/audio", status_code=200)
async def get_audio_playback_url(
    workspace_id: str,
    update_id: str,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> Response:
    """
    Generate a short-lived pre-signed GET URL for audio playback.
    URL expires in 15 minutes — client requests fresh URL per play session.
    """
    update_repo = UpdateRepository.from_session(db)
    update = await update_repo.get_by_id(update_id)

    if not update or update.workspace_id != workspace_id:
        return create_error_response(
            "update_not_found", "Update not found.", 404, api_version=api_version,
        )

    if not update.audio_key:
        return create_error_response(
            "no_audio", "This update has no audio file.", 404, api_version=api_version,
        )

    try:
        storage = StorageRepository()
        playback_url = await storage.get_presigned_url(
            file_key=update.audio_key,
            expires_in=900,
        )
    except Exception as e:
        logger.exception("playback_url_error", update_id=update_id, error=str(e))
        return create_error_response(
            "storage_error", "Could not generate playback URL.", 500,
            api_version=api_version,
        )

    return create_success_response(
        AudioPlaybackUrlResponse(
            playback_url=playback_url,
            expires_in=900,
            duration_seconds=update.audio_duration_seconds,
        ),
        api_version=api_version,
    )
```

Add `get_presigned_upload_url` to `StorageRepository`:

```python
async def get_presigned_upload_url(
    self,
    object_key: str,
    content_type: str,
    expires_in: int = 900,
) -> str:
    """Generate a pre-signed PUT URL for direct browser upload."""
    async with self.session.client(
        "s3",
        endpoint_url=self.endpoint_url,
        aws_access_key_id=self.access_key,
        aws_secret_access_key=self.secret_key,
        region_name=self.region_name,
    ) as client:
        return await client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )
```

Register in `main.py`:

```python
from app.routers import audio
app.include_router(audio.router, prefix="/api/v1")
```

---

### Step 4: faster-whisper Setup

Add to `requirements.txt`:

```
faster-whisper>=1.0.0
pydub>=0.25.1
```

Add to `Dockerfile` (apps/api/Dockerfile) — install ffmpeg:

```dockerfile
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
```

Model pre-download script (run on container startup):

```python
# apps/api/app/workers/whisper_setup.py
"""
Pre-download the faster-whisper model on worker startup.
Prevents cold-start latency on first transcription.
Model is cached to /tmp/whisper-models (or a mounted volume in production).
"""
import os
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")
MODEL_CACHE_DIR = os.getenv("WHISPER_MODEL_CACHE", "/tmp/whisper-models")


def ensure_model_downloaded() -> WhisperModel:
    """Load (and cache) the Whisper model. Call once on worker startup."""
    model = WhisperModel(
        MODEL_SIZE,
        device="cpu",
        compute_type="int8",   # int8 quantisation — 2x faster on CPU, minimal accuracy loss
        download_root=MODEL_CACHE_DIR,
    )
    return model


# Module-level singleton — loaded once per worker process
_model: WhisperModel | None = None


def get_whisper_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = ensure_model_downloaded()
    return _model
```

Add `WHISPER_MODEL_SIZE` and `WHISPER_MODEL_CACHE` to `config.py`:

```python
whisper_model_size: str = Field(default="base", description="faster-whisper model size")
whisper_model_cache: str = Field(default="/tmp/whisper-models", description="Model cache directory")
```

---

### Step 5: Transcription Task

```python
# apps/api/app/workers/tasks.py — add process_audio_update task

@celery_app.task(
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.process_audio_update",
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    acks_late=True,
)  # type: ignore[misc]
def process_audio_update(self, update_id: str) -> None:
    """
    Process a voice update through the transcription + summarisation pipeline.

    Flow:
    1. Fetch update + workspace from DB
    2. Download audio from Minio/R2
    3. Transcode to WAV/16kHz mono via ffmpeg
    4. Publish audio.transcription_started
    5. Transcribe with faster-whisper
    6. Store transcript, publish audio.transcription_complete
    7. Summarise transcript with Claude (same as text pipeline)
    8. Store summary, set status → "processed"
    9. Publish update.status_changed (processed)
    """
    asyncio.run(_process_audio_update_async(self, update_id))


async def _process_audio_update_async(
    task: ProcessUpdateTask, update_id: str
) -> None:
    import io
    import tempfile

    import boto3
    from pydub import AudioSegment

    from app.lib.claude import summarise
    from app.lib.events import publish_event
    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_summarisation_prompt
    from app.workers.whisper_setup import get_whisper_model

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        update_repo = UpdateRepository.from_session(db)
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        update = await update_repo.get_by_id(update_id)
        if not update or not update.audio_key:
            logger.warning(
                "process_audio_skipped",
                update_id=update_id,
                reason="not_found_or_no_audio",
            )
            return

        workspace = await workspace_repo.get_by_id(update.workspace_id)
        profile = await profile_repo.get_by_user_id(update.user_id)

        await update_repo.update_status(update, "processing")

        # 1. Download audio from Minio/R2
        # Use sync boto3 here — aioboto3 adds complexity in asyncio.run context
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id.get_secret_value()
                if settings.r2_access_key_id else "",
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value()
                if settings.r2_secret_access_key else "",
            region_name="auto",
        )
        audio_buffer = io.BytesIO()
        s3.download_fileobj(settings.r2_bucket_name, update.audio_key, audio_buffer)
        audio_buffer.seek(0)

        # 2. Transcode to WAV/16kHz mono via pydub + ffmpeg
        # Normalises format differences between Chrome (WebM) and Safari (MP4)
        try:
            audio = AudioSegment.from_file(audio_buffer)
            audio = audio.set_frame_rate(16000).set_channels(1)

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                audio.export(tmp.name, format="wav")
                wav_path = tmp.name
        except Exception as e:
            logger.error("audio_transcode_failed", update_id=update_id, error=str(e))
            raise

        # 3. Publish transcription started
        await publish_event(
            task.redis,
            "audio.transcription_started",
            update.workspace_id,
            {
                "update_id": update_id,
                "workspace_id": update.workspace_id,
                "update_date": update.update_date,
            },
        )

        # 4. Transcribe
        try:
            model = get_whisper_model()
            segments, info = model.transcribe(
                wav_path,
                language=None,     # auto-detect language
                beam_size=5,
                vad_filter=True,   # Voice Activity Detection — skips silence
                vad_parameters={"min_silence_duration_ms": 500},
            )
            transcript = " ".join(seg.text.strip() for seg in segments).strip()

            logger.info(
                "transcription_complete",
                update_id=update_id,
                duration=info.duration,
                language=info.language,
                language_probability=info.language_probability,
                transcript_length=len(transcript),
            )
        except Exception as e:
            logger.error("transcription_failed", update_id=update_id, error=str(e))
            await publish_event(
                task.redis,
                "audio.transcription_failed",
                update.workspace_id,
                {"update_id": update_id, "workspace_id": update.workspace_id,
                 "update_date": update.update_date},
            )
            raise

        # 5. Store transcript, publish complete
        await update_repo.update_transcript(update, transcript)
        await publish_event(
            task.redis,
            "audio.transcription_complete",
            update.workspace_id,
            {
                "update_id": update_id,
                "workspace_id": update.workspace_id,
                "update_date": update.update_date,
                "transcript": transcript,
            },
        )

        # 6. Summarise transcript with Claude (same pipeline as text)
        use_fallback = task.request.retries > 0
        prompt = build_summarisation_prompt(
            content=transcript,
            author_name=profile.full_name if profile else "the user",
            update_date=update.update_date,
            custom_prompt=workspace.summarisation_prompt if workspace else None,
        )

        try:
            summary = await summarise(prompt, use_fallback=use_fallback)
            await update_repo.update_status(update, "processed", summary=summary)
            await publish_event(
                task.redis,
                "update.status_changed",
                update.workspace_id,
                {
                    "update_id": update_id,
                    "workspace_id": update.workspace_id,
                    "update_date": update.update_date,
                    "status": "processed",
                    "summary": summary,
                },
            )
        except Exception as exc:
            if task.request.retries >= task.max_retries:
                await update_repo.update_status(update, "failed")
                await publish_event(
                    task.redis,
                    "update.status_changed",
                    update.workspace_id,
                    {"update_id": update_id, "workspace_id": update.workspace_id,
                     "update_date": update.update_date, "status": "failed", "summary": None},
                )
            raise exc
```

Add `update_transcript` to `UpdateRepository`:

```python
async def update_transcript(self, update: Update, transcript: str) -> Update:
    """Store transcript text (voice updates only)."""
    update.transcript = transcript
    update.content = transcript  # content = transcript for voice updates
    await self.db.commit()
    await self.db.refresh(update)
    return update
```

Wire in `UpdateService.submit_update`:

```python
if request.mode == "voice" and request.audio_key:
    update = await repo.create(
        workspace_id=workspace_id, user_id=user_id,
        content="",  # filled by transcription
        update_date=request.update_date, mode="voice",
        audio_key=request.audio_key,
        audio_duration_seconds=request.audio_duration_seconds,
    )
    process_audio_update.delay(update.id)
else:
    update = await repo.create(...)
    process_update.delay(update.id)
```

Update `UpdateRepository.create` signature:

```python
async def create(
    self, workspace_id, user_id, content, update_date,
    mode="text", audio_key=None, audio_duration_seconds=None,
) -> Update:
```

---

## Frontend — Build Order

### Step 1: WebSocket Payload Types (M4 additions)

```typescript
// apps/web/src/lib/websocket/types.ts — add

export interface AudioTranscriptionStartedPayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
}

export interface AudioTranscriptionCompletePayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
  transcript: string;
}

export interface AudioTranscriptionFailedPayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
}
```

---

### Step 2: Audio API Hooks

```typescript
// apps/web/src/hooks/useAudio.ts

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/hooks/useAuth";

interface PresignedUploadResponse {
  upload_url: string;
  object_key: string;
  expires_in: number;
}

interface AudioPlaybackResponse {
  playback_url: string;
  expires_in: number;
  duration_seconds: number | null;
}

export const audioKeys = {
  playback: (workspaceId: string, updateId: string) =>
    ["audio", "playback", workspaceId, updateId] as const,
};

// Request a pre-signed upload URL before recording starts
export function useRequestUploadUrl(workspaceId: string) {
  const { tokens } = useAuth();
  return useMutation({
    mutationFn: (data: { content_type: string; file_size_bytes: number }) =>
      apiClient.post<PresignedUploadResponse>(
        `/workspaces/${workspaceId}/audio/upload-url`,
        data,
        tokens?.access_token,
      ),
  });
}

// Upload audio blob directly to Minio/R2 via pre-signed PUT URL
// This bypasses the FastAPI server entirely — no token needed
export async function uploadAudioBlob(
  uploadUrl: string,
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", blob.type);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
}

// Fetch a short-lived playback URL on demand (not cached long-term)
export function useAudioPlaybackUrl(
  workspaceId: string,
  updateId: string,
  enabled: boolean = false,
) {
  const { tokens } = useAuth();
  return useQuery({
    queryKey: audioKeys.playback(workspaceId, updateId),
    queryFn: () =>
      apiClient.get<AudioPlaybackResponse>(
        `/workspaces/${workspaceId}/updates/${updateId}/audio`,
        tokens?.access_token,
      ),
    enabled: enabled && !!tokens?.access_token,
    staleTime: 10 * 60 * 1000, // 10 minutes — expires before the 15-min URL
    gcTime: 15 * 60 * 1000, // Remove from cache at 15 minutes
  });
}
```

---

### Step 3: useDashboardUpdates — M4 Handlers

```typescript
// apps/web/src/hooks/useDashboardUpdates.ts — add M4 event handlers

import type {
  UpdateStatusChangedPayload,
  AudioTranscriptionCompletePayload,
} from "@/lib/websocket/types";

// Inside useDashboardUpdates hook, alongside existing update.status_changed handler:

// Handle transcription complete — update transcript in cache
const unsubTranscriptComplete = subscribe<AudioTranscriptionCompletePayload>(
  "audio.transcription_complete",
  (payload) => {
    if (payload.workspace_id !== workspaceId) return;
    queryClient.setQueryData<UpdateListCache>(
      updateKeys.byDate(workspaceId, payload.update_date),
      (old) => {
        if (!old) return old;
        return {
          ...old,
          updates: old.updates.map((u) =>
            u.id === payload.update_id
              ? { ...u, transcript: payload.transcript }
              : u,
          ),
        };
      },
    );
  },
);

// Return all unsubscribes in cleanup
return () => {
  unsubStatusChanged();
  unsubTranscriptComplete();
};
```

---

### Step 4: VoiceRecorder Component

```typescript
// apps/web/src/components/domain/updates/voice-recorder.tsx

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

// Recording state machine
type RecorderState =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "preview"
  | "uploading"
  | "error";

interface VoiceRecorderProps {
  workspaceId: string;
  updateDate: string;
  onSuccess: (audioKey: string, durationSeconds: number, blob: Blob) => void;
  onCancel: () => void;
}

const MAX_DURATION_SECONDS = 300; // 5 minutes
const SUPPORTED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function getSupportedMimeType(): string {
  for (const type of SUPPORTED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm"; // fallback
}

export function VoiceRecorder({
  workspaceId,
  updateDate,
  onSuccess,
  onCancel,
}: VoiceRecorderProps) {
  const [recorderState, setRecorderState] =
    React.useState<RecorderState>("idle");
  const [duration, setDuration] = React.useState(0);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const durationIntervalRef = React.useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  // Clean up object URLs and streams on unmount
  React.useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      durationIntervalRef.current && clearInterval(durationIntervalRef.current);
    };
  }, [audioUrl]);

  async function startRecording() {
    setError(null);
    setRecorderState("requesting_permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecorderState("preview");
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100); // collect chunks every 100ms
      setRecorderState("recording");
      setDuration(0);

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= MAX_DURATION_SECONDS) {
            stopRecording();
            return d;
          }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access and try again."
          : "Could not access microphone. Please check your device settings.";
      setError(message);
      setRecorderState("error");
    }
  }

  function stopRecording() {
    durationIntervalRef.current && clearInterval(durationIntervalRef.current);
    mediaRecorderRef.current?.stop();
  }

  function reRecord() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    setRecorderState("idle");
  }

  async function handleSubmit() {
    if (!audioBlob) return;
    setRecorderState("uploading");
    setUploadProgress(0);

    try {
      // 1. Request pre-signed URL
      const { useRequestUploadUrl, uploadAudioBlob } =
        await import("@/hooks/useAudio");
      // Note: can't call hooks inside async function — pre-request the URL
      // by passing the mutation function down as a prop instead.
      // See implementation note below.
    } catch (err) {
      setError("Upload failed. Please try again.");
      setRecorderState("error");
    }
  }

  // ... render logic per state
}
```

**Implementation note on upload flow:**
The `useRequestUploadUrl` mutation cannot be called inside `handleSubmit` (async function). The correct pattern is to call `useMutation` at the component level and pass `mutateAsync` into the submit handler:

```typescript
// Inside VoiceRecorder component (at hook level):
const requestUploadUrlMutation = useRequestUploadUrl(workspaceId);
const submitUpdateMutation = useSubmitUpdate(workspaceId);

async function handleSubmit() {
  if (!audioBlob) return;
  setRecorderState("uploading");

  try {
    // 1. Get pre-signed upload URL
    const { upload_url, object_key } =
      await requestUploadUrlMutation.mutateAsync({
        content_type: audioBlob.type,
        file_size_bytes: audioBlob.size,
      });

    // 2. Upload directly to Minio/R2
    await uploadAudioBlob(upload_url, audioBlob, setUploadProgress);

    // 3. Notify success — parent creates the update record
    onSuccess(object_key, duration, audioBlob);
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Upload failed. Please try again.",
    );
    setRecorderState("error");
  }
}
```

The `onSuccess` callback in the dashboard page then calls `submitUpdateMutation.mutateAsync`:

```typescript
// In dashboard/page.tsx or DashboardView:
async function handleVoiceSuccess(
  audioKey: string,
  durationSeconds: number,
  _blob: Blob,
) {
  await submitUpdateMutation.mutateAsync({
    content: "",
    mode: "voice",
    update_date: today,
    audio_key: audioKey,
    audio_duration_seconds: durationSeconds,
  });
  setShowVoiceRecorder(false);
}
```

---

### Step 5: AudioPlayer Component

```typescript
// apps/web/src/components/ui/audio-player.tsx
// Custom-styled wrapper around the native HTML audio element.
// Fetches a fresh pre-signed URL on mount via useAudioPlaybackUrl.

"use client";

import * as React from "react";
import { useAudioPlaybackUrl } from "@/hooks/useAudio";
import { cn } from "@/lib/utils/cn";

interface AudioPlayerProps {
  workspaceId: string;
  updateId: string;
  durationSeconds?: number | null;
  className?: string;
}

export function AudioPlayer({
  workspaceId,
  updateId,
  durationSeconds,
  className,
}: AudioPlayerProps) {
  const [isActive, setIsActive] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  // Only fetch playback URL when user activates the player
  const { data, isLoading, error } = useAudioPlaybackUrl(
    workspaceId,
    updateId,
    isActive,
  );

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        onClick={() => setIsActive(true)}
        className="w-8 h-8 rounded-full bg-primary-container text-primary-on-container
                   flex items-center justify-center hover:brightness-105 transition-all"
        aria-label="Play audio update"
      >
        <span
          className="material-symbols-outlined text-[16px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          play_arrow
        </span>
      </button>

      {isActive && data?.playback_url ? (
        <audio
          ref={audioRef}
          src={data.playback_url}
          controls
          autoPlay
          className="flex-1 h-8"
          style={{ colorScheme: "dark" }}
        />
      ) : (
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-0.5 bg-outline-variant" />
          {durationSeconds && (
            <span className="font-label text-[10px] text-outline tabular-nums">
              {formatDuration(durationSeconds)}
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <span className="font-label text-[10px] text-outline">Loading...</span>
      )}
    </div>
  );
}
```

---

### Step 6: UpdateCard — Voice Variant

Add to existing `UpdateCard` component:

```tsx
// Render audio player for voice updates
{
  update.mode === "voice" && update.audio_duration_seconds && (
    <AudioPlayer
      workspaceId={update.workspace_id}
      updateId={update.id}
      durationSeconds={update.audio_duration_seconds}
      className="mt-2"
    />
  );
}

// Collapsible transcript section
{
  update.mode === "voice" && update.transcript && (
    <CollapsibleSection label="Transcript" defaultOpen={false}>
      <p className="font-body text-sm text-on-surface-variant leading-relaxed">
        {update.transcript}
      </p>
    </CollapsibleSection>
  );
}

// Collapsible summary section (already exists for text, now also for voice)
{
  update.summary && (
    <CollapsibleSection label="Summary" defaultOpen={update.mode === "text"}>
      <p
        className="font-headline italic text-sm text-on-surface-variant
                  leading-relaxed pl-3 border-l-2 border-primary-container"
      >
        {update.summary}
      </p>
    </CollapsibleSection>
  );
}
```

Add `CollapsibleSection` as a small local component within `update-card.tsx`:

```typescript
function CollapsibleSection({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] font-label uppercase
                   tracking-[0.15em] text-outline hover:text-on-surface transition-colors"
      >
        <span
          className="material-symbols-outlined text-[14px] transition-transform"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          expand_more
        </span>
        {label}
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
}
```

---

### Step 7: Dashboard Page — Voice Mode Toggle

```typescript
// apps/web/src/app/(app)/dashboard/page.tsx — additions

const [updateMode, setUpdateMode] = React.useState<"text" | "voice">("text");
const [showVoiceRecorder, setShowVoiceRecorder] = React.useState(false);

// Mode toggle shown before the form
{!hasSubmittedToday && !showForm && !showVoiceRecorder && (
  <div className="flex items-center gap-2">
    <Button variant="primary" asymmetric onClick={() => setShowForm(true)}>
      Submit update
      <span className="material-symbols-outlined text-[18px]">keyboard</span>
    </Button>
    <Button variant="secondary" onClick={() => setShowVoiceRecorder(true)}>
      <span className="material-symbols-outlined text-[18px]">mic</span>
      Voice note
    </Button>
  </div>
)}

{showVoiceRecorder && !hasSubmittedToday && (
  <VoiceRecorder
    workspaceId={workspace?.id ?? ""}
    updateDate={today}
    onSuccess={handleVoiceSuccess}
    onCancel={() => setShowVoiceRecorder(false)}
  />
)}
```

---

## Storybook Stories

```
src/stories/domain/VoiceRecorder.stories.tsx
  ← Idle, Recording, Preview, Uploading (progress 0/50/100), Error states
  ← MicPermissionDenied error state
  ← MaxDurationReached state

src/stories/ui/AudioPlayer.stories.tsx
  ← Inactive (shows scrub bar with duration)
  ← Active (audio element shown)
  ← LoadingUrl state

src/stories/domain/UpdateCard.stories.tsx   ← add voice variants
  ← VoiceUpdatePending
  ← VoiceUpdateTranscribing
  ← VoiceUpdateSummarised (shows transcript + summary collapsibles)
  ← VoiceUpdateFailed
```

---

## Unit Tests

### Backend

```
tests/unit/test_audio_router.py
  ← POST upload-url: valid request → 200 + url + object_key
  ← POST upload-url: invalid content type → 400
  ← POST upload-url: file too large → 413
  ← POST upload-url: storage error → 500
  ← GET audio: valid update → 200 + playback_url
  ← GET audio: update not found → 404
  ← GET audio: no audio_key → 404
  ← GET audio: 401 without token

tests/unit/test_process_audio_task.py
  ← happy path: pending → processing → transcribed → processed
  ← transcription failure → retried → failed after max_retries
  ← missing audio_key → early return
  ← custom workspace prompt used in summarisation
  ← audio.transcription_started event published before transcription
  ← audio.transcription_complete event published with transcript
  ← update.status_changed published with summary on success
```

### Frontend

```
hooks/useAudio.test.ts
  ← useRequestUploadUrl calls correct endpoint
  ← useAudioPlaybackUrl only fetches when enabled=true
  ← staleTime prevents immediate refetch

components/VoiceRecorder.test.tsx
  ← renders idle state
  ← permission denied shows error state
  ← stop button ends recording and shows preview
  ← re-record returns to idle
  ← upload progress updates during submit

components/AudioPlayer.test.tsx
  ← shows duration before activation
  ← fetches playback URL on activation
  ← renders audio element with src when URL available
```

---

## Known Tradeoffs

**1. Sync boto3 in async Celery task**
The audio download uses sync `boto3.download_fileobj` inside `asyncio.run()`.
This blocks the event loop during download. Acceptable for M4 — the task
runs in a dedicated Celery process, not in the FastAPI event loop.
Replace with `aioboto3` when moving to a proper async task runner.

**2. Whisper model loaded per worker process**
The `base` model is ~150MB. With 4 Celery worker processes, that's ~600MB
resident memory. Monitor with `docker stats`. Reduce to `tiny` model if
memory is constrained in staging/production. Add `WHISPER_MODEL_SIZE=tiny`
env override.

**3. Token in pre-signed PUT URL**
The pre-signed PUT URL is generated with the R2/Minio access key — no
user token in it. This means any client that obtains the URL can upload
to that object key. Mitigation: short expiry (15 minutes), one-use pattern
(key includes user UUID + random hex). Acceptable tradeoff for direct upload.

**4. No waveform visualisation**
The Stitch prompt includes an animated waveform during recording.
Accurate waveforms require Web Audio API (`AnalyserNode`) — complex and
adds significant component weight. Use a simplified animated bars
visualisation instead (CSS animation, not real audio data).
Real waveform deferred to post-M9 polish.

**5. Transcript stored as `content`**
Voice updates set `content = transcript` after transcription so all
existing queries that read `content` work without changes. This means
`content` is empty string until transcription completes — the dashboard
shows a placeholder until the WebSocket event arrives.

---

## Acceptance Criteria

```
[x] User can record a voice update on desktop Chrome, Firefox, Safari
[ ] User can record a voice update on mobile Chrome and mobile Safari (deferred — needs device testing)
[x] Max recording duration is 5 minutes (enforced client-side)
[x] Microphone permission denied shows clear error message
[x] Preview state lets user replay before submitting
[x] Re-record discards current recording and returns to idle
[x] Upload progress shown during R2 upload
[x] File too large (>10MB) rejected by API schema validation
[x] Unsupported audio format rejected with 400 from API
[x] Voice update card shows audio player
[x] Audio player fetches pre-signed URL on demand (not on card render)
[x] Transcript shown in collapsible section after transcription
[x] Summary shown in collapsible section after Claude processing
[x] Status transitions visible in real time via WebSocket
[x] audio.transcription_started event published before transcription
[x] audio.transcription_complete event updates transcript in React Query cache
[x] Haiku used for summary, Sonnet on retry
[x] Failed transcription shows Failed badge after 3 retries
[x] Backend unit tests pass for audio router + transcription task
[x] Frontend unit tests pass for VoiceRecorder + AudioPlayer + hooks
[x] Storybook stories added for all new components and states
[x] Scaling debt documented in specs/scaling/api/voice_pipeline.md
[x] Scaling debt documented in specs/scaling/web/voice_recorder.md
[ ] CI passes on feature/milestone-4 branch (pending final merge)
```

---

## Files To Create Summary

### Backend (apps/api/)

```
app/schemas/audio.py
app/routers/audio.py
app/workers/whisper_setup.py
alembic/versions/YYYYMMDD_*_add_audio_fields_to_updates.py
tests/unit/test_audio_router.py
tests/unit/test_process_audio_task.py
```

### Frontend (apps/web/src/)

```
hooks/useAudio.ts
components/domain/updates/voice-recorder.tsx
components/ui/audio-player.tsx
stories/domain/VoiceRecorder.stories.tsx
stories/ui/AudioPlayer.stories.tsx
tests/unit/useAudio.test.ts
tests/unit/VoiceRecorder.test.tsx
tests/unit/AudioPlayer.test.tsx
```

### Updated files

```
apps/api/app/models/update.py           ← +audio_key, +audio_url, +audio_duration_seconds
apps/api/app/schemas/update.py          ← SubmitUpdateRequest +audio_key, +audio_duration_seconds
                                           UpdateResponse +audio_duration_seconds, +transcript
apps/api/app/repositories/update_repo.py ← +update_transcript, create() +audio fields
apps/api/app/services/update_service.py ← voice branch in submit_update, _to_response fix
apps/api/app/workers/tasks.py           ← +process_audio_update task, +NullPool, +structlog
apps/api/app/repositories/storage_repo.py ← +get_presigned_upload_url, r2_public_endpoint_url
apps/api/app/config.py                  ← +whisper_model_size, +whisper_model_cache,
                                           +r2_public_endpoint_url
apps/api/app/main.py                    ← +audio router
apps/api/requirements.txt               ← +faster-whisper, +pydub
apps/api/Dockerfile                     ← +ffmpeg apt install
apps/web/src/lib/websocket/types.ts     ← +M4 payload types (3 separate interfaces)
apps/web/src/hooks/useDashboardUpdates.ts ← +M4 WS handlers, explicit dual unsubscribe
apps/web/src/hooks/useUpdates.ts        ← UpdateResponse +audio_duration_seconds, +transcript
                                           useSubmitUpdate +audio_key, +audio_duration_seconds
apps/web/src/components/domain/updates/update-card.tsx ← voice variant
apps/web/src/components/domain/dashboard/dashboard-view.tsx ← voice mode toggle,
                                           VoiceRecorder integration, new props
apps/web/src/app/(app)/dashboard/page.tsx ← handleVoiceSuccess, showVoiceRecorder state
```

---

## Implementation Notes & Deviations from Original Spec

### Docker networking — DATABASE_URL internal hostname

The original spec used `host.docker.internal:54322` in `DATABASE_URL` to
reach Supabase Postgres from Docker containers. On Windows with WSL2, this
hostname fails to resolve from inside containers. Fixed by using the
Supabase DB container's internal Docker network hostname instead:

```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@supabase_db_soarup:5432/postgres
```

`supabase_db_soarup` is the container name on the shared `supabase_network_soarup`
Docker bridge network. Port `5432` (internal) not `54322` (host-mapped).

### R2 public endpoint URL split

The spec used a single `R2_ENDPOINT_URL` for all storage operations. During
smoke testing, presigned URLs generated with the internal Docker hostname
(`minio:9000`) were unreachable from the browser. Fixed by splitting into
two config fields:

- `R2_ENDPOINT_URL=http://minio:9000` — used by Celery worker (container-to-container)
- `R2_PUBLIC_ENDPOINT_URL=http://localhost:9000` — used by `StorageRepository`
  for presigned URLs returned to the browser

`StorageRepository` uses `r2_public_endpoint_url` for all presigned URL
generation. The `tasks.py` boto3 client keeps using `r2_endpoint_url`.

### NullPool added to Celery DB engine

The original spec did not specify a connection pool strategy for the Celery
task's async SQLAlchemy engine. During smoke testing, `asyncpg` raised
`InterfaceError: cannot perform operation: another operation is in progress`
due to connection pool state not surviving across `asyncio.run()` invocations.

Fixed by adding `poolclass=NullPool` to the engine:

```python
from sqlalchemy.pool import NullPool

self._db_engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
)
```

`NullPool` disables connection pooling — each operation gets a fresh
connection and closes it immediately. Correct for Celery's sync task model
where each task creates a new event loop via `asyncio.run()`.

### structlog replaces Celery task logger

The original spec used `get_task_logger` from `celery.utils.log`. Celery's
task logger does not support keyword arguments in log calls (e.g.
`logger.info("event", update_id=update_id)`), causing `TypeError` at runtime.

Fixed by replacing with `structlog.get_logger(__name__)`, consistent with the
rest of the codebase:

```python
# Was:
from celery.utils.log import get_task_logger
logger = get_task_logger(__name__)

# Now:
import structlog
logger = structlog.get_logger(__name__)
```

### Whisper model preload signal

Added a `@worker_ready.connect` Celery signal to preload the Whisper model
on worker startup, preventing cold-start latency on the first voice update:

```python
from celery.signals import worker_ready

@worker_ready.connect  # type: ignore[misc]
def preload_whisper_model(**kwargs: Any) -> None:
    from app.workers.whisper_setup import get_whisper_model
    logger.info("preloading_whisper_model")
    get_whisper_model()
    logger.info("whisper_model_ready")
```

### `transcript` field already existed on Update model

The spec listed `transcript` as a new column to add in M4. It was already
present on the `Update` model from M3 (added in preparation). The Alembic
migration therefore only added three columns: `audio_key`, `audio_url`, and
`audio_duration_seconds`.

### `_to_response` was missing audio fields

`UpdateService._to_response` was not mapping `transcript` and
`audio_duration_seconds` to `UpdateResponse`, causing those fields to always
return `null` in the API response despite being populated in the DB. Fixed
by adding both fields to the mapper.

### `submit_update` voice branch was missing

`UpdateService.submit_update` was missing the voice branch entirely after
the initial implementation — the updated version did not persist to the file.
The voice branch correctly routes to `process_audio_update.delay()` and passes
`audio_key` and `audio_duration_seconds` to `repo.create()`.

### DashboardView props extended for voice mode

`DashboardView` received six new props for voice mode integration:
`showVoiceRecorder`, `workspaceId`, `today`, `onVoiceClick`, `onVoiceSuccess`,
and `onVoiceCancel`. The `EmptyState` component is no longer rendered on the
dashboard — the mode toggle buttons (text / voice) replace it as the
submission entry point. `EmptyState` is retained in the codebase for
potential reuse in M5 team views.

### AudioPlayer play button hidden after activation

The spec showed a play button that remains visible after activation. Revised
during implementation — the play button is hidden once the native `<audio>`
element renders (since the native controls include their own play/pause).
Prevents duplicate play controls in the UI.

### useDashboardUpdates cleanup returns dual unsubscribes

M3's `useDashboardUpdates` returned `subscribe(...)` directly from `useEffect`,
which only cleaned up one handler. M4 adds a second handler
(`audio.transcription_complete`), requiring explicit cleanup of both:

```typescript
return () => {
  unsubStatusChanged();
  unsubTranscriptComplete();
};
```

### `audio/webm;codecs=opus` removed from ALLOWED_AUDIO_CONTENT_TYPES set

The router strips codec parameters with `split(";")[0]` before validation.
The entry `"audio/webm;codecs=opus"` in the allowed set would never match
after normalisation. Removed from the set — `"audio/webm"` covers it.

### Supabase Studio fix — missing `supabase/functions` directory

During development, Supabase Studio entered a crash loop with
`ENOENT: no such file or directory, scandir '/Active Personal Projects/soarup/supabase/functions'`.
Fixed by creating the empty directory:

```bash
mkdir supabase/functions
docker restart supabase_studio_soarup
```

### Supabase CLI update deferred

`supabase status` reported CLI version `v2.84.2` with `v2.101.0` available.
Update deferred to next hardware setup migration to avoid disrupting the
current development environment mid-milestone.

---

## Post-M9 UX Improvement Notes

The following visual and interaction improvements were identified during M4
smoke testing. None are blockers — deferred to a dedicated UI polish pass
after Milestone 9.

### Visual depth and shadow system

The current UI uses flat surfaces across both dark and light modes. The
Electric Atelier design system supports `shadow-electric` and
`shadow-electric-sm` tokens but they are underutilised. A polish pass should:

- Add `shadow-electric-sm` to `UpdateCard`, `VoiceRecorder`, and other
  surface-high cards to create visual separation from the background
- Add subtle hover shadows on interactive cards
- Reference getHaiku's layered glow/shadow aesthetic as the target feel
- Ensure shadows are calibrated per theme — glow effects in dark mode,
  soft drop shadows in light mode

### Light mode colour refinement

Light mode surfaces currently feel flat and slightly washed out. Areas to
improve:

- Increase contrast between `bg-surface` and `bg-surface-high` layers
- Add subtle tint or warmth to surface colours to reduce the clinical feel
- Verify `text-on-surface-variant` passes WCAG AA against all surface colours
  in light mode

### Loading state indicators

Several interactions lack loading feedback:

- Form submit button has a spinner (good) but the dashboard page has no
  skeleton or indicator while the workspace is loading on first mount
- Login / signup / onboarding page transitions show no loading state between
  form submit and redirect — add a full-page loading overlay or button spinner
- The `VoiceRecorder` "requesting permission" state shows a pulse placeholder
  but no label explaining what is happening — add "Requesting microphone..." text

These should be addressed as a coordinated pass across all auth and app pages
rather than individually per component.
