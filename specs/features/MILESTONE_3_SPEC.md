# SoarUp — Milestone 3: AI Processing Pipeline

# Branch: feature/milestone-3

# Merges into: develop

# Prerequisites: feature/milestone-2 merged to develop ✅

# Status: COMPLETE — merged to develop

---

## What This Milestone Delivers

1. Submitted text updates are summarised by Claude (Haiku primary, Sonnet fallback)
2. Summarisation prompt is configurable per workspace (building toward M6 digest)
3. Dashboard shows real-time status changes via WebSocket
4. "Processing..." badge resolves to a real AI summary
5. Failed tasks retry with exponential backoff, surface error state in UI
6. WebSocket architecture is general-purpose — ready for M4 voice progress,
   M5 team updates, and post-roadmap chat without architectural changes
7. Missing Storybook stories (M2 layout + M3 WebSocket components) added
8. Frontend unit tests for M3 hooks added
9. `DashboardView` presentational component extracted from `dashboard/page.tsx`

---

## Branch Strategy

```
develop
└── feature/milestone-3
    ├── feature/milestone-3-celery-pipeline      ← Celery task + Claude integration ✅
    ├── feature/milestone-3-websocket-backend    ← FastAPI WS endpoint + Redis pub/sub ✅
    ├── feature/milestone-3-websocket-frontend   ← useWebSocket hook + connection store ✅
    ├── feature/milestone-3-workspace-prompts    ← workspace prompt config + DB migration ✅
    └── feature/milestone-3-stories-and-tests   ← Storybook + unit tests ✅

Merge strategy: Squash and merge for all sub-branches → feature/milestone-3
Final merge: Regular merge commit feature/milestone-3 → develop

Note: Branch naming uses hyphens not slashes (feature/milestone-3-celery-pipeline)
because Git treats slashes as path separators — feature/milestone-3/ as a prefix
conflicts with feature/milestone-3 as a branch name.
```

---

## Implementation Notes & Deviations from Original Spec

### Branch naming convention changed

Original spec used `/` as a tier separator (`feature/milestone-3/celery-pipeline`).
Changed to `-` (`feature/milestone-3-celery-pipeline`) because Git treats `/` as
a path separator, causing conflicts with the parent integration branch name.

### FastAPI lifespan instead of on_event

Original spec used deprecated `@app.on_event("startup"/"shutdown")` decorators
for the broadcaster lifecycle. Changed to the recommended `@asynccontextmanager`
lifespan pattern in `main.py`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await broadcast.connect()
    yield
    await broadcast.disconnect()

app = FastAPI(..., lifespan=lifespan)
```

### Alembic migration command on Windows

Original spec used bash line continuation (`\`) which does not work in Windows
Command Prompt or PowerShell. Correct single-line command:

```bash
docker compose exec api alembic revision --autogenerate -m "add_prompt_config_to_workspaces"
docker compose exec api alembic upgrade head
```

The `ruff` post-write hook failed due to `ruff` not being installed inside the
Docker container — this is cosmetic only, the migration file was generated
correctly. Add `ruff` to `requirements.txt` to fix going forward.

### mypy fixes required in tasks.py

Several mypy errors surfaced during implementation that required fixes beyond
the spec:

1. `Class cannot subclass "Task"` — Celery's type stubs type `Task` as `Any`.
   Fix: `class ProcessUpdateTask(Task):  # type: ignore[misc]`

2. `db_engine` and `redis` property return types required `TYPE_CHECKING` import
   pattern for deferred imports:

   ```python
   from __future__ import annotations
   from typing import TYPE_CHECKING
   if TYPE_CHECKING:
       from redis.asyncio import Redis
       from sqlalchemy.ext.asyncio import AsyncEngine
   ```

3. `build_summarisation_prompt` signature widened from `author_name: str` to
   `author_name: str | None` to match ORM reality (`profile.full_name` is nullable).

4. Untyped Celery decorator — `@celery_app.task(  # type: ignore[misc]`

5. `message.content[0].text` — mypy correctly flagged the union type on
   `message.content` blocks. Fix: use `isinstance(block, TextBlock)` narrowing
   and raise `ValueError` if no `TextBlock` found.

### Markdown stripping in claude.py

Added `_strip_markdown()` to handle cases where Claude wraps responses in
code fences despite the completion-style prompt:

````python
import re

