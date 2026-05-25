# apps/api/tests/unit/test_events.py
# Tests for the Redis pub/sub event publisher (app/lib/events.py).
#
# Strategy:
#   - Redis is an AsyncMock — no real Redis connection
#   - _build_message and _channel are tested directly as pure functions
#   - publish_event is tested for correct channel, JSON envelope, and
#     error handling behaviour (ValueError re-raised, Redis errors swallowed)

import json
from unittest.mock import AsyncMock

import pytest

from app.lib.events import EVENT_TYPES, _build_message, _channel, publish_event

WORKSPACE_ID = "workspace-123"
UPDATE_ID = "update-abc"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.publish = AsyncMock(return_value=1)
    return redis


# ---------------------------------------------------------------------------
# _channel()
# ---------------------------------------------------------------------------


class TestChannel:
    def test_channel_format(self):
        assert _channel("workspace-123") == "workspace:workspace-123"

    def test_channel_uses_workspace_id(self):
        assert _channel("my-ws") == "workspace:my-ws"


# ---------------------------------------------------------------------------
# _build_message()
# ---------------------------------------------------------------------------


class TestBuildMessage:
    def test_returns_valid_json(self):
        msg = _build_message("update.status_changed", WORKSPACE_ID, {"update_id": UPDATE_ID})
        parsed = json.loads(msg)
        assert isinstance(parsed, dict)

    def test_envelope_contains_required_fields(self):
        msg = _build_message("update.status_changed", WORKSPACE_ID, {"update_id": UPDATE_ID})
        parsed = json.loads(msg)
        assert "type" in parsed
        assert "workspace_id" in parsed
        assert "event_id" in parsed
        assert "timestamp" in parsed
        assert "payload" in parsed

    def test_type_matches_event_type(self):
        msg = _build_message("update.status_changed", WORKSPACE_ID, {})
        parsed = json.loads(msg)
        assert parsed["type"] == "update.status_changed"

    def test_workspace_id_in_envelope(self):
        msg = _build_message("update.status_changed", WORKSPACE_ID, {})
        parsed = json.loads(msg)
        assert parsed["workspace_id"] == WORKSPACE_ID

    def test_payload_included(self):
        payload = {"update_id": UPDATE_ID, "status": "processed"}
        msg = _build_message("update.status_changed", WORKSPACE_ID, payload)
        parsed = json.loads(msg)
        assert parsed["payload"]["update_id"] == UPDATE_ID
        assert parsed["payload"]["status"] == "processed"

    def test_event_id_is_unique(self):
        """Each call generates a different event_id."""
        msg1 = _build_message("update.status_changed", WORKSPACE_ID, {})
        msg2 = _build_message("update.status_changed", WORKSPACE_ID, {})
        assert json.loads(msg1)["event_id"] != json.loads(msg2)["event_id"]

    def test_unknown_event_type_raises_value_error(self):
        with pytest.raises(ValueError, match="Unknown event type"):
            _build_message("totally.unknown", WORKSPACE_ID, {})


# ---------------------------------------------------------------------------
# publish_event()
# ---------------------------------------------------------------------------


class TestPublishEvent:
    @pytest.mark.asyncio
    async def test_calls_redis_publish(self, mock_redis):
        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, {})

        mock_redis.publish.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_publishes_to_correct_channel(self, mock_redis):
        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, {})

        channel_arg = mock_redis.publish.call_args[0][0]
        assert channel_arg == f"workspace:{WORKSPACE_ID}"

    @pytest.mark.asyncio
    async def test_published_message_is_valid_json(self, mock_redis):
        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, {})

        message_arg = mock_redis.publish.call_args[0][1]
        parsed = json.loads(message_arg)
        assert parsed["type"] == "update.status_changed"

    @pytest.mark.asyncio
    async def test_published_message_contains_payload(self, mock_redis):
        payload = {"update_id": UPDATE_ID, "status": "processed"}
        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, payload)

        message_arg = mock_redis.publish.call_args[0][1]
        parsed = json.loads(message_arg)
        assert parsed["payload"]["update_id"] == UPDATE_ID

    @pytest.mark.asyncio
    async def test_unknown_event_type_raises_value_error_before_publish(self, mock_redis):
        """ValueError is re-raised — redis.publish must NOT be called."""
        with pytest.raises(ValueError, match="Unknown event type"):
            await publish_event(mock_redis, "totally.unknown", WORKSPACE_ID, {})

        mock_redis.publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_redis_failure_does_not_raise(self, mock_redis):
        """Redis errors are swallowed — caller is not disrupted."""
        mock_redis.publish.side_effect = Exception("Redis connection lost")

        # Should not raise
        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, {})

    @pytest.mark.asyncio
    async def test_redis_failure_still_calls_publish(self, mock_redis):
        """Even when Redis fails, publish was attempted."""
        mock_redis.publish.side_effect = Exception("timeout")

        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, {})

        mock_redis.publish.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_all_event_types_are_valid(self, mock_redis):
        """All EVENT_TYPES can be published without raising ValueError."""
        for event_type in EVENT_TYPES:
            mock_redis.publish.reset_mock()
            await publish_event(mock_redis, event_type, WORKSPACE_ID, {"update_id": UPDATE_ID})
            mock_redis.publish.assert_called_once()

    @pytest.mark.asyncio
    async def test_publish_called_with_string_message(self, mock_redis):
        """The second arg to redis.publish is always a string (serialized JSON)."""
        await publish_event(mock_redis, "update.status_changed", WORKSPACE_ID, {})

        message_arg = mock_redis.publish.call_args[0][1]
        assert isinstance(message_arg, str)
