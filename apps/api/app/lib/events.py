# apps/api/app/lib/events.py
# Publishes and reads WebSocket events via Redis Streams.
#
# Migration from pub/sub to Streams (Milestone 5):
#   - pub/sub: fire-and-forget, no history, dropped messages on reconnect
#   - Streams: append-only log, persistent, clients resume from last_event_id
#
# Stream key naming: workspace:{workspace_id}:events
#
# Each entry in the stream is a flat hash:
#   { "data": "<json-encoded event envelope>" }
#
# The stream entry ID returned by xadd IS the event_id — the WebSocket
# router attaches it to the envelope before forwarding to the client.
# Clients pass it back as ?last_event_id= on reconnect to resume cleanly.
#
# Retention: MAXLEN ~1000 per workspace (approximate trim).

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)

STREAM_MAXLEN = 1000
XREAD_BLOCK_MS = 5000  # block up to 5s waiting for new entries
XREAD_COUNT = 10  # max entries to read per call

# All valid event types — add new types here as milestones add features
EVENT_TYPES = {
    # Milestone 3
    "update.status_changed",
    # Milestone 4
    "audio.transcription_started",
    "audio.transcription_complete",
    "audio.transcription_failed",
    # Milestone 5
    "member.update_submitted",
    "member.joined",
    "member.left",
}


def _stream_key(workspace_id: str) -> str:
    return f"workspace:{workspace_id}:events"


def _build_envelope(
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Build a standard event envelope dict.

    event_id is a placeholder UUID here — the WebSocket router replaces it
    with the real Redis stream entry ID before forwarding to the client,
    so the client always sees the resumable ID, not a throwaway UUID.
    """
    return {
        "type": event_type,
        "workspace_id": workspace_id,
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(UTC).isoformat(),
        "payload": payload,
    }


async def append_event(
    redis: Redis,
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> str:
    """
    Append a typed event to the workspace Redis Stream.

    Args:
        redis: Async Redis client instance.
        event_type: Must be a key in EVENT_TYPES.
        workspace_id: Workspace UUID the event belongs to.
        payload: Arbitrary event-specific data dict.

    Returns:
        Redis stream entry ID string (e.g. "1717430400000-0").
        Empty string on Redis failure (non-fatal).

    Raises:
        ValueError: If event_type is not in EVENT_TYPES.
    """
    if event_type not in EVENT_TYPES:
        raise ValueError(f"Unknown event type: {event_type!r}")

    try:
        envelope = _build_envelope(event_type, workspace_id, payload)
        entry_id: str = await redis.xadd(
            _stream_key(workspace_id),
            {"data": json.dumps(envelope)},
            maxlen=STREAM_MAXLEN,
            approximate=True,
        )
        await redis.expire(_stream_key(workspace_id), 30 * 24 * 60 * 60)
        logger.info(
            "event_appended",
            event_type=event_type,
            workspace_id=workspace_id,
            entry_id=entry_id,
        )
        return entry_id

    except ValueError:
        raise
    except Exception as e:
        logger.warning(
            "event_append_failed",
            event_type=event_type,
            workspace_id=workspace_id,
            error=str(e),
        )
        return ""


async def read_events(
    redis: Redis,
    workspace_id: str,
    last_event_id: str = "$",
) -> list[dict[str, Any]]:
    """
    Read new events from the workspace stream since last_event_id.

    Blocks up to XREAD_BLOCK_MS milliseconds waiting for new entries,
    then returns whatever arrived (empty list on timeout).

    Args:
        redis: Async Redis client instance.
        workspace_id: Workspace UUID to read events for.
        last_event_id: Resume cursor. Use "$" on fresh connect to receive
                       only new events. Pass the last received stream entry
                       ID on reconnect to replay missed events.

    Returns:
        List of decoded event envelope dicts in stream order.
        The "event_id" field in each envelope is the Redis stream entry ID.
        Empty list if no new events arrived within the block window.
    """
    try:
        results = await redis.xread(
            {_stream_key(workspace_id): last_event_id},
            count=XREAD_COUNT,
            block=XREAD_BLOCK_MS,
        )
    except Exception as e:
        logger.warning(
            "event_read_failed",
            workspace_id=workspace_id,
            error=str(e),
        )
        return []

    if not results:
        return []

    events: list[dict[str, Any]] = []
    # results shape: list of [stream_key_bytes, [(entry_id_bytes, fields_dict), ...]]
    for _key, entries in results:
        for entry_id, fields in entries:
            try:
                envelope = json.loads(fields["data"])
                # Overwrite the placeholder UUID with the real stream entry ID
                # so the client can use it as last_event_id on reconnect.
                envelope["event_id"] = entry_id
                events.append(envelope)
            except Exception as e:
                logger.warning(
                    "event_decode_failed",
                    workspace_id=workspace_id,
                    entry_id=entry_id,
                    error=str(e),
                )

    return events
