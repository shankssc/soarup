# apps/api/tests/unit/test_events.py
# Tests for the Redis event streamer (app/lib/events.py).
#
# Strategy:
#   - Redis client patched via AsyncMock — no real Redis connection
#   - Tests cover: append_event happy path, unknown event type ValueError,
#     Redis failure non-fatal behaviour, read_events happy path,
#     reconnect cursor handling, empty/timeout response, decode errors

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.lib.events import (
    EVENT_TYPES,
    STREAM_MAXLEN,
    _build_envelope,
    _stream_key,
    append_event,
    read_events,
)

WORKSPACE_ID = "ws-test-123"
VALID_EVENT_TYPE = "update.status_changed"
ENTRY_ID = "1717430400000-0"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_redis(
    xadd_return: str = ENTRY_ID,
    xread_return: Any = None,
) -> MagicMock:
    redis = MagicMock()
    redis.xadd = AsyncMock(return_value=xadd_return)
    redis.xread = AsyncMock(return_value=xread_return or [])
    return redis


def _make_xread_result(
    workspace_id: str,
    entries: list[tuple[str, dict[str, str]]],
) -> list[Any]:
    """
    Build a fake xread return value matching Redis's actual response shape:
    [ [stream_key_bytes, [(entry_id, fields_dict), ...]] ]
    """
    stream_key = _stream_key(workspace_id).encode()
    return [[stream_key, entries]]


# ---------------------------------------------------------------------------
# _stream_key
# ---------------------------------------------------------------------------


class TestStreamKey:
    def test_format(self):
        assert _stream_key("ws-abc") == "workspace:ws-abc:events"

    def test_different_workspaces_produce_different_keys(self):
        assert _stream_key("ws-1") != _stream_key("ws-2")


# ---------------------------------------------------------------------------
# _build_envelope
# ---------------------------------------------------------------------------


class TestBuildEnvelope:
    def test_contains_required_fields(self):
        envelope = _build_envelope(VALID_EVENT_TYPE, WORKSPACE_ID, {"update_id": "u1"})
        assert envelope["type"] == VALID_EVENT_TYPE
        assert envelope["workspace_id"] == WORKSPACE_ID
        assert "event_id" in envelope
        assert "timestamp" in envelope
        assert envelope["payload"] == {"update_id": "u1"}

    def test_timestamp_is_iso_format(self):
        envelope = _build_envelope(VALID_EVENT_TYPE, WORKSPACE_ID, {})
        from datetime import datetime

        # Should parse without raising
        datetime.fromisoformat(envelope["timestamp"])

    def test_event_id_is_uuid_placeholder(self):
        import uuid

        envelope = _build_envelope(VALID_EVENT_TYPE, WORKSPACE_ID, {})
        # Placeholder is a valid UUID — gets replaced by stream entry ID in read_events
        uuid.UUID(envelope["event_id"])


# ---------------------------------------------------------------------------
# append_event
# ---------------------------------------------------------------------------


class TestAppendEvent:
    async def test_returns_stream_entry_id(self):
        redis = _make_redis(xadd_return=ENTRY_ID)
        result = await append_event(redis, VALID_EVENT_TYPE, WORKSPACE_ID, {"update_id": "u1"})
        assert result == ENTRY_ID

    async def test_calls_xadd_with_correct_stream_key(self):
        redis = _make_redis()
        await append_event(redis, VALID_EVENT_TYPE, WORKSPACE_ID, {})
        call_args = redis.xadd.call_args
        assert call_args.args[0] == _stream_key(WORKSPACE_ID)

    async def test_calls_xadd_with_maxlen(self):
        redis = _make_redis()
        await append_event(redis, VALID_EVENT_TYPE, WORKSPACE_ID, {})
        call_kwargs = redis.xadd.call_args.kwargs
        assert call_kwargs["maxlen"] == STREAM_MAXLEN
        assert call_kwargs["approximate"] is True

    async def test_xadd_data_field_is_json_string(self):
        import json

        redis = _make_redis()
        await append_event(redis, VALID_EVENT_TYPE, WORKSPACE_ID, {"key": "value"})
        fields = redis.xadd.call_args.args[1]
        assert "data" in fields
        parsed = json.loads(fields["data"])
        assert parsed["type"] == VALID_EVENT_TYPE
        assert parsed["payload"] == {"key": "value"}

    async def test_raises_value_error_for_unknown_event_type(self):
        redis = _make_redis()
        with pytest.raises(ValueError, match="Unknown event type"):
            await append_event(redis, "not.a.real.event", WORKSPACE_ID, {})

    async def test_unknown_event_type_does_not_call_xadd(self):
        redis = _make_redis()
        with pytest.raises(ValueError):
            await append_event(redis, "not.a.real.event", WORKSPACE_ID, {})
        redis.xadd.assert_not_awaited()

    async def test_redis_failure_returns_empty_string(self):
        redis = _make_redis()
        redis.xadd = AsyncMock(side_effect=ConnectionError("Redis down"))
        result = await append_event(redis, VALID_EVENT_TYPE, WORKSPACE_ID, {})
        assert result == ""

    async def test_redis_failure_does_not_raise(self):
        redis = _make_redis()
        redis.xadd = AsyncMock(side_effect=ConnectionError("Redis down"))
        # Should not raise — Redis failures are non-fatal
        await append_event(redis, VALID_EVENT_TYPE, WORKSPACE_ID, {})

    async def test_all_event_types_are_accepted(self):
        """Every entry in EVENT_TYPES should pass without ValueError."""
        for event_type in EVENT_TYPES:
            redis = _make_redis()
            result = await append_event(redis, event_type, WORKSPACE_ID, {})
            assert result == ENTRY_ID


