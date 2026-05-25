# SoarUp — Scaling & Technical Debt: AI Pipeline (API)

# Path: specs/scaling/api/ai_pipeline.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 3

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the AI processing pipeline introduced in Milestone 3.
This covers the Celery task, Claude client, Redis pub/sub event bus, and the
WebSocket endpoint. Items are ordered by expected impact, not urgency. None of
these are blockers for early-stage use.

---

## Issue 1 — Redis Pub/Sub Has No Event Persistence

**Where:** `apps/api/app/lib/events.py` → `publish_event`
and `apps/api/app/routers/websockets.py` → `workspace_websocket`

**What:** Events are published to Redis pub/sub channels which have no
persistence. If a client is disconnected at the moment an event is published
(e.g. tab hidden, network drop), the event is lost. The client recovers by
calling `queryClient.invalidateQueries` on reconnect, which fetches the latest
state from the DB — but there is a window where the client shows stale data
until the WebSocket reconnects and the invalidation fires.

```python
# Current — fire and forget, no persistence
await redis.publish(_channel(workspace_id), message)
```

**Impact:** Low for solo use. Noticeable on flaky connections. On mobile or
tab-switching workflows, users may briefly see stale `processing` badges that
don't update until reconnect. The DB always has the correct state — this is a
display-only issue.

**Fix (Milestone 5):** Migrate from Redis pub/sub to Redis Streams. Streams
persist events with a consumer group model. The WebSocket endpoint reads from
the stream with a last-seen `event_id`, so reconnecting clients can replay
missed events since disconnection.

```python
# Option A — Redis Streams (recommended)
await redis.xadd(f"workspace:{workspace_id}", fields=message_dict, maxlen=1000)

# Option B — store last N events in a Redis list (simpler, less reliable)
await redis.lpush(f"workspace:{workspace_id}:recent", message)
await redis.ltrim(f"workspace:{workspace_id}:recent", 0, 99)
```

**Effort:** Medium — requires changes to `events.py`, `websockets.py`,
and the frontend `useWebSocket` hook to send the last `event_id` on reconnect.

---

## Issue 2 — `asyncio.run()` Creates a New Event Loop Per Task

**Where:** `apps/api/app/workers/tasks.py` → `process_update`

**What:** Each Celery task invocation calls `asyncio.run(_process_update_async(...))`,
which creates a fresh event loop, runs the coroutine to completion, and destroys
the loop. This is correct for Celery's sync worker model but has overhead at
scale — loop creation is not free, and the DB engine and Redis connection are
re-established per task via the lazy property pattern on `ProcessUpdateTask`.

```python
# Current — new event loop per task
def process_update(self, update_id: str) -> None:
    asyncio.run(_process_update_async(self, update_id))
```

The `_db_engine` and `_redis` properties are worker-process-scoped (cached on
the task class), so connections are reused across tasks within the same worker
process. But the event loop itself is recreated each time.

**Impact:** Negligible at low concurrency. At high throughput (100+ tasks/min),
loop creation overhead accumulates. Worker memory also grows if SQLAlchemy's
connection pool is not correctly scoped to the engine lifetime.

**Fix (post-M5):** Evaluate `celery-pool-asyncio` once the codebase is stable.
This keeps a persistent event loop per worker and eliminates per-task loop
creation. Deliberately excluded from M3 to avoid complexity — revisit when
worker throughput becomes measurable.

**Effort:** Medium — requires worker pool configuration changes and testing
for event loop isolation between tasks.

---

## Issue 3 — No Backpressure on Claude API Calls

**Where:** `apps/api/app/workers/tasks.py` → `_process_update_async`
and `apps/api/app/workers/celery_app.py`

**What:** There is no rate limiting or concurrency cap on Claude API calls.
If many updates are submitted simultaneously (e.g. a team of 20 all submitting
at the same time), 20 Celery tasks fire simultaneously, each making a Claude
API call. Anthropic rate limits by tokens-per-minute and requests-per-minute
— bursts beyond these limits cause API errors, triggering retries, which
further compound the burst.

```python
# Current — no concurrency control
@celery_app.task(
    bind=True,
    base=ProcessUpdateTask,
    autoretry_for=(Exception,),
    max_retries=3,
    ...
)
def process_update(self, update_id: str) -> None:
    asyncio.run(_process_update_async(self, update_id))
```

**Impact:** Low for small teams (≤5 members). At 20+ members submitting within
a short window, expect Claude API rate limit errors and cascading retries.
Haiku's rate limits are generous but not unlimited.

**Fix (Milestone 5):** Two complementary approaches:

Option A — Celery concurrency cap per worker:

```python
# celery_app.py
celery_app.conf.update(
    worker_concurrency=4,  # max 4 simultaneous Claude calls per worker
)
```

Option B — Redis-backed rate limiter in the task:

```python
# In _process_update_async, before the Claude call
async with rate_limiter(redis, key="claude_api", limit=10, window=60):
    summary = await summarise(prompt, use_fallback=use_fallback)
```

