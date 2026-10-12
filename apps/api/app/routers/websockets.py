# apps/api/app/routers/websockets.py
# WebSocket endpoint for real-time workspace events.
#
# Migration from broadcaster/pub-sub to Redis Streams (Milestone 5):
#   - broadcaster dependency removed entirely
#   - broadcast module-level instance removed — remove from main.py imports
#   - lifespan broadcast.connect() / broadcast.disconnect() removed from main.py
#   - xread loop replaces broadcast.subscribe context manager
#   - last_event_id query param added for resumable reconnect
#
# main.py changes required (see bottom of this file):
#   REMOVE: from app.routers.websockets import broadcast
#   REMOVE: await broadcast.connect() / await broadcast.disconnect() from lifespan

import asyncio
import contextlib
import re
import time
from typing import Any

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.lib.events import read_events
from app.repositories.workspace_repo import WorkspaceRepository
from app.utils.auth import validate_supabase_jwt_ws

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

_LAST_EVENT_ID_RE = re.compile(r"^(\$|0|\d+-\d+)$")


def _get_redis() -> Redis | Any:
    """
    Create a dedicated Redis connection for this WebSocket session.

    A per-connection client is used rather than a shared pool because
    xread with block=N holds the connection open for up to N milliseconds.
    Sharing a pooled connection would starve other callers during that window.
    """
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def _watch_for_disconnect(websocket: WebSocket) -> None:
    """
    Waits for the client to actually disconnect, run as a concurrent task
    alongside the xread loop. Without this, a closed client is only
    noticed on the next failed send_json — on a quiet workspace with no
    new events, that could be arbitrarily long after the client actually
    left, leaving the dedicated Redis connection and server-side loop
    alive for no reason.
    """
    while True:
        message = await websocket.receive()
        if message.get("type") == "websocket.disconnect":
            raise WebSocketDisconnect(code=message.get("code") or 1000)


@router.websocket("/workspaces/{workspace_id}")
async def workspace_websocket(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(..., description="Supabase JWT access token"),
    last_event_id: str = Query(
        default="$",
        description=("Redis stream entry ID to resume from. " "Pass the last received event_id on reconnect to replay missed events. " "Omit or pass '$' on fresh connect to receive only new events."),
    ),
) -> None:
    """
    WebSocket endpoint for real-time workspace events.

    Authentication:
        JWT passed as ?token=<access_token> query param.
        Browsers cannot send Authorization headers on WebSocket connections.
        Invalid/expired tokens close the connection with code 4001 —
        the frontend treats 4001 as non-retryable (no reconnect attempt).
        A valid token for a workspace the user isn't a member of closes
        with code 4003 — also non-retryable.
        The connection is closed (code 1000, retryable) proactively at
        the token's own expiry, rather than waiting for the next call to
        fail — the client reconnects with a fresh token from its own
        auth state.

    Resumable reconnect:
        Clients track the last received event_id and pass it as
        ?last_event_id= on reconnect. The xread loop resumes from that
        position in the stream, replaying any events missed during the
        disconnect. Fresh connects use last_event_id="$" (new events only).

    Message envelope:
        {
            "type": "update.status_changed",
            "workspace_id": "...",
            "event_id": "<redis-stream-entry-id>",
            "timestamp": "...",
            "payload": { ... }
        }

    Lifecycle:
        connect → accept → validate JWT → membership check → xread loop
        (concurrently watching for client disconnect and token expiry) →
        forward events → disconnect → cleanup Redis connection

    Note: accept() happens before JWT validation, not after. Closing a
    WebSocket pre-accept() surfaces to real browsers as a rejected
    handshake (code 1006), not our custom 4001/4003 — the frontend can't
    tell "bad token" apart from "network blip" that way, and a
    persistently invalid token would retry up to MAX_RECONNECT_ATTEMPTS
    times against the same 1006 for no reason. Accepting first and
    closing with an explicit code afterward is the only way the frontend
    can reliably tell these apart.
    """
    await websocket.accept()

    try:
        payload = await validate_supabase_jwt_ws(token)
        user_id = payload["sub"]
        expires_at = payload.get("exp")
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    async with AsyncSessionLocal() as db:
        member = await WorkspaceRepository.from_session(db).get_member(workspace_id, user_id)

    if not member:
        logger.warning("ws_non_member", workspace_id=workspace_id, user_id=user_id)
        await websocket.close(code=4003, reason="Not a member of this workspace")
        return

    logger.info("ws_connected", workspace_id=workspace_id, user_id=user_id)

    # Sanitize last_event_id before it ever reaches XREAD — a malformed
    # value currently makes read_events swallow the Redis error and return
    # [] immediately, spinning the while-loop with no delay.
    if not _LAST_EVENT_ID_RE.match(last_event_id):
        logger.warning(
            "ws_invalid_last_event_id",
            workspace_id=workspace_id,
            user_id=user_id,
            last_event_id=last_event_id,
        )
        last_event_id = "$"

    redis: Redis = _get_redis()
    cursor = last_event_id

    disconnect_task = asyncio.create_task(_watch_for_disconnect(websocket))

    expiry_task: asyncio.Task[None] | None = None
    if expires_at is not None:
        delay = max(0, expires_at - time.time())
        expiry_task = asyncio.create_task(asyncio.sleep(delay))

    watch_tasks = {disconnect_task}
    if expiry_task is not None:
        watch_tasks.add(expiry_task)

    try:
        while True:
            read_task = asyncio.create_task(read_events(redis, workspace_id, last_event_id=cursor))

            done, _pending = await asyncio.wait(watch_tasks | {read_task}, return_when=asyncio.FIRST_COMPLETED)

            if expiry_task is not None and expiry_task in done:
                read_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await read_task
                logger.info("ws_token_expired", workspace_id=workspace_id, user_id=user_id)
                await websocket.close(code=1000, reason="Token expired")
                return

            if disconnect_task in done:
                read_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await read_task
                disconnect_task.result()  # re-raises WebSocketDisconnect

            events = read_task.result()

            for event in events:
                try:
                    await websocket.send_json(event)
                    # Advance cursor so the next xread starts after this entry
                    cursor = event["event_id"]
                except WebSocketDisconnect:
                    raise
                except Exception as e:
                    logger.warning(
                        "ws_send_failed",
                        workspace_id=workspace_id,
                        user_id=user_id,
                        error=str(e),
                    )
                    return

    except WebSocketDisconnect:
        logger.info("ws_disconnected", workspace_id=workspace_id, user_id=user_id)
    except Exception as e:
        logger.warning("ws_error", workspace_id=workspace_id, user_id=user_id, error=str(e))
    finally:
        disconnect_task.cancel()
        if expiry_task is not None:
            expiry_task.cancel()
        await redis.aclose()
        logger.info("ws_closed", workspace_id=workspace_id, user_id=user_id)
