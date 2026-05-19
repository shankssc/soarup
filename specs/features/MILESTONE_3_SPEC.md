# SoarUp — Milestone 3: AI Processing Pipeline
# Branch: feature/milestone-3
# Merges into: develop
# Prerequisites: feature/milestone-2 merged to develop ✅

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
8. Frontend unit tests for M2 layout components and M3 hooks added

---

## Branch Strategy

```
develop
└── feature/milestone-3
    ├── feature/milestone-3/celery-pipeline      ← Celery task + Claude integration
    ├── feature/milestone-3/websocket-backend    ← FastAPI WS endpoint + Redis pub/sub
    ├── feature/milestone-3/websocket-frontend   ← useWebSocket hook + connection store
    ├── feature/milestone-3/workspace-prompts    ← workspace prompt config + DB migration
    └── feature/milestone-3/stories-and-tests   ← Storybook + unit tests (tail end)

Merge order:
  feature/milestone-3/celery-pipeline → feature/milestone-3
  feature/milestone-3/websocket-backend → feature/milestone-3
  feature/milestone-3/websocket-frontend → feature/milestone-3
  feature/milestone-3/workspace-prompts → feature/milestone-3
  feature/milestone-3/stories-and-tests → feature/milestone-3
  feature/milestone-3 → develop
```

---

## Google Stitch Prompt

```
Design real-time status indicators for SoarUp's dashboard update cards.
Use the Electric Atelier design system (same as previous milestones).

Status badge states for an update card:
1. Pending / Processing — amber pulsing dot + "Processing..." label
2. Processed / Summarised — cyan dot + "Summarised" label
   Below the original update text, show the AI summary in a distinct
   visual treatment: slightly smaller text, subtle left border in cyan,
   italic Newsreader font
3. Failed — red dot + "Failed" label + small "Retry" ghost button

WebSocket connection indicator (subtle, top of sidebar):
- Connected: small cyan dot, no label
- Reconnecting: amber pulsing dot + "Reconnecting..." label (10px Space Grotesk)
- Disconnected (max retries): red dot + "Connection lost" + "Reconnect" link

Processing skeleton state on the dashboard card while summary loads:
- Animated shimmer placeholder below the update text
- Same card layout, just content area replaced with skeleton bars
```

---

## Existing Stack Reference

### Backend
- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local, port 54322)
- Alembic migrations
- Structlog logging
- Redis (port 6379 dev, 6380 test) — already used as Celery broker
- Celery worker — exists, no tasks wired yet
- pytest + pytest-asyncio, conftest.py fixtures available

### Frontend
- Next.js 14 App Router, TypeScript
- Tailwind CSS + Electric Atelier CSS variable token system
- @tanstack/react-query v5 — all data fetching
- Zustand + persist — auth state, WebSocket connection state
- Vitest + React Testing Library
- Playwright (E2E deferred to post-major-milestones)

### conftest.py fixtures
```python
db_session, api_client, client_with_mocks, unauthenticated_client
make_jwt(user_id, email), auth_headers(user_id)
test_user_id, seeded_profile, workspace_repo
login_response(), profile_response()
```

### Design tokens
```
text-on-surface, text-on-surface-variant, text-outline
bg-surface, bg-surface-high, bg-container
text-primary, bg-primary-container, text-primary-on-container
text-error, bg-error-container
border-outline-variant, border-outline
shadow-electric
```

### Auth pattern
```typescript
const { tokens, user } = useAuth();
tokens?.access_token  // Bearer token for API calls
isAuthenticated       // user + tokens + not expired
needsOnboarding       // isAuthenticated && !user.is_onboarded
```

### React Query cache keys (established in M2)
```typescript
updateKeys.byDate(workspaceId, date)  // ['updates', workspaceId, date]
workspaceKeys.mine()                  // ['workspace', 'mine']
```

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
3. Call Claude API (Haiku → Sonnet fallback)
4. Store summary, set status → "processed"
5. Publish WS event: update.status_changed
       ↓
Redis pub/sub channel: workspace:{workspace_id}
       ↓
FastAPI WS endpoint subscribes via broadcaster
Forwards event to all connected clients in workspace
       ↓
Frontend useWebSocket hook receives message
Dispatches to registered handlers
       ↓
useDashboardUpdates handler calls queryClient.setQueryData
UpdateCard rerenders with summary
```

---

## Backend — Build Order

### Step 1: Workspace Prompt Configuration

Add prompt config to the workspaces table so summarisation behaviour
is configurable per workspace (required for M6 digest customisation):

```python
# apps/api/app/models/workspace.py — add these columns