def _strip_markdown(text: str) -> str:
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text.strip())
    text = re.sub(r"\n?```$", "", text)
    return text.strip()
````

### broadcaster mypy errors in websockets.py

`broadcaster`'s type stubs are incomplete — `broadcast.subscribe()` yields
`Event | None` instead of `Event`. Fixed with:

```python
async for event in subscriber:
    if event is None:
        continue
    # rest of handler
```

And `# type: ignore[union-attr]` on the `async for subscriber` line for the
subscriber-level None union (stubs artifact, not a real runtime issue).

### Onboarding redirect bug discovered and fixed

During M3 smoke testing, a blocking bug was found in the onboarding→dashboard
flow that had nothing to do with M3 but surfaced during testing. Root cause:
Next.js middleware (`src/middleware.ts`) was reading `is_onboarded` from
Supabase `user_metadata`, but the backend never writes `is_onboarded` to
Supabase `user_metadata` — it only writes to the PostgreSQL `profiles` table.
The middleware was redirecting every `/dashboard` navigation back to `/onboarding`.

Fix: removed the `is_onboarded` check from middleware entirely. The onboarding
guard already exists in two React layers (`onboarding/page.tsx` and `AppShell`)
which correctly read from the Zustand store (hydrated from the PostgreSQL-backed
login response). The middleware only needs to handle authentication (logged in
or not) — not onboarding state.

Also fixed: `useWorkspace` was calling `GET /workspaces/me` which does not exist.
Corrected to `GET /workspaces/` and updated the response unwrapping to handle
the `{ data: [...] }` envelope from `WorkspaceListResponse`.

---

## Architecture Overview

```
User submits update
       ↓
POST /workspaces/:id/updates → 202
UpdateService.submit_update() creates DB record (status: "pending")
       ↓
process_update.delay(update_id)   ← Celery task enqueued to Redis
       ↓
Celery worker picks up task
       ↓
1. Fetch update + workspace prompt config from DB
2. Set status → "processing", publish WS event
3. Call Claude API (Haiku primary, Sonnet fallback on retry)
4. Store summary, set status → "processed"
5. Publish WS event: update.status_changed
       ↓
Redis pub/sub channel: workspace:{workspace_id}
       ↓
FastAPI WS endpoint subscribes via broadcaster
Forwards event to all connected clients in workspace
       ↓
Frontend useWebSocket hook receives message
Dispatches to registered handlers via registry
       ↓
useDashboardUpdates handler calls queryClient.setQueryData
UpdateCard rerenders with summary — no page refresh
```

---

## Files Created / Modified

### Backend (apps/api/)

**New files:**

```
app/lib/claude.py                   ← Claude API wrapper, Haiku/Sonnet, TextBlock typing
app/lib/events.py                   ← Redis pub/sub publisher, EVENT_TYPES registry
app/workers/prompts.py              ← DEFAULT_SUMMARISATION_PROMPT, DEFAULT_DIGEST_PROMPT
app/workers/celery_app.py           ← Celery app config, health_check task
app/workers/tasks.py                ← ProcessUpdateTask, process_update, _process_update_async
app/routers/websockets.py           ← WebSocket endpoint, broadcaster integration
alembic/versions/*_add_prompt_config_to_workspaces.py
```

**Modified files:**

```
app/models/workspace.py             ← +summarisation_prompt, +digest_prompt (Text, nullable)
app/schemas/workspace.py            ← +UpdateWorkspacePromptsRequest
app/routers/workspaces.py           ← +PATCH /{workspace_id}/prompts, +unauthorized/update_failed error codes
app/services/workspace_service.py   ← +update_workspace_prompts method
app/repositories/update_repo.py     ← +update_status method
app/services/update_service.py      ← +process_update.delay(update.id) wire-up
app/utils/auth.py                   ← +validate_supabase_jwt_ws
app/main.py                         ← +lifespan hooks, +websocket router
requirements.txt                    ← +anthropic>=0.40.0, +broadcaster[redis]>=0.3.0
```

**Test files (written in dedicated testing chats):**

```
tests/unit/test_process_update_task.py
tests/unit/test_claude_client.py
tests/unit/test_events.py
tests/unit/test_websocket_router.py
```

### Frontend (apps/web/src/)

**New files:**

