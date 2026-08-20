# apps/api/tests/integration/test_digest_endpoints.py
# Integration tests for the digest router endpoints.
#
# Strategy:
#   - DigestService is mocked — no real DB calls from the router layer
#   - JWT auth is real (uses make_jwt fixture)
#   - RBAC (WorkspaceMemberDep / WorkspaceAdminDep) is mocked per-test
#     by overriding require_workspace_role dependencies

import uuid
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.rbac import _admin_checker, _member_checker
from app.schemas.digest import (
    DigestItemResponse,
    DigestListResponse,
    DigestPreviewResponse,
    DigestResponse,
    MyDigestPreferenceResponse,
)
from app.services.digest_service import DigestError

pytestmark = pytest.mark.asyncio

WORKSPACE_ID = str(uuid.uuid4())
DIGEST_ID = str(uuid.uuid4())
UPDATE_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
TODAY = "2026-06-07"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_digest_response(
    digest_id: str = DIGEST_ID,
    status: str = "sent",
    items: list[DigestItemResponse] | None = None,
) -> DigestResponse:
    return DigestResponse(
        id=digest_id,
        workspace_id=WORKSPACE_ID,
        digest_date=TODAY,
        summary="Team made good progress.",
        status=status,
        update_count=2,
        email_sent_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
        items=items or [],
    )


def _make_digest_service_mock() -> MagicMock:
    svc = MagicMock()
    svc.list_digests = AsyncMock(
        return_value=DigestListResponse(
            digests=[_make_digest_response()],
            next_cursor=None,
            total=1,
        )
    )
    svc.get_digest = AsyncMock(
        return_value=_make_digest_response(
            items=[
                DigestItemResponse(
                    id=str(uuid.uuid4()),
                    update_id=UPDATE_ID,
                    author_name="Test User",
                    summary_snapshot="Worked on X",
                )
            ]
        )
    )
    svc.update_digest_settings = AsyncMock(return_value=_make_digest_response())
    svc.preview_digest = AsyncMock(
        return_value=DigestPreviewResponse(
            html="<html>preview</html>",
            digest_date=TODAY,
            update_count=2,
            would_send_to=["test@example.com"],
        )
    )
    svc.get_my_notification_preference = AsyncMock(return_value=MyDigestPreferenceResponse(email_notifications=True))
    svc.update_my_notification_preference = AsyncMock(return_value=MyDigestPreferenceResponse(email_notifications=False))
    return svc


def _member_ctx(user_id: str = USER_ID) -> dict[str, Any]:
    return {"user_id": user_id, "workspace_role": "member"}


def _admin_ctx(user_id: str = USER_ID) -> dict[str, Any]:
    return {"user_id": user_id, "workspace_role": "admin"}


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def digest_client(db_session, make_jwt):
    """AsyncClient with DigestService mocked and RBAC injectable per-test."""
    from app.api.dependencies import get_db_session
    from app.main import create_app
    from app.routers.digests import get_digest_service

    app = create_app()
    mock_service = _make_digest_service_mock()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_digest_service] = lambda: mock_service

    app.dependency_overrides[_member_checker] = lambda: _member_ctx()
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
# GET /{workspace_id}/digests
# ---------------------------------------------------------------------------


class TestListDigests:
    async def test_returns_200_with_digest_list(self, digest_client):
        client, _, app = digest_client
        # No override needed — fixture sets member by default
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digests")
        assert response.status_code == 200

    async def test_passes_cursor_and_limit_to_service(self, digest_client):
        client, mock_service, app = digest_client
        await client.get(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digests",
            params={"cursor": "some-cursor", "limit": 5},
        )
        mock_service.list_digests.assert_called_once_with(
            workspace_id=WORKSPACE_ID,
            cursor="some-cursor",
            limit=5,
        )

    async def test_returns_503_when_service_raises(self, digest_client):
        client, mock_service, app = digest_client
        mock_service.list_digests = AsyncMock(side_effect=DigestError("fetch_failed", "DB error"))
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digests")
        assert response.status_code == 500


# ---------------------------------------------------------------------------
# GET /{workspace_id}/digests/{digest_id}
# ---------------------------------------------------------------------------


class TestGetDigest:
    async def test_returns_200_with_digest_and_items(self, digest_client):
        client, _, app = digest_client
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digests/{DIGEST_ID}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == DIGEST_ID
        assert len(data["items"]) == 1

    async def test_returns_404_when_digest_not_found(self, digest_client):
        client, mock_service, app = digest_client
        mock_service.get_digest = AsyncMock(side_effect=DigestError("digest_not_found", "Digest not found."))
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digests/{DIGEST_ID}")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /{workspace_id}/digest-settings
# ---------------------------------------------------------------------------


