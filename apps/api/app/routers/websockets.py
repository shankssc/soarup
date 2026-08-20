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

from typing import Any

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis

from app.config import settings
from app.lib.events import read_events
from app.utils.auth import validate_supabase_jwt_ws

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


def _get_redis() -> Redis | Any:
    """
    Create a dedicated Redis connection for this WebSocket session.

    A per-connection client is used rather than a shared pool because
    xread with block=N holds the connection open for up to N milliseconds.
    Sharing a pooled connection would starve other callers during that window.
    """
    return Redis.from_url(settings.redis_url, decode_responses=True)


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
        connect → validate JWT → accept → xread loop →
        forward events → disconnect → cleanup Redis connection
    """
    try:
        payload = await validate_supabase_jwt_ws(token)
        user_id = payload["sub"]
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    logger.info("ws_connected", workspace_id=workspace_id, user_id=user_id)

    redis: Redis = _get_redis()
    cursor = last_event_id

    try:
        while True:
            events = await read_events(redis, workspace_id, last_event_id=cursor)

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
        await redis.aclose()
        logger.info("ws_closed", workspace_id=workspace_id, user_id=user_id)
