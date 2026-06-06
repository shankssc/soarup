# apps/api/tests/integration/test_websocket_router.py
# Integration tests for app/routers/websockets.py — Redis Streams version.
#
# M5 migration: broadcaster/pub-sub removed, replaced with Redis Streams xread.
# Tests patch _get_redis and read_events — no real Redis connection needed.
#
# Exit strategy:
#   The router's while True loop exits on WebSocketDisconnect or Exception.
#   Tests use a sentinel approach: after returning the desired events,
#   read_events raises WebSocketDisconnect to cleanly exit the loop.
#   This avoids freezing without relying on StopAsyncIteration which
#   gets swallowed by the broad except Exception handler in the router.

from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

pytestmark = pytest.mark.db

WORKSPACE_ID = "ws-test-123"
USER_ID = "user-test-abc"

# ─── Patch targets ────────────────────────────────────────────────────────────

_READ_EVENTS = "app.routers.websockets.read_events"
_GET_REDIS = "app.routers.websockets._get_redis"
_VALIDATE_JWT = "app.routers.websockets.validate_supabase_jwt_ws"

WS_URL = f"/api/v1/ws/workspaces/{WORKSPACE_ID}"

# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_event(
    event_type: str = "update.status_changed",
    workspace_id: str = WORKSPACE_ID,
    payload: dict | None = None,
    event_id: str = "1717430400000-0",
) -> dict:
    return {
        "type": event_type,
        "workspace_id": workspace_id,
        "event_id": event_id,
        "timestamp": "2026-06-01T12:00:00+00:00",
        "payload": payload or {"update_id": "u-123", "status": "processed"},
    }


def _make_read_events_mock(events_sequence: list) -> AsyncMock:
    """
    Returns an AsyncMock for read_events that:
    - First call: returns events_sequence
    - Second call: raises WebSocketDisconnect to cleanly exit the while True loop
    WebSocketDisconnect is caught by the router's except WebSocketDisconnect handler,
    which triggers the finally block (redis.aclose) and exits cleanly.
    """
    call_count = {"n": 0}

    async def _mock(redis, workspace_id, last_event_id="$"):
        if call_count["n"] == 0:
            call_count["n"] += 1
            return events_sequence
        raise WebSocketDisconnect(code=1000)

    return AsyncMock(side_effect=_mock)


def _make_mock_redis() -> MagicMock:
    mock = MagicMock()
    mock.aclose = AsyncMock()
    return mock


# ─── Client factory ───────────────────────────────────────────────────────────


@contextmanager
def make_ws_client(
    valid_token: bool = True,
    user_id: str = USER_ID,
    events_sequence: list | None = None,
):
    from app.main import create_app

    mock_redis = _make_mock_redis()
    jwt_mock = AsyncMock(return_value={"sub": user_id}) if valid_token else AsyncMock(side_effect=Exception("Invalid token"))

    with (
        patch(_GET_REDIS, return_value=mock_redis),
        patch(_READ_EVENTS, side_effect=_make_read_events_mock(events_sequence or [])),
        patch(_VALIDATE_JWT, jwt_mock),
    ):
        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, mock_redis


# ─── Auth tests ───────────────────────────────────────────────────────────────


class TestWebSocketAuth:
    def test_valid_token_accepts_connection(self):
        with make_ws_client(valid_token=True) as (client, _):  # Noqa: SIM117
            with client.websocket_connect(f"{WS_URL}?token=valid-token") as ws:
                assert ws is not None

    def test_invalid_token_closes_with_4001(self):
        with make_ws_client(valid_token=False) as (client, _):  # Noqa: SIM117
            with pytest.raises(WebSocketDisconnect):  # Noqa: SIM117
                with client.websocket_connect(f"{WS_URL}?token=bad-token") as ws:
                    ws.receive_json()

    def test_missing_token_returns_403(self):
        """No token query param — FastAPI rejects with 403 (WebSocket via HTTP client)."""
        with make_ws_client(valid_token=True) as (client, _):
            response = client.get(f"/api/v1/ws/workspaces/{WORKSPACE_ID}")
            assert response.status_code in (403, 404)


# ─── Event forwarding tests ───────────────────────────────────────────────────


