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
    return json.dumps(
        {
            "type": event_type,
            "workspace_id": workspace_id,
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.now(UTC).isoformat(),
            "payload": payload,
        }
    )


async def publish_event(
    redis: Redis,
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> None:
    """
    Publish a typed event to the workspace Redis channel.
    Called from Celery tasks after state changes.

    Failures are logged as warnings but never re-raised — the update is
    already persisted to the DB at this point, so a Redis failure is
    non-fatal. The client will see correct state on the next poll or
    on reconnect via query invalidation.

    Raises:
        ValueError: If event_type is not in EVENT_TYPES. This is a
                    programming error and should not be caught by callers.
    """
    try:
        message = _build_message(event_type, workspace_id, payload)
        await redis.publish(_channel(workspace_id), message)
        logger.info(
            "event_published",
            event_type=event_type,
            workspace_id=workspace_id,
        )
    except ValueError:
        # Unknown event_type is a programming error — re-raise so it
        # surfaces immediately rather than being silently swallowed.
        raise
    except Exception as e:
        # Redis failures are non-fatal — log and continue.
        logger.warning(
            "event_publish_failed",
            event_type=event_type,
            workspace_id=workspace_id,
            error=str(e),
        )