class TestUpdateDigestSettings:
    async def test_admin_can_update_settings(self, digest_client):
        client, _, app = digest_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings",
            json={
                "digest_enabled": True,
                "digest_send_time": "09:00",
                "digest_days": "1,2,3,4,5",
            },
        )
        assert response.status_code == 200

    async def test_member_cannot_update_settings(self, digest_client):
        client, _, app = digest_client
        from fastapi import HTTPException, status

        from app.api.rbac import _admin_checker, require_workspace_role

        async def _raise_403() -> None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This action requires admin role or higher.",
            )

        app.dependency_overrides[require_workspace_role("admin")] = _raise_403
        app.dependency_overrides[_admin_checker] = _raise_403

        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings",
            json={"digest_enabled": True},
        )
        assert response.status_code == 403

    async def test_invalid_send_time_format_rejected(self, digest_client):
        client, _, app = digest_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings",
            json={"digest_send_time": "9:00"},
        )
        assert response.status_code == 422

    async def test_invalid_digest_days_rejected(self, digest_client):
        client, _, app = digest_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings",
            json={"digest_days": "1,2,8"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# POST /{workspace_id}/digests/preview
# ---------------------------------------------------------------------------


class TestPreviewDigest:
    async def test_admin_can_preview(self, digest_client):
        client, _, app = digest_client
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/digests/preview")
        assert response.status_code == 200
        data = response.json()
        assert data["html"] == "<html>preview</html>"
        assert data["update_count"] == 2

    async def test_returns_empty_html_when_no_updates(self, digest_client):
        client, mock_service, app = digest_client
        mock_service.preview_digest = AsyncMock(
            return_value=DigestPreviewResponse(
                html="",
                digest_date=TODAY,
                update_count=0,
                would_send_to=[],
            )
        )
        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/digests/preview")
        assert response.status_code == 200
        data = response.json()
        assert data["html"] == ""

    async def test_member_cannot_preview(self, digest_client):
        client, _, app = digest_client
        from fastapi import HTTPException, status

        from app.api.rbac import _admin_checker, require_workspace_role

        async def _raise_403() -> None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This action requires admin role or higher.",
            )

        app.dependency_overrides[require_workspace_role("admin")] = _raise_403
        app.dependency_overrides[_admin_checker] = _raise_403

        response = await client.post(f"/api/v1/workspaces/{WORKSPACE_ID}/digests/preview")
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# GET /{workspace_id}/digest-settings/me
# ---------------------------------------------------------------------------


class TestGetMyDigestPreference:
    async def test_member_can_read_own_preference(self, digest_client):
        """
        Deliberately no RBAC override — the fixture's default WorkspaceMemberDep
        override already grants member access, confirming this route does NOT
        require admin (contrast with digest-settings, which does).
        """
        client, _, app = digest_client
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me")
        assert response.status_code == 200
        assert response.json()["email_notifications"] is True

    async def test_returns_404_when_not_a_member(self, digest_client):
        client, mock_service, app = digest_client
        mock_service.get_my_notification_preference = AsyncMock(side_effect=DigestError("workspace_not_found", "You are not a member of this workspace."))
        response = await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me")
        assert response.status_code == 404

    async def test_calls_service_with_correct_ids(self, digest_client):
        client, mock_service, app = digest_client
        await client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me")
        mock_service.get_my_notification_preference.assert_called_once_with(
            workspace_id=WORKSPACE_ID,
            user_id=USER_ID,
        )


# ---------------------------------------------------------------------------
# PATCH /{workspace_id}/digest-settings/me
# ---------------------------------------------------------------------------


class TestUpdateMyDigestPreference:
    async def test_member_can_update_own_preference(self, digest_client):
        """Same as above — no admin RBAC override needed, member is sufficient."""
        client, _, app = digest_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me",
            json={"email_notifications": False},
        )
        assert response.status_code == 200
        assert response.json()["email_notifications"] is False

    async def test_returns_404_when_not_a_member(self, digest_client):
        client, mock_service, app = digest_client
        mock_service.update_my_notification_preference = AsyncMock(side_effect=DigestError("workspace_not_found", "You are not a member of this workspace."))
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me",
            json={"email_notifications": True},
        )
        assert response.status_code == 404

    async def test_missing_email_notifications_field_returns_422(self, digest_client):
        client, _, app = digest_client
        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me",
            json={},
        )
        assert response.status_code == 422

    async def test_calls_service_with_correct_args(self, digest_client):
        client, mock_service, app = digest_client
        await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/digest-settings/me",
            json={"email_notifications": True},
        )
        mock_service.update_my_notification_preference.assert_called_once_with(
            workspace_id=WORKSPACE_ID,
            user_id=USER_ID,
            enabled=True,
        )