**Effort:** Low for Option A (one config change). Medium for Option B
(requires a Redis rate limiter utility).

---

## Issue 4 — WebSocket Broadcasts to All Workspace Members Regardless of Role

**Where:** `apps/api/app/lib/events.py` → `_channel`
and `apps/api/app/routers/websockets.py` → `workspace_websocket`

**What:** All events are published to a single `workspace:{id}` channel.
Every connected member of the workspace receives every event, including
`update.status_changed` events for other members' updates. The frontend
guards against acting on irrelevant events (workspace_id check in
`useDashboardUpdates`), but all events still transit the network to every
client.

```python
# Current — one channel per workspace, no per-user filtering
def _channel(workspace_id: str) -> str:
    return f"workspace:{workspace_id}"
```

**Impact:** Minimal at current scale — standup updates are meant to be visible
to all team members. Becomes a concern if workspace size grows large (50+
members) or if sensitive event types are introduced in later milestones
(e.g. admin-only events).

**Fix (Milestone 5+):** Introduce per-user channels (`user:{user_id}`) for
private events alongside the workspace channel for shared events. The task
publishes to the appropriate channel based on event type.

```python
# Per-user channel for private events
await publish_event(redis, "billing.invoice_ready", user_id=user_id, payload={...})

# Workspace channel for shared events (current behaviour)
await publish_event(redis, "update.status_changed", workspace_id=workspace_id, payload={...})
```

**Effort:** Medium — requires changes to `events.py`, `websockets.py`,
and the frontend WebSocket hook to subscribe to both channels.

---

## Issue 5 — No Retry UI for Failed Summaries

**Where:** `apps/api/app/workers/tasks.py` → `_process_update_async`
and `apps/web/src/components/domain/updates/update-card.tsx`

**What:** When the Celery task exhausts all retries and sets `status="failed"`,
the `UpdateCard` shows a disabled ghost "Retry" button with no functionality.
There is no endpoint to re-enqueue a failed update for processing, so users
have no recovery path beyond editing the update (which resets content but
does not re-trigger the pipeline).

```typescript
// Current — ghost button, no action
{update.status === 'failed' && (
  <button disabled title="Retry coming in a future update">
    Retry
  </button>
)}
```

**Impact:** Low frequency — Claude API failures are rare. When they do occur,
the user's update content is intact but the summary is missing permanently
until the row is manually re-processed or the user edits the update.

**Fix (Milestone 5):** Add a `POST /{workspace_id}/updates/{id}/retry`
endpoint that re-enqueues the task and resets `status → pending`. Wire the
Retry button in `UpdateCard` to call this endpoint.

```python
# New endpoint
@router.post("/{workspace_id}/updates/{update_id}/retry")
async def retry_update(workspace_id, update_id, user_ctx: OnboardedDep, ...):
    update = await repo.get_by_id(update_id)
    if update.status != "failed":
        raise HTTPException(400, "Only failed updates can be retried")
    await repo.update_status(update, "pending")
    process_update.delay(update.id)
    return create_success_response(...)
```

**Effort:** Low — one new endpoint, one new repo call, one frontend
button wire-up.

---

## Issue 6 — Stale Prompt Cache After `PATCH /:id/prompts`

**Where:** `apps/api/app/workers/tasks.py` → `_process_update_async`

**What:** The Celery task reads `workspace.summarisation_prompt` fresh from
the DB on each task invocation — there is no caching of the prompt at the
worker level. However, if a workspace owner updates the prompt via
`PATCH /workspaces/:id/prompts` while tasks are already queued, the in-flight
tasks will use the old prompt (fetched before the patch) while newly queued
tasks will use the new prompt.

**Impact:** Edge case — only observable if a prompt is updated during a batch
submission window. The inconsistency is transient and self-corrects on the
next submission.

**Fix:** No fix needed for early-stage use. If prompt consistency becomes
important (e.g. audit trails for enterprise), add a `prompt_version` field
to the `Update` row and store which prompt was used for each summary.

**Effort:** Low when needed — one new column, one write in the task.

---

## Summary Table

| #   | Issue                               | Impact                       | Fix Milestone | Effort     |
| --- | ----------------------------------- | ---------------------------- | ------------- | ---------- |
| 1   | No pub/sub event persistence        | Medium (flaky connections)   | Milestone 5   | Medium     |
| 2   | New event loop per Celery task      | Low (high throughput only)   | Post-M5       | Medium     |
| 3   | No backpressure on Claude API       | Medium (large teams)         | Milestone 5   | Low–Medium |
| 4   | Broadcasts to all workspace members | Low (now), Medium (at scale) | Milestone 5+  | Medium     |
| 5   | No retry UI for failed summaries    | Low (rare failures)          | Milestone 5   | Low        |
| 6   | Stale prompt on in-flight tasks     | Low (edge case)              | When needed   | Low        |