summarisation_prompt: Mapped[str | None] = mapped_column(
    Text,
    nullable=True,
    doc="Custom Claude prompt for update summarisation. "
        "If None, the default prompt from app.workers.prompts is used.",
)
digest_prompt: Mapped[str | None] = mapped_column(
    Text,
    nullable=True,
    doc="Custom Claude prompt for daily digest generation (Milestone 6).",
)
```

Alembic migration:
```bash
docker compose exec api alembic revision --autogenerate \
  -m "add_prompt_config_to_workspaces"
docker compose exec api alembic upgrade head
```

⚠️ Both columns are nullable with no server_default — autogenerate
handles this correctly. No manual migration edits needed.

Add to workspace schemas:
```python
# apps/api/app/schemas/workspace.py

class UpdateWorkspacePromptsRequest(BaseModel):
    """PATCH /workspaces/:id/prompts"""
    summarisation_prompt: str | None = Field(
        None, max_length=2000,
        description="Custom prompt for update summarisation. "
                    "Pass null to reset to default."
    )
    digest_prompt: str | None = Field(
        None, max_length=2000,
        description="Custom prompt for digest generation. "
                    "Pass null to reset to default."
    )
```

Add endpoint to workspaces router:
```python
@router.patch("/{workspace_id}/prompts", status_code=200)
async def update_workspace_prompts(
    workspace_id: str,
    request: UpdateWorkspacePromptsRequest,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,  # owner-only in M5 when role checks land
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    ...
```

---

### Step 2: Default Prompts Module

```python
# apps/api/app/workers/prompts.py
# Centralised prompt templates — single source of truth across tasks.
# Workspace-level overrides take precedence over these defaults.

DEFAULT_SUMMARISATION_PROMPT = """You are summarising a developer's async standup update.

The update was written by {author_name} on {update_date}.

Your task:
- Write a concise 1-3 sentence summary of what they worked on
- Use third person ("They worked on...", "Fixed...", "Completed...")
- Preserve any blockers or context that teammates need to know
- Do not add information not present in the original update
- Do not use bullet points — write in flowing prose
- Target length: 40-80 words

Update to summarise:
{content}

Summary:"""

DEFAULT_DIGEST_PROMPT = """You are generating a daily standup digest for a development team.

Team: {workspace_name}
Date: {digest_date}

Individual summaries from today:
{summaries}

Your task:
- Write a cohesive 3-5 sentence team digest
- Highlight themes, shared progress, and cross-cutting concerns
- Note any blockers that affect multiple team members
- Use a professional but conversational tone
- Do not list individuals by name — synthesise at the team level

Digest:"""


def build_summarisation_prompt(
    content: str,
    author_name: str,
    update_date: str,
    custom_prompt: str | None = None,
) -> str:
    """
    Build the final summarisation prompt.
    Uses workspace custom prompt if provided, falls back to default.
    """
    template = custom_prompt or DEFAULT_SUMMARISATION_PROMPT
    return template.format(
        content=content,
        author_name=author_name or "the user",
        update_date=update_date,
    )
```

---

### Step 3: Claude Client

```python
# apps/api/app/lib/claude.py
# Thin async wrapper around the Anthropic SDK.
# Handles model selection, retry fallback, and token tracking.

import anthropic
import structlog
from app.config import settings

logger = structlog.get_logger(__name__)

# Primary model: Haiku — fast, cheap, sufficient for short standup text
PRIMARY_MODEL = "claude-haiku-4-5-20251001"
# Fallback model: Sonnet — higher quality, used on retry after Haiku failure
FALLBACK_MODEL = "claude-sonnet-4-20250514"

MAX_TOKENS = 256   # Summaries are short — 256 tokens is generous
TEMPERATURE = 0.3  # Low temperature for consistent, factual summaries


async def summarise(
    prompt: str,
    use_fallback: bool = False,
) -> str:
    """
    Call Claude to generate a summary from a pre-built prompt.

    Args:
        prompt: Fully-formatted prompt string (built by prompts.py)
        use_fallback: If True, uses Sonnet instead of Haiku

    Returns:
        Generated summary text

    Raises:
        anthropic.APIError: On API failure (caught by Celery task for retry)
    """
    model = FALLBACK_MODEL if use_fallback else PRIMARY_MODEL

    client = anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key.get_secret_value()
        if settings.anthropic_api_key
        else "",
    )

    logger.info("claude_request", model=model, prompt_length=len(prompt))

    message = await client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        messages=[{"role": "user", "content": prompt}],
    )

    summary = message.content[0].text.strip()

    logger.info(
        "claude_response",
        model=model,
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
        summary_length=len(summary),
    )

    return summary