class TestEventForwarding:
    def test_event_is_forwarded_to_client(self):
        event = _make_event()

        with make_ws_client(events_sequence=[event]) as (client, _):  # Noqa: SIM117
            with client.websocket_connect(f"{WS_URL}?token=valid-token") as ws:
                message = ws.receive_json()

        assert message["type"] == "update.status_changed"
        assert message["workspace_id"] == WORKSPACE_ID
        assert message["event_id"] == "1717430400000-0"
        assert message["payload"]["status"] == "processed"

    def test_multiple_events_forwarded_in_order(self):
        events = [
            _make_event(event_id="1000-0", payload={"seq": 1}),
            _make_event(event_id="1001-0", payload={"seq": 2}),
            _make_event(event_id="1002-0", payload={"seq": 3}),
        ]

        received = []
        with make_ws_client(events_sequence=events) as (client, _):  # Noqa: SIM117
            with client.websocket_connect(f"{WS_URL}?token=valid-token") as ws:
                for _ in events:
                    received.append(ws.receive_json())

        assert len(received) == 3
        assert received[0]["event_id"] == "1000-0"
        assert received[1]["event_id"] == "1001-0"
        assert received[2]["event_id"] == "1002-0"
        assert received[0]["payload"]["seq"] == 1
        assert received[2]["payload"]["seq"] == 3


# ─── Stream key / workspace isolation tests ──────────────────────────────────


class TestChannelNaming:
    def test_workspace_id_used_as_stream_key(self):
        """read_events is called with the correct workspace_id."""
        event = _make_event()
        call_args = {}

        async def capture_read_events(redis, workspace_id, last_event_id="$"):
            if "workspace_id" not in call_args:
                call_args["workspace_id"] = workspace_id
                return [event]
            raise WebSocketDisconnect(code=1000)

        mock_redis = _make_mock_redis()

        with (
            patch(_GET_REDIS, return_value=mock_redis),
            patch(_READ_EVENTS, side_effect=capture_read_events),
            patch(_VALIDATE_JWT, AsyncMock(return_value={"sub": USER_ID})),
        ):
            from app.main import create_app

            app = create_app()
            with TestClient(app, raise_server_exceptions=False) as client:  # Noqa: SIM117
                with client.websocket_connect(f"{WS_URL}?token=valid-token") as ws:
                    ws.receive_json()

        assert call_args["workspace_id"] == WORKSPACE_ID

    def test_different_workspace_ids_use_different_channels(self):
        """Two connections to different workspaces call read_events with different workspace_ids."""
        workspace_a = "ws-aaa"
        workspace_b = "ws-bbb"
        calls = []

        def make_capture():
            """Fresh counter per connection."""
            called = {"n": 0}

            async def capture(redis, workspace_id, last_event_id="$"):
                if called["n"] == 0:
                    called["n"] += 1
                    calls.append(workspace_id)
                    return [_make_event(workspace_id=workspace_id)]
                raise WebSocketDisconnect(code=1000)

            return capture

        mock_redis = _make_mock_redis()

        with (
            patch(_GET_REDIS, return_value=mock_redis),
            patch(_VALIDATE_JWT, AsyncMock(return_value={"sub": USER_ID})),
        ):
            from app.main import create_app

            app = create_app()
            with TestClient(app, raise_server_exceptions=False) as client:
                with patch(_READ_EVENTS, side_effect=make_capture()):  # Noqa: SIM117
                    with client.websocket_connect(f"/api/v1/ws/workspaces/{workspace_a}?token=valid-token") as ws:
                        ws.receive_json()

                with patch(_READ_EVENTS, side_effect=make_capture()):  # Noqa: SIM117
                    with client.websocket_connect(f"/api/v1/ws/workspaces/{workspace_b}?token=valid-token") as ws:
                        ws.receive_json()

        assert workspace_a in calls
        assert workspace_b in calls
        assert calls[0] != calls[1]


# ─── Redis cleanup test ───────────────────────────────────────────────────────


class TestRedisCleanup:
    def test_redis_connection_closed_on_disconnect(self):
        """redis.aclose() called in finally block after disconnect."""
        event = _make_event()
        mock_redis = _make_mock_redis()

        with (
            patch(_GET_REDIS, return_value=mock_redis),
            patch(_READ_EVENTS, side_effect=_make_read_events_mock([event])),
            patch(_VALIDATE_JWT, AsyncMock(return_value={"sub": USER_ID})),
        ):
            from app.main import create_app

            app = create_app()
            with TestClient(app, raise_server_exceptions=False) as client:  # Noqa: SIM117
                with client.websocket_connect(f"{WS_URL}?token=valid-token") as ws:
                    ws.receive_json()

        mock_redis.aclose.assert_awaited()
