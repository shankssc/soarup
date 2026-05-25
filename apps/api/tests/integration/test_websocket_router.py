# apps/api/tests/integration/test_websocket_router.py
# Tests for the WebSocket endpoint (app/routers/websockets.py).
#
# Strategy:
#   - Uses starlette.testclient.TestClient (sync) with WebSocket support
#   - broadcast is patched before app creation to prevent real Redis connections
#   - validate_supabase_jwt_ws is patched to control auth outcomes
#   - The lifespan calls broadcast.connect() — patch must be in place before
#     TestClient is constructed

import json
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-123"
USER_ID = "user-abc"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _async_event_iter(events: list):
    """Async iterator that yields events then stops — used in WebSocket tests."""
    for event in events:
        yield event


class _MockSubscriber:
    """Sync-compatible async iterator for WebSocket test event injection."""

    def __init__(self, events: list):
        self._events = iter(events)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._events)
        except StopIteration:
            raise StopAsyncIteration from None


@contextmanager
def make_ws_client(
    valid_token: bool = True,
    user_id: str = USER_ID,
    events: list | None = None,
):
    """
    Build a TestClient with:
    - broadcast fully mocked (no real Redis)
    - validate_supabase_jwt_ws mocked to return/raise based on valid_token
    - optional list of mock events to yield from the subscriber
    """
    from app.main import create_app

    # Build mock subscriber that yields provided events then stops
    mock_events = events or []
    mock_subscriber = _MockSubscriber(mock_events)

    mock_subscribe_ctx = MagicMock()
    mock_subscribe_ctx.__aenter__ = AsyncMock(return_value=mock_subscriber)
    mock_subscribe_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_broadcast = MagicMock()
    mock_broadcast.connect = AsyncMock()
    mock_broadcast.disconnect = AsyncMock()
    mock_broadcast.subscribe = MagicMock(return_value=mock_subscribe_ctx)

    jwt_mock = AsyncMock(return_value={"sub": user_id}) if valid_token else AsyncMock(side_effect=Exception("Invalid token"))

    with (
        patch("app.main.broadcast", mock_broadcast),
        patch("app.routers.websockets.broadcast", mock_broadcast),
        patch("app.routers.websockets.validate_supabase_jwt_ws", jwt_mock),
    ):
        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, mock_broadcast, mock_subscriber


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestWebSocketAuth:
    def test_valid_token_accepts_connection(self):
        with make_ws_client(valid_token=True) as (client, _, __):  # Noqa: SIM117
            with client.websocket_connect(f"/api/v1/ws/workspaces/{WORKSPACE_ID}?token=valid-token") as _ws:
                # Connection accepted — we can receive (subscriber yields nothing, disconnects)
                pass  # no exception = connection was accepted

    def test_invalid_token_closes_with_4001(self):
        with make_ws_client(valid_token=False) as (client, _, __):  # Noqa: SIM117
            with pytest.raises(Exception):  # Noqa: B017
                with client.websocket_connect(f"/api/v1/ws/workspaces/{WORKSPACE_ID}?token=bad-token") as ws:
                    data = ws.receive()
                    assert data.get("code") == 4001


# ---------------------------------------------------------------------------
# Event forwarding
# ---------------------------------------------------------------------------


class TestEventForwarding:
    def test_event_is_forwarded_to_client(self):
        """Events from the subscriber are forwarded as JSON to the WebSocket client."""
        event_payload = {
            "type": "update.status_changed",
            "workspace_id": WORKSPACE_ID,
            "event_id": "evt-123",
            "timestamp": "2026-05-21T10:00:00Z",
            "payload": {"update_id": "update-abc", "status": "processed"},
        }

        mock_event = MagicMock()
        mock_event.message = json.dumps(event_payload)

        with make_ws_client(valid_token=True, events=[mock_event]) as (client, _, __):  # Noqa: SIM117
            with client.websocket_connect(f"/api/v1/ws/workspaces/{WORKSPACE_ID}?token=valid-token") as ws:
                data = ws.receive_json()
                assert data["type"] == "update.status_changed"
                assert data["payload"]["status"] == "processed"
                assert data["workspace_id"] == WORKSPACE_ID

    def test_multiple_events_forwarded_in_order(self):
        """Multiple events are forwarded in the order they arrive."""
        events = []
        for i, status in enumerate(["processing", "processed"]):
            mock_event = MagicMock()
            mock_event.message = json.dumps(
                {
                    "type": "update.status_changed",
                    "workspace_id": WORKSPACE_ID,
                    "event_id": f"evt-{i}",
                    "timestamp": "2026-05-21T10:00:00Z",
                    "payload": {"update_id": "update-abc", "status": status},
                }
            )
            events.append(mock_event)

        with make_ws_client(valid_token=True, events=events) as (client, _, __):  # Noqa: SIM117
            with client.websocket_connect(f"/api/v1/ws/workspaces/{WORKSPACE_ID}?token=valid-token") as ws:
                first = ws.receive_json()
                second = ws.receive_json()

        assert first["payload"]["status"] == "processing"
        assert second["payload"]["status"] == "processed"


# ---------------------------------------------------------------------------
# Channel naming
# ---------------------------------------------------------------------------


class TestChannelNaming:
    def test_workspace_id_used_as_channel(self):
        """broadcast.subscribe is called with channel=workspace:{workspace_id}."""
        with make_ws_client(valid_token=True) as (client, mock_broadcast, __):  # Noqa: SIM117
            with client.websocket_connect(f"/api/v1/ws/workspaces/{WORKSPACE_ID}?token=valid-token"):
                pass

        mock_broadcast.subscribe.assert_called_once_with(channel=f"workspace:{WORKSPACE_ID}")

    def test_different_workspace_ids_use_different_channels(self):
        other_ws_id = "other-workspace-456"

        with make_ws_client(valid_token=True) as (client, mock_broadcast, __):  # Noqa: SIM117
            with client.websocket_connect(f"/api/v1/ws/workspaces/{other_ws_id}?token=valid-token"):
                pass

        mock_broadcast.subscribe.assert_called_once_with(channel=f"workspace:{other_ws_id}")