```

Add to `config.py` — `anthropic_api_key` already exists as `SecretStr | None`.
No config changes needed.

Add `anthropic` to `requirements.txt`:
```
anthropic>=0.40.0
```

---

### Step 4: Redis Publisher

```python
# apps/api/app/lib/events.py
# Publishes WebSocket events to Redis pub/sub channels.
# Used by Celery tasks to notify connected API instances.
# Channel naming: workspace:{workspace_id}

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)

# All valid event types — add new types here as milestones add features
EVENT_TYPES = {
    # Milestone 3
    "update.status_changed",
    # Milestone 4 (reserved)
    "audio.transcription_started",
    "audio.transcription_complete",
    "audio.transcription_failed",
    # Milestone 5 (reserved)
    "member.update_submitted",
    "member.joined",
    "member.left",
}


def _channel(workspace_id: str) -> str:
    return f"workspace:{workspace_id}"


def _build_message(
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> str:
    if event_type not in EVENT_TYPES:
        raise ValueError(f"Unknown event type: {event_type}")
    return json.dumps({
        "type": event_type,
        "workspace_id": workspace_id,
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(UTC).isoformat(),
        "payload": payload,
    })


async def publish_event(
    redis: Redis,
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> None:
    """
    Publish a typed event to the workspace Redis channel.
    Called from Celery tasks after state changes.
    """
    try:
        message = _build_message(event_type, workspace_id, payload)
        await redis.publish(_channel(workspace_id), message)
        logger.info(
            "event_published",
            event_type=event_type,
            workspace_id=workspace_id,
        )
    except Exception as e:
        # Non-fatal — update is already stored in DB
        # Client will see correct state on next poll or reconnect
        logger.warning(
            "event_publish_failed",
            event_type=event_type,
            workspace_id=workspace_id,
            error=str(e),
        )
```

---

### Step 5: Celery App + Task

```python
# apps/api/app/workers/celery_app.py

from celery import Celery
from app.config import settings

celery_app = Celery(
    "soarup",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,          # Ack after task completes, not before
    task_reject_on_worker_lost=True,  # Requeue if worker dies mid-task
    worker_prefetch_multiplier=1, # One task at a time per worker process
)
```

```python
# apps/api/app/workers/tasks.py

import asyncio
from celery import Task
from celery.utils.log import get_task_logger

from app.workers.celery_app import celery_app
from app.config import settings

logger = get_task_logger(__name__)


class ProcessUpdateTask(Task):
    """
    Custom Task base class with async support and shared resources.
    Initialises DB session and Redis connection once per worker process.
    """
    abstract = True
    _db_engine = None
    _redis = None

    @property
    def db_engine(self):
        if self._db_engine is None:
            from sqlalchemy.ext.asyncio import create_async_engine
            self._db_engine = create_async_engine(settings.database_url)
        return self._db_engine

    @property
    def redis(self):
        if self._redis is None:
            from redis.asyncio import Redis
            self._redis = Redis.from_url(settings.redis_url)
        return self._redis


@celery_app.task(
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.process_update",
    max_retries=3,
    default_retry_delay=30,          # 30s → 60s → 120s (Celery doubles by default)
    autoretry_for=(Exception,),      # Retry on any exception
    retry_backoff=True,              # Exponential backoff
    retry_backoff_max=120,           # Cap at 120s
    retry_jitter=True,               # Add jitter to avoid thundering herd
    acks_late=True,
)
def process_update(self, update_id: str) -> None:
    """
    Process a submitted update through the Claude summarisation pipeline.

    Flow:
    1. Fetch update + workspace prompt config from DB
    2. Publish status → "processing"
    3. Build prompt (workspace custom or default)
    4. Call Claude Haiku (Sonnet fallback on first retry)
    5. Store summary, publish status → "processed"

    On max retries exceeded:
    6. Set status → "failed"
    7. Publish status → "failed"
    """
    asyncio.run(_process_update_async(self, update_id))


async def _process_update_async(task: ProcessUpdateTask, update_id: str) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.events import publish_event
    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_summarisation_prompt

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        update_repo = UpdateRepository.from_session(db)
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        # 1. Fetch records
        update = await update_repo.get_by_id(update_id)
        if not update:
            logger.warning("process_update_skipped", update_id=update_id, reason="not_found")
            return

        workspace = await workspace_repo.get_by_id(update.workspace_id)
        profile = await profile_repo.get_by_user_id(update.user_id)

        # 2. Set status → processing
        await update_repo.update_status(update, "processing")
        await publish_event(
            task.redis,
            "update.status_changed",
            update.workspace_id,
            {
                "update_id": update_id,
                "workspace_id": update.workspace_id,
                "update_date": update.update_date,
                "status": "processing",
                "summary": None,
            },
        )

        # 3. Build prompt
        # Use Sonnet fallback on retries (task.request.retries > 0)
        use_fallback = task.request.retries > 0
        prompt = build_summarisation_prompt(
            content=update.content,
            author_name=profile.full_name if profile else "the user",
            update_date=update.update_date,
            custom_prompt=workspace.summarisation_prompt if workspace else None,
        )

        try:
            # 4. Call Claude
            summary = await summarise(prompt, use_fallback=use_fallback)

            # 5. Store + publish success
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
            logger.info(
                "process_update_complete",
                update_id=update_id,
                retries=task.request.retries,
            )

        except Exception as exc:
            logger.warning(
                "process_update_failed",
                update_id=update_id,
                attempt=task.request.retries + 1,
                error=str(exc),
            )

            if task.request.retries >= task.max_retries:
                # Max retries exceeded — set terminal failed state
                await update_repo.update_status(update, "failed")
                await publish_event(
                    task.redis,
                    "update.status_changed",
                    update.workspace_id,
                    {
                        "update_id": update_id,
                        "workspace_id": update.workspace_id,
                        "update_date": update.update_date,
                        "status": "failed",
                        "summary": None,
                    },
                )
                logger.error(
                    "process_update_exhausted",
                    update_id=update_id,
                    max_retries=task.max_retries,
                )
                return

            # Re-raise for Celery to retry
            raise exc
```

Wire the task in `UpdateService.submit_update`:
```python
# apps/api/app/services/update_service.py
# Replace the commented placeholder:

# Milestone 3: uncomment this
from app.workers.tasks import process_update
process_update.delay(update.id)
```

Update `UpdateRepository` — add `update_status` method:
```python
async def update_status(
    self,
    update: Update,
    status: str,
    summary: str | None = None,
) -> Update:
    update.status = status
    if summary is not None:
        update.summary = summary
    await self.db.commit()
    await self.db.refresh(update)
    return update
```

---

### Step 6: FastAPI WebSocket Endpoint

Install `broadcaster` for clean Redis pub/sub integration with asyncio:
```
broadcaster[redis]>=0.3.0
```

```python
# apps/api/app/routers/websockets.py

import json
import structlog
from broadcaster import Broadcast
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.security import HTTPBearer

from app.config import settings
from app.utils.auth import validate_supabase_jwt_ws

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

# Broadcast instance — shared across all WebSocket connections
# Subscribes to Redis pub/sub channels
broadcast = Broadcast(settings.redis_url)


@router.websocket("/workspaces/{workspace_id}")
async def workspace_websocket(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(..., description="Supabase JWT access token"),
):
    """
    WebSocket endpoint for real-time workspace events.

    Authentication: JWT passed as query param ?token=<access_token>
    WebSocket headers cannot carry Authorization headers in browsers,
    so the token is passed as a query parameter and validated on connect.

    Channel: workspace:{workspace_id}
    Messages: WebSocketMessage envelope (type, payload, workspace_id,
              event_id, timestamp)
    """
    # Validate JWT before accepting connection
    try:
        payload = await validate_supabase_jwt_ws(token)
        user_id = payload["sub"]
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    logger.info("ws_connected", workspace_id=workspace_id, user_id=user_id)

    channel = f"workspace:{workspace_id}"

    try:
        async with broadcast.subscribe(channel=channel) as subscriber:
            async for event in subscriber:
                try:
                    message = json.loads(event.message)
                    await websocket.send_json(message)
                except Exception as e:
                    logger.warning(
                        "ws_send_failed",
                        workspace_id=workspace_id,
                        error=str(e),
                    )
                    break
    except WebSocketDisconnect:
        logger.info("ws_disconnected", workspace_id=workspace_id, user_id=user_id)
    except Exception as e:
        logger.warning("ws_error", workspace_id=workspace_id, error=str(e))
    finally:
        logger.info("ws_closed", workspace_id=workspace_id, user_id=user_id)
```

Add JWT validation for WebSocket (token from query param, not header):
```python
# apps/api/app/utils/auth.py — add this function

async def validate_supabase_jwt_ws(token: str) -> dict:
    """
    Validate a JWT token passed as a query parameter (WebSocket auth).
    WebSocket connections cannot send Authorization headers in browsers,
    so the token is passed in the URL query string instead.
    Reuses the same validation logic as validate_supabase_jwt.
    """
    from fastapi.security import HTTPAuthorizationCredentials
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token,
    )
    return await validate_supabase_jwt(credentials)
```

Startup/shutdown lifecycle for `broadcast` in `main.py`:
```python
# apps/api/app/main.py

from app.routers.websockets import broadcast

@app.on_event("startup")
async def startup():
    await broadcast.connect()

@app.on_event("shutdown")
async def shutdown():
    await broadcast.disconnect()

app.include_router(websockets.router, prefix="/api/v1")
```

---

### Step 7: UpdateRepository update_status

Already shown in Step 5 above — add `update_status` method to the repo.

---

## Frontend — Build Order

### Step 1: WebSocket Zustand Store

```typescript
// apps/web/src/stores/websocket-store.ts
// Connection state only — subscription handlers live in the registry below.

import { create } from "zustand";

export type WsStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface WebSocketState {
  status: WsStatus;
  lastEventId: string | null;
  reconnectAttempts: number;
  setStatus: (status: WsStatus) => void;
  setLastEventId: (id: string) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

export const useWebSocketStore = create<WebSocketState>()((set) => ({
  status: "idle",
  lastEventId: null,
  reconnectAttempts: 0,
  setStatus: (status) => set({ status }),
  setLastEventId: (id) => set({ lastEventId: id }),
  incrementReconnectAttempts: () =>
    set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
}));
```

---

### Step 2: WebSocket Message Types

```typescript
// apps/web/src/lib/websocket/types.ts

// The envelope every server message conforms to
export interface WebSocketMessage<T = unknown> {
  type: string;
  workspace_id: string;
  event_id: string;
  timestamp: string;
  payload: T;
}

// Payload types per event — add new types per milestone

// Milestone 3
export interface UpdateStatusChangedPayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
  status: "pending" | "processing" | "processed" | "failed";
  summary: string | null;
}

// Milestone 4 (reserved — define payload when building)
export interface AudioTranscriptionPayload {
  update_id: string;
  workspace_id: string;
  progress?: number;   // 0-100 for progress events
  transcript?: string; // populated on complete
}

// Milestone 5 (reserved)
export interface MemberUpdateSubmittedPayload {
  update_id: string;
  workspace_id: string;
  user_id: string;
  update_date: string;
}
```

---

### Step 3: Subscription Registry

```typescript
// apps/web/src/lib/websocket/registry.ts
// Module-level singleton — lives outside React and Zustand.
// Handlers are React lifecycle-dependent so they cannot live in Zustand.
// The registry is the bridge between the WebSocket connection and React hooks.

type Handler<T = unknown> = (payload: T) => void;

const handlers = new Map<string, Set<Handler>>();

export function subscribe<T = unknown>(
  type: string,
  handler: Handler<T>,
): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler as Handler);
  // Returns unsubscribe function — call in useEffect cleanup
  return () => {
    handlers.get(type)?.delete(handler as Handler);
  };
}