```
stores/websocket-store.ts           ← WsStatus type, connection state, Zustand store
lib/websocket/types.ts              ← WebSocketMessage envelope, payload type interfaces
lib/websocket/registry.ts           ← module-level handler registry, subscribe/dispatch/clearAllHandlers
hooks/useWebSocket.ts               ← connection lifecycle, exponential backoff, query invalidation on reconnect
hooks/useDashboardUpdates.ts        ← cache patch handler for update.status_changed
components/domain/dashboard/dashboard-view.tsx  ← extracted presentational component
stories/layout/AppShell.stories.tsx
stories/layout/Sidebar.stories.tsx  ← includes all WsStatus ConnectionIndicator variants
stories/layout/TopBar.stories.tsx
stories/domain/DashboardView.stories.tsx
stories/domain/UpdateCard.stories.tsx   ← M3 status variants: Processing, Summarised, Failed
stories/ui/ConnectionIndicator.stories.tsx
```

**Modified files:**

```
app/(app)/dashboard/page.tsx        ← thin wrapper over DashboardView, +useWebSocket, +useDashboardUpdates
components/domain/updates/update-card.tsx  ← +summary block, +processing skeleton, +failed state, +animated dot
components/layout/sidebar.tsx       ← +ConnectionIndicator, h-16 brand section (topbar alignment fix)
hooks/useWorkspace.ts               ← fixed /workspaces/me → /workspaces/, fixed data envelope unwrapping
middleware.ts                       ← removed is_onboarded check (was reading from wrong source)
app/(auth)/onboarding/page.tsx      ← loading spinner instead of null return to prevent Nav interference
```

**Test files (written in dedicated testing chats):**

```
lib/websocket/registry.test.ts
hooks/useWebSocket.test.ts
hooks/useDashboardUpdates.test.ts
```

---

## Known Tradeoffs (Documented in Scaling Docs)

See `specs/scaling/api/ai_pipeline.md` and `specs/scaling/web/websocket.md`
for full detail on each item.

**1. asyncio.run() per Celery task**
New event loop per task invocation. ~1-2ms overhead. Acceptable at SoarUp's
scale. `celery-pool-asyncio` deliberately excluded — revisit post-M5.

**2. Token in WebSocket URL query param**
JWT visible in server access logs. Mitigations: HTTPS in production,
1-hour token expiry. Standard browser WebSocket tradeoff.

**3. Redis pub/sub — no event persistence**
Events lost on client disconnect. Mitigated by `queryClient.invalidateQueries`
on reconnect. Migration to Redis Streams deferred to M5.

**4. N+1 profile queries in UpdateService.\_to_response**
Carried forward from M2. Batch fetch deferred to M5.

**5. Workspace prompt not owner-gated**
Any onboarded user can update prompts. Owner-only restriction in M5 when RBAC lands.

**6. broadcaster library type stubs incomplete**
`Event | None` union in type stubs causes mypy warnings. Mitigated with
`if event is None: continue` guard and targeted `# type: ignore[union-attr]`.

---

## Acceptance Criteria

```
[x] Submitted update transitions: pending → processing → processed
[x] "Processing..." badge animates while status is pending/processing
[x] AI summary appears on UpdateCard without page refresh
[x] Failed tasks show "Failed" badge after 3 retries
[x] WebSocket connects on dashboard load, disconnects on logout
[x] Reconnects automatically with exponential backoff + jitter
[x] Max 10 reconnect attempts — then shows manual reconnect UI
[x] Query cache invalidated on reconnect to catch missed events
[x] Haiku used for first attempt, Sonnet used on retry
[x] Workspace summarisation_prompt config endpoint works
[x] Custom prompt used when configured, default when null
[x] All event types validated against EVENT_TYPES registry
[x] Redis publish failure is logged but does not fail the task
[x] Invalid WS token → close code 4001, no reconnect attempt
[x] Connection indicator in sidebar reflects live status
[x] Storybook stories added for AppShell, Sidebar, TopBar, DashboardView,
    UpdateCard (M3 variants), ConnectionIndicator
[x] DashboardView presentational component extracted
[x] Topbar border aligned with sidebar brand section border
[x] Onboarding → dashboard redirect working correctly
[x] GET /workspaces/ response envelope correctly unwrapped in useWorkspace
[x] Backend unit tests written (separate testing chat)
[x] Frontend unit tests written (separate testing chat)
[x] Scaling debt documented in specs/scaling/api/ai_pipeline.md
[x] Scaling debt documented in specs/scaling/web/websocket.md
[x] CI passes on feature/milestone-3 branch
```