# ---------------------------------------------------------------------------
# read_events
# ---------------------------------------------------------------------------


class TestReadEvents:
    async def test_returns_empty_list_on_timeout(self):
        redis = _make_redis(xread_return=[])
        result = await read_events(redis, WORKSPACE_ID)
        assert result == []

    async def test_calls_xread_with_stream_key_and_cursor(self):
        redis = _make_redis()
        await read_events(redis, WORKSPACE_ID, last_event_id="$")
        call_args = redis.xread.call_args
        stream_arg = call_args.args[0]
        assert _stream_key(WORKSPACE_ID) in stream_arg
        assert stream_arg[_stream_key(WORKSPACE_ID)] == "$"

    async def test_returns_decoded_envelopes(self):
        import json

        envelope = {
            "type": VALID_EVENT_TYPE,
            "workspace_id": WORKSPACE_ID,
            "event_id": "placeholder",
            "timestamp": "2026-06-01T12:00:00+00:00",
            "payload": {"update_id": "u1"},
        }
        entries = [(ENTRY_ID, {"data": json.dumps(envelope)})]
        xread_result = _make_xread_result(WORKSPACE_ID, entries)

        redis = _make_redis(xread_return=xread_result)
        result = await read_events(redis, WORKSPACE_ID)

        assert len(result) == 1
        assert result[0]["type"] == VALID_EVENT_TYPE
        assert result[0]["payload"] == {"update_id": "u1"}

    async def test_event_id_is_overwritten_with_stream_entry_id(self):
        """
        The placeholder UUID in the envelope must be replaced with the
        real Redis stream entry ID so clients can use it for reconnect.
        """
        import json

        envelope = {
            "type": VALID_EVENT_TYPE,
            "workspace_id": WORKSPACE_ID,
            "event_id": "placeholder-uuid",
            "timestamp": "2026-06-01T12:00:00+00:00",
            "payload": {},
        }
        entries = [(ENTRY_ID, {"data": json.dumps(envelope)})]
        xread_result = _make_xread_result(WORKSPACE_ID, entries)

        redis = _make_redis(xread_return=xread_result)
        result = await read_events(redis, WORKSPACE_ID)

        assert result[0]["event_id"] == ENTRY_ID

    async def test_multiple_entries_returned_in_order(self):
        import json

        entries = [
            (
                "1000-0",
                {
                    "data": json.dumps(
                        {
                            "type": VALID_EVENT_TYPE,
                            "workspace_id": WORKSPACE_ID,
                            "event_id": "x",
                            "timestamp": "2026-06-01T12:00:00+00:00",
                            "payload": {"seq": 1},
                        }
                    )
                },
            ),
            (
                "1001-0",
                {
                    "data": json.dumps(
                        {
                            "type": VALID_EVENT_TYPE,
                            "workspace_id": WORKSPACE_ID,
                            "event_id": "x",
                            "timestamp": "2026-06-01T12:00:01+00:00",
                            "payload": {"seq": 2},
                        }
                    )
                },
            ),
        ]
        xread_result = _make_xread_result(WORKSPACE_ID, entries)
        redis = _make_redis(xread_return=xread_result)

        result = await read_events(redis, WORKSPACE_ID)

        assert len(result) == 2
        assert result[0]["payload"]["seq"] == 1
        assert result[1]["payload"]["seq"] == 2
        assert result[0]["event_id"] == "1000-0"
        assert result[1]["event_id"] == "1001-0"

    async def test_reconnect_cursor_passed_to_xread(self):
        redis = _make_redis()
        last_id = "1717430399999-0"
        await read_events(redis, WORKSPACE_ID, last_event_id=last_id)
        stream_arg = redis.xread.call_args.args[0]
        assert stream_arg[_stream_key(WORKSPACE_ID)] == last_id

    async def test_redis_failure_returns_empty_list(self):
        redis = _make_redis()
        redis.xread = AsyncMock(side_effect=ConnectionError("Redis down"))
        result = await read_events(redis, WORKSPACE_ID)
        assert result == []

    async def test_malformed_entry_is_skipped(self):
        """A corrupt stream entry should be skipped, not crash the loop."""
        entries = [("1000-0", {"data": "not valid json {{{{"})]
        xread_result = _make_xread_result(WORKSPACE_ID, entries)
        redis = _make_redis(xread_return=xread_result)

        result = await read_events(redis, WORKSPACE_ID)
        assert result == []