export function dispatch(message: { type: string; payload: unknown }): void {
  handlers.get(message.type)?.forEach((h) => h(message.payload));
}

// For testing — clear all handlers between tests
export function clearAllHandlers(): void {
  handlers.clear();
}
```

---

### Step 4: useWebSocket Hook

```typescript
// apps/web/src/hooks/useWebSocket.ts
// Manages the WebSocket connection lifecycle.
// Reconnects with exponential backoff + jitter on dropout.
// Integrates with React Query to invalidate stale data on reconnect.

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocketStore } from "@/stores/websocket-store";
import { dispatch, subscribe } from "@/lib/websocket/registry";
import { updateKeys } from "@/hooks/useUpdates";
import { format } from "date-fns";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/api/v1/ws";

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

function getReconnectDelay(attempt: number): number {
  const exponential = Math.min(
    BASE_DELAY_MS * Math.pow(2, attempt),
    MAX_DELAY_MS,
  );
  // Full jitter: random value between 0 and the exponential cap
  return exponential * (0.5 + Math.random() * 0.5);
}

interface UseWebSocketOptions {
  workspaceId: string | undefined;
  accessToken: string | undefined;
  enabled?: boolean;
}

export function useWebSocket({
  workspaceId,
  accessToken,
  enabled = true,
}: UseWebSocketOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const {
    setStatus,
    setLastEventId,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reconnectAttempts,
  } = useWebSocketStore();

  const connect = useCallback(() => {
    if (!workspaceId || !accessToken || !enabled) return;

    const url = `${WS_BASE}/workspaces/${workspaceId}?token=${accessToken}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("connected");
      resetReconnectAttempts();

      // Invalidate today's updates on reconnect to catch missed events
      queryClient.invalidateQueries({
        queryKey: updateKeys.byDate(workspaceId, format(new Date(), "yyyy-MM-dd")),
      });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event_id) setLastEventId(message.event_id);
        dispatch(message);
      } catch (e) {
        console.warn("WebSocket message parse error", e);
      }
    };

    ws.onclose = (event) => {
      // 4001 = unauthorized — do not reconnect
      if (event.code === 4001) {
        setStatus("error");
        return;
      }

      setStatus(
        reconnectAttempts < MAX_RECONNECT_ATTEMPTS ? "reconnecting" : "disconnected",
      );

      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        setStatus("disconnected");
        return;
      }

      const delay = getReconnectDelay(reconnectAttempts);
      incrementReconnectAttempts();

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [workspaceId, accessToken, enabled, reconnectAttempts]);

  useEffect(() => {
    connect();
    return () => {
      reconnectTimeoutRef.current && clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
      setStatus("idle");
      resetReconnectAttempts();
    };
  }, [connect]);

  return { subscribe };
}
```

---

### Step 5: useDashboardUpdates — WebSocket Handler

```typescript
// apps/web/src/hooks/useDashboardUpdates.ts
// Registers a WebSocket handler that updates the React Query cache
// when update.status_changed events arrive.
// Import this hook in the dashboard page — it self-registers on mount.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribe } from "@/lib/websocket/registry";
import { updateKeys, UpdateResponse } from "@/hooks/useUpdates";
import type {
  UpdateStatusChangedPayload,
} from "@/lib/websocket/types";

interface UpdateListCache {
  updates: UpdateResponse[];
  total: number;
}

export function useDashboardUpdates(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    return subscribe<UpdateStatusChangedPayload>(
      "update.status_changed",
      (payload) => {
        if (payload.workspace_id !== workspaceId) return;

        // Update the specific update in the cache without a full refetch
        queryClient.setQueryData<UpdateListCache>(
          updateKeys.byDate(workspaceId, payload.update_date),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              updates: old.updates.map((u) =>
                u.id === payload.update_id
                  ? { ...u, status: payload.status, summary: payload.summary }
                  : u,
              ),
            };
          },
        );
      },
    );
  }, [workspaceId, queryClient]);
}
```

---

### Step 6: Dashboard Page Updates

Wire `useWebSocket` and `useDashboardUpdates` into the dashboard page:

```typescript
// apps/web/src/app/(app)/dashboard/page.tsx — additions

import { useWebSocket } from "@/hooks/useWebSocket";
import { useDashboardUpdates } from "@/hooks/useDashboardUpdates";

// Inside DashboardPage component:
const { tokens } = useAuth();
const { data: workspace } = useWorkspace();

// Connect WebSocket — workspace-scoped, reconnects automatically
useWebSocket({
  workspaceId: workspace?.id,
  accessToken: tokens?.access_token,
  enabled: !!workspace?.id && !!tokens?.access_token,
});

// Register update.status_changed handler
useDashboardUpdates(workspace?.id);

// No other dashboard changes needed — UpdateCard rerenders
// automatically when React Query cache updates via setQueryData
```

---

### Step 7: UpdateCard Visual Updates

Add summary display and updated status badge to `UpdateCard`:

```tsx
// apps/web/src/components/domain/updates/update-card.tsx

// Summary section — shown when status === "processed" and summary exists
{update.status === "processed" && update.summary && (
  <div className="mt-3 pl-3 border-l-2 border-primary-container">
    <p className="font-headline italic text-sm text-on-surface-variant leading-relaxed">
      {update.summary}
    </p>
  </div>
)}

// Processing skeleton — shown when status === "processing"
{update.status === "processing" && (
  <div className="mt-3 space-y-2 animate-pulse">
    <div className="h-3 bg-surface-high rounded-card w-3/4" />
    <div className="h-3 bg-surface-high rounded-card w-1/2" />
  </div>
)}

// Status badge with connection indicator dot
const STATUS_CONFIG = {
  pending:    { label: "Processing...", dotClass: "bg-amber-400 animate-pulse" },
  processing: { label: "Processing...", dotClass: "bg-amber-400 animate-pulse" },
  processed:  { label: "Summarised",   dotClass: "bg-primary"                 },
  failed:     { label: "Failed",       dotClass: "bg-error"                   },
};
```

---

### Step 8: WebSocket Connection Indicator

Add to `Sidebar`:
```tsx
// apps/web/src/components/layout/sidebar.tsx

import { useWebSocketStore } from "@/stores/websocket-store";

function ConnectionIndicator() {
  const status = useWebSocketStore((s) => s.status);

  if (status === "connected" || status === "idle") {
    return <span className="w-2 h-2 rounded-full bg-primary inline-block" />;
  }
  if (status === "reconnecting") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-label text-outline">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
        Reconnecting...
      </span>
    );
  }
  if (status === "disconnected" || status === "error") {
    return (
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 text-[10px] font-label text-error hover:underline"
      >
        <span className="w-2 h-2 rounded-full bg-error inline-block" />
        Connection lost — reconnect
      </button>
    );
  }
  return null;
}
```

---

## Storybook Stories (tail end of milestone)

### Missing M2 stories to add

**`DashboardView` refactor (prerequisite):**
Before writing the dashboard story, extract a `DashboardView` presentational
component from `dashboard/page.tsx`:

```typescript
// apps/web/src/components/domain/dashboard/dashboard-view.tsx

interface DashboardViewProps {
  updates: UpdateResponse[];
  isLoading: boolean;
  hasSubmittedToday: boolean;
  showForm: boolean;
  currentUserId: string;
  workspaceId: string;
  onSubmitClick: () => void;
  onFormSubmit: (content: string) => Promise<void>;
  onFormCancel: () => void;
  onEdit: (updateId: string, content: string) => Promise<void>;
  onDelete: (updateId: string, updateDate: string) => Promise<void>;
  isSubmitting?: boolean;
}
```

Dashboard page becomes a thin data wrapper that passes React Query results
into `DashboardView`. Stories test `DashboardView` directly.

**Stories to create:**
```
src/stories/layout/AppShell.stories.tsx
src/stories/layout/Sidebar.stories.tsx
src/stories/layout/TopBar.stories.tsx
src/stories/domain/DashboardView.stories.tsx   ← uses DashboardView component
```

### New M3 stories

```
src/stories/domain/UpdateCard.stories.tsx      ← add Processing, Summarised,
                                                  Failed story variants
src/stories/ui/ConnectionIndicator.stories.tsx ← all 4 status states
```

All stories follow the four-story standard: Dark, Light, MobileDark, MobileLight.
Use `withAuthStore()` decorator for stories requiring auth state.
Mock `useWebSocketStore` in AppShell/Sidebar stories via Vitest mock.

---

## Unit Tests (tail end of milestone)

### Backend tests

```
tests/unit/test_process_update_task.py
  ← mock Claude client + mock Redis publisher
  ← happy path: pending → processing → processed
  ← Haiku primary, Sonnet fallback on retry
  ← max retries → failed status + event published
  ← update not found → early return (no error)
  ← custom workspace prompt used when set
  ← default prompt used when workspace.summarisation_prompt is None

tests/unit/test_claude_client.py
  ← mock anthropic.AsyncAnthropic
  ← summarise() returns text content
  ← use_fallback=True uses FALLBACK_MODEL
  ← APIError propagates (not swallowed)

tests/unit/test_events.py
  ← publish_event publishes to correct channel
  ← unknown event_type raises ValueError
  ← Redis failure is logged but does not raise

tests/unit/test_websocket_router.py
  ← invalid token → close 4001
  ← valid token → accept + subscribe to channel
  ← message forwarded from Redis to WebSocket client
```

### Frontend unit tests

```
src/hooks/useWebSocket.test.ts
  ← connects to correct URL with token
  ← dispatches parsed messages to registry
  ← reconnects with exponential backoff on close
  ← does not reconnect on 4001 close code
  ← invalidates queries on reconnect
  ← cleans up on unmount

src/hooks/useDashboardUpdates.test.ts
  ← updates cache when update.status_changed received
  ← ignores events for different workspace_id
  ← unsubscribes on unmount

src/lib/websocket/registry.test.ts
  ← subscribe registers handler
  ← dispatch calls correct handlers
  ← unsubscribe removes handler
  ← multiple handlers for same type all called
  ← handlers for different types not cross-called

src/components/layout/AppShell.test.tsx
  ← redirects to /login when not authenticated
  ← redirects to /onboarding when needsOnboarding
  ← renders children when authenticated + onboarded

src/components/layout/Sidebar.test.tsx
  ← renders workspace name
  ← active link highlighted for current path
  ← sign out calls logout()

src/components/layout/TopBar.test.tsx
  ← renders page title
  ← renders ThemeToggle
```

---

## Known Tradeoffs

**1. asyncio.run() in Celery task**
`asyncio.run()` creates a new event loop per task invocation. This is
correct for Celery which runs tasks in a synchronous context, but adds
~1-2ms overhead per task. Acceptable at SoarUp's scale. Alternative:
`celery-pool-asyncio` package, but adds complexity without measurable benefit.

**2. Token in WebSocket URL query param**
JWT in the URL is visible in server access logs. Mitigations: HTTPS in
production (URL encrypted in transit), short token expiry (1 hour),
token rotation on reconnect. Standard tradeoff for browser WebSockets
which cannot send Authorization headers. Used by Pusher, Ably, etc.

**3. broadcaster library limitations**
`broadcaster` does not support Redis Streams — it uses plain pub/sub
with no message persistence. Events published while a client is
disconnected are lost. Mitigated by query invalidation on reconnect.
Migration to Redis Streams in Milestone 5 if message loss becomes
a problem with team real-time updates.

**4. N+1 profile queries in UpdateService._to_response**
Still present from M2. Batch fetch deferred to M5.

**5. Workspace prompt config not access-controlled**
Any authenticated, onboarded user can update the workspace prompt via
PATCH /workspaces/:id/prompts. Owner-only restriction added in M5
when role-based access control lands.

---

## Testing Scope Summary

### Backend
```
test_process_update_task.py   ← Celery task lifecycle
test_claude_client.py         ← Claude API wrapper
test_events.py                ← Redis publisher
test_websocket_router.py      ← WS auth + message forwarding
```

### Frontend
```
useWebSocket.test.ts          ← connection lifecycle + reconnect
useDashboardUpdates.test.ts   ← cache update on WS event
registry.test.ts              ← pub/sub correctness
AppShell.test.tsx             ← auth guards
Sidebar.test.tsx              ← nav + workspace name
TopBar.test.tsx               ← renders correctly
```

---

## Acceptance Criteria

```
[ ] Submitted update transitions: pending → processing → processed
[ ] "Processing..." badge animates while status is pending/processing
[ ] AI summary appears on UpdateCard without page refresh
[ ] Failed tasks show "Failed" badge after 3 retries
[ ] WebSocket connects on dashboard load, disconnects on logout
[ ] Reconnects automatically with exponential backoff + jitter
[ ] Max 10 reconnect attempts — then shows manual reconnect UI
[ ] Query cache invalidated on reconnect to catch missed events
[ ] Haiku used for first attempt, Sonnet used on retry
[ ] Workspace summarisation_prompt config endpoint works
[ ] Custom prompt used when configured, default when null
[ ] All event types validated against EVENT_TYPES registry
[ ] Redis publish failure is logged but does not fail the task
[ ] Invalid WS token → close code 4001, no reconnect attempt
[ ] Connection indicator in sidebar reflects live status
[ ] Backend unit tests pass for task, Claude client, events, WS router
[ ] Frontend unit tests pass for WS hooks, registry, layout components
[ ] Storybook stories added for AppShell, Sidebar, TopBar, DashboardView
[ ] CI passes on feature/milestone-3 branch
```

---

## Files To Create Summary

### Backend (apps/api/)
```
app/lib/claude.py
app/lib/events.py
app/workers/celery_app.py
app/workers/tasks.py
app/workers/prompts.py
app/routers/websockets.py
alembic/versions/YYYYMMDD_*_add_prompt_config_to_workspaces.py
tests/unit/test_process_update_task.py
tests/unit/test_claude_client.py
tests/unit/test_events.py
tests/unit/test_websocket_router.py
```

### Frontend (apps/web/src/)
```
stores/websocket-store.ts
lib/websocket/types.ts
lib/websocket/registry.ts
hooks/useWebSocket.ts
hooks/useDashboardUpdates.ts
components/domain/dashboard/dashboard-view.tsx   ← refactor from page
components/layout/sidebar.tsx                    ← add ConnectionIndicator
stories/layout/AppShell.stories.tsx
stories/layout/Sidebar.stories.tsx
stories/layout/TopBar.stories.tsx
stories/domain/DashboardView.stories.tsx
stories/domain/UpdateCard.stories.tsx            ← add M3 status variants
stories/ui/ConnectionIndicator.stories.tsx
tests/unit/useWebSocket.test.ts
tests/unit/useDashboardUpdates.test.ts
tests/unit/registry.test.ts
tests/unit/AppShell.test.tsx
tests/unit/Sidebar.test.tsx
tests/unit/TopBar.test.tsx
```

### Updated files
```
apps/api/app/models/workspace.py        ← add summarisation_prompt, digest_prompt
apps/api/app/schemas/workspace.py       ← add UpdateWorkspacePromptsRequest
apps/api/app/routers/workspaces.py      ← add PATCH /:id/prompts endpoint
apps/api/app/repositories/update_repo.py ← add update_status method
apps/api/app/services/update_service.py ← wire process_update.delay()
apps/api/app/utils/auth.py              ← add validate_supabase_jwt_ws
apps/api/app/api/__init__.py            ← export handle_update_error (if not done)
apps/api/app/main.py                    ← register WS router + broadcast lifecycle
apps/web/src/app/(app)/dashboard/page.tsx ← wire useWebSocket + useDashboardUpdates
apps/web/src/components/domain/updates/update-card.tsx ← summary display + skeleton
```
