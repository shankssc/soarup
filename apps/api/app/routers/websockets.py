# apps/api/app/routers/websockets.py
# WebSocket endpoint for real-time workspace events.
# Subscribes to Redis pub/sub channels via broadcaster and forwards
# events to connected clients.

import json

import structlog
from broadcaster import Broadcast
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.config import settings
from app.utils.auth import validate_supabase_jwt_ws

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

# Module-level broadcast instance — shared across all WebSocket connections.
# Imported by main.py for connect/disconnect lifecycle management.
broadcast = Broadcast(settings.redis_url)


@router.websocket("/workspaces/{workspace_id}")
async def workspace_websocket(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(..., description="Supabase JWT access token"),
) -> None:
    """
    WebSocket endpoint for real-time workspace events.

    Authentication:
        JWT passed as query parameter ?token=<access_token>.
        Browsers cannot send Authorization headers on WebSocket connections,
        so the token is passed in the URL and validated on connect.
        Invalid or expired tokens close the connection with code 4001 —
        the frontend treats 4001 as a non-retryable error (no reconnect).

    Channel:
        workspace:{workspace_id} — all members of a workspace share one channel.

    Message envelope:
        {
            "type": "update.status_changed",
            "workspace_id": "...",
            "event_id": "...",
            "timestamp": "...",
            "payload": { ... }
        }

    Lifecycle:
        connect → validate JWT → accept → subscribe to channel →
        forward events → disconnect (client or error) → cleanup
    """
    # Validate JWT before accepting the connection.
    # Closing before accept() sends the close code without a handshake —
    # this is the correct pattern for pre-accept rejection.
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
            async for event in subscriber:  # type: ignore[union-attr]
                if event is None:
                    continue
                try:
                    message = json.loads(event.message)
                    await websocket.send_json(message)
                except Exception as e:
                    logger.warning(
                        "ws_send_failed",
                        workspace_id=workspace_id,
                        user_id=user_id,
                        error=str(e),
                    )
                    break
    except WebSocketDisconnect:
        logger.info("ws_disconnected", workspace_id=workspace_id, user_id=user_id)
    except Exception as e:
        logger.warning("ws_error", workspace_id=workspace_id, user_id=user_id, error=str(e))
    finally:
        logger.info("ws_closed", workspace_id=workspace_id, user_id=user_id)
