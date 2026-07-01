# apps/api/tests/integration/test_slack_endpoints.py
# Integration tests for app/routers/slack.py
#
# Strategy:
#   - SlackService is mocked via dependency_overrides
#   - JWT auth runs for real via make_jwt fixture
#   - RBAC (WorkspaceAdminDep) is mocked per-test
#   - Tests cover: status codes, response shapes, error mapping,
#     request validation, auth enforcement

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.rbac import _admin_checker
from app.schemas.slack import SlackSettingsResponse, SlackTestResponse
from app.services.slack_service import SlackError

pytestmark = pytest.mark.asyncio

WORKSPACE_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_slack_settings(
    configured: bool = True,
    digest_enabled: bool = True,
    updates_enabled: bool = True,
    hint: str | None = "...8Y5TV0HJ",
) -> SlackSettingsResponse:
    return SlackSettingsResponse(
        slack_configured=configured,
        slack_digest_enabled=digest_enabled,
        slack_updates_enabled=updates_enabled,
        webhook_url_hint=hint,
    )


def _make_slack_service_mock() -> MagicMock:
    svc = MagicMock()
    svc.get_settings = AsyncMock(return_value=_make_slack_settings())
    svc.update_settings = AsyncMock(return_value=_make_slack_settings())
    svc.send_test_message = AsyncMock(
        return_value=SlackTestResponse(
            success=True,
            message="Test message sent successfully. Check your Slack channel.",
        )
    )
    svc.remove_slack_integration = AsyncMock(return_value=None)
    return svc


def _admin_ctx() -> dict:
    return {"user_id": USER_ID, "workspace_role": "admin"}


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def slack_client(db_session, make_jwt):
    from app.api.dependencies import get_db_session
    from app.main import create_app
    from app.routers.slack import get_slack_service

    app = create_app()
    mock_service = _make_slack_service_mock()

    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_slack_service] = lambda: mock_service
    app.dependency_overrides[_admin_checker] = lambda: _admin_ctx()

    token = make_jwt(USER_ID)
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=headers,
    ) as client:
        yield client, mock_service, app

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /{workspace_id}/slack/settings
# ---------------------------------------------------------------------------


class TestGetSlackSettings:
    async def test_returns_200_for_admin(self, slack_client):
        client, _, __ = slack_client
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        assert response.status_code == 200

    async def test_response_shape(self, slack_client):
        client, _, __ = slack_client
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        data = response.json()
        assert "slack_configured" in data
        assert "slack_digest_enabled" in data
        assert "slack_updates_enabled" in data
        assert "webhook_url_hint" in data

    async def test_webhook_url_never_returned_raw(self, slack_client):
        client, _, __ = slack_client
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        data = response.json()
        hint = data.get("webhook_url_hint")
        if hint:
            assert "hooks.slack.com" not in hint

    async def test_returns_404_when_workspace_not_found(self, slack_client):
        client, mock_service, __ = slack_client
        mock_service.get_settings = AsyncMock(side_effect=SlackError("workspace_not_found", "Workspace not found."))
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        assert response.status_code == 404

    async def test_returns_403_for_non_admin(self, slack_client):
        client, _, app = slack_client
        from fastapi import HTTPException, status

        app.dependency_overrides[_admin_checker] = lambda: (_ for _ in ()).throw(HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"))
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        assert response.status_code == 403

    async def test_calls_service_with_workspace_id(self, slack_client):
        client, mock_service, __ = slack_client
        await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        mock_service.get_settings.assert_called_once_with(WORKSPACE_ID)


# ---------------------------------------------------------------------------
# PATCH /{workspace_id}/slack/settings
# ---------------------------------------------------------------------------


class TestUpdateSlackSettings:
    async def test_returns_200_with_valid_webhook_url(self, slack_client):
        client, _, __ = slack_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings",
            json={"webhook_url": "https://hooks.slack.com/services/T123/B456/abc"},
        )
        assert response.status_code == 200

    async def test_returns_422_with_invalid_webhook_url(self, slack_client):
        client, _, __ = slack_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings",
            json={"webhook_url": "https://not-slack.com/webhook"},
        )
        assert response.status_code == 422

    async def test_returns_200_when_updating_toggles_only(self, slack_client):
        client, _, __ = slack_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings",
            json={"slack_digest_enabled": True},
        )
        assert response.status_code == 200

    async def test_returns_200_with_null_webhook_url(self, slack_client):
        client, _, __ = slack_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings",
            json={"webhook_url": None},
        )
        assert response.status_code == 200

    async def test_returns_404_when_workspace_not_found(self, slack_client):
        client, mock_service, __ = slack_client
        mock_service.update_settings = AsyncMock(side_effect=SlackError("workspace_not_found", "Workspace not found."))
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings",
            json={"slack_digest_enabled": True},
        )
        assert response.status_code == 404

    async def test_empty_body_returns_200(self, slack_client):
        """All fields optional — empty patch is valid."""
        client, _, __ = slack_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings",
            json={},
        )
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# POST /{workspace_id}/slack/test
# ---------------------------------------------------------------------------


class TestSendTestMessage:
    async def test_returns_200_on_success(self, slack_client):
        client, _, __ = slack_client
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/test")
        assert response.status_code == 200

    async def test_response_contains_success_and_message(self, slack_client):
        client, _, __ = slack_client
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/test")
        data = response.json()
        assert "success" in data
        assert "message" in data

    async def test_returns_200_even_when_delivery_fails(self, slack_client):
        """Test endpoint returns 200 with success=False — not a 5xx."""
        client, mock_service, __ = slack_client
        mock_service.send_test_message = AsyncMock(
            return_value=SlackTestResponse(
                success=False,
                message="Failed to send test message.",
            )
        )
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/test")
        assert response.status_code == 200
        assert response.json()["success"] is False

    async def test_returns_400_when_no_webhook_configured(self, slack_client):
        client, mock_service, __ = slack_client
        mock_service.send_test_message = AsyncMock(side_effect=SlackError("no_webhook", "No webhook configured."))
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/test")
        assert response.status_code == 400

    async def test_returns_500_when_decrypt_fails(self, slack_client):
        client, mock_service, __ = slack_client
        mock_service.send_test_message = AsyncMock(side_effect=SlackError("decrypt_failed", "Could not read webhook URL."))
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/test")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# DELETE /{workspace_id}/slack/settings
# ---------------------------------------------------------------------------


class TestRemoveSlackIntegration:
    async def test_returns_204_on_success(self, slack_client):
        client, _, __ = slack_client
        response = await client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        assert response.status_code == 204

    async def test_response_body_is_empty(self, slack_client):
        client, _, __ = slack_client
        response = await client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        assert response.content == b""

    async def test_calls_update_settings_with_empty_webhook(self, slack_client):
        client, mock_service, __ = slack_client
        await client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        mock_service.update_settings.assert_called_once()
        call_args = mock_service.update_settings.call_args
        assert call_args.args[0] == WORKSPACE_ID
        assert call_args.args[1].webhook_url == ""

    async def test_returns_404_when_workspace_not_found(self, slack_client):
        client, mock_service, __ = slack_client
        mock_service.update_settings = AsyncMock(side_effect=SlackError("workspace_not_found", "Workspace not found."))
        response = await client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/slack/settings")
        assert response.status_code == 404
