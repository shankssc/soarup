# apps/api/tests/integration/test_update_endpoints.py
# Integration tests for apps/api/app/routers/updates.py
#
# Strategy:
#   - UpdateService is mocked via dependency_overrides on get_update_service
#   - OnboardedDep is overridden to bypass DB profile check in most tests
#   - For the not_onboarded test, OnboardedDep raises HTTP 403 directly
#   - JWT validation runs for real — valid tokens required for protected endpoints
#   - Endpoints are at /api/v1/workspaces/{workspace_id}/updates

from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import require_onboarded
from app.db.session import get_db_session
from app.main import create_app
from app.routers.updates import get_update_service
from app.schemas.update import UpdateListResponse, UpdateResponse
from app.services.update_service import UpdateError

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-abc"
UPDATE_ID = "update-xyz"
USER_ID = "user-abc"
EMAIL = "test@example.com"
TODAY = "2026-05-14"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fake_update_response(**overrides: Any) -> UpdateResponse:
    base = {
        "id": UPDATE_ID,
        "workspace_id": WORKSPACE_ID,
        "user_id": USER_ID,
        "content": "Today I worked on tests",
        "mode": "text",
        "status": "pending",
        "summary": None,
        "update_date": TODAY,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "author_name": "Test User",
        "author_avatar_url": None,
    }
    return UpdateResponse(**{**base, **overrides})


def _fake_update_list_response(count: int = 2) -> UpdateListResponse:
    updates = [_fake_update_response(id=f"update-{i}", content=f"Update {i}") for i in range(count)]
    return UpdateListResponse(updates=updates, total=count)


def _make_mock_update_service() -> MagicMock:
    svc = MagicMock()
    svc.submit_update = AsyncMock()
    svc.get_workspace_updates = AsyncMock()
    svc.edit_update = AsyncMock()
    svc.delete_update = AsyncMock(return_value=None)
    return svc


def _onboarded_user_ctx(
    user_id: str = USER_ID,
    email: str = EMAIL,
) -> dict[str, str]:
    return {"user_id": user_id, "email": email, "access_token": "tok"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_update_service() -> MagicMock:
    return _make_mock_update_service()


@pytest.fixture
async def update_client(db_session, mock_update_service):
    """
    AsyncClient with UpdateService mocked and OnboardedDep bypassed.
    OnboardedDep override returns a valid user context without hitting the DB.
    """
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_update_service] = lambda: mock_update_service
    app.dependency_overrides[require_onboarded] = lambda: _onboarded_user_ctx()

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client, mock_update_service

    app.dependency_overrides.clear()


@pytest.fixture
async def not_onboarded_client(db_session, mock_update_service):
    """
    Client where OnboardedDep raises 403 — simulates a user who hasn't
    completed onboarding trying to access update endpoints.
    """

    def _raise_403():
        raise HTTPException(status_code=403, detail="Onboarding required.")

    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_update_service] = lambda: mock_update_service
    app.dependency_overrides[require_onboarded] = _raise_403

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def unauthed_client(db_session):
    """Client with no auth headers and no dependency overrides for auth."""
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /api/v1/workspaces/{workspace_id}/updates
# ---------------------------------------------------------------------------


class TestSubmitUpdate:
    @pytest.mark.asyncio
    async def test_submit_returns_202(self, update_client, auth_headers):
        client, svc = update_client
        svc.submit_update.return_value = _fake_update_response()

        response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "Today I worked on tests", "update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 202

    @pytest.mark.asyncio
    async def test_submit_returns_update_in_body(self, update_client, auth_headers):
        client, svc = update_client
        svc.submit_update.return_value = _fake_update_response()

        response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "Today I worked on tests", "update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert body["content"] == "Today I worked on tests"
        assert body["status"] == "pending"
        assert body["workspace_id"] == WORKSPACE_ID

    @pytest.mark.asyncio
    async def test_submit_calls_service_with_workspace_and_user(self, update_client, make_jwt):
        client, svc = update_client
        svc.submit_update.return_value = _fake_update_response()
        token = make_jwt(USER_ID, EMAIL)

        await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "update", "update_date": TODAY},
            headers={"Authorization": f"Bearer {token}"},
        )

        svc.submit_update.assert_awaited_once()
        args = svc.submit_update.call_args
        assert args.args[0] == WORKSPACE_ID
        assert args.args[1] == USER_ID

    @pytest.mark.asyncio
    async def test_submit_duplicate_returns_409(self, update_client, auth_headers):
        client, svc = update_client
        svc.submit_update.side_effect = UpdateError(
            "update_already_exists",
            "Already submitted today.",
            {"existing_id": "old-id"},
        )

        response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "dup", "update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 409
        assert response.json()["error"] == "update_already_exists"

    @pytest.mark.asyncio
    async def test_submit_not_onboarded_returns_403(self, not_onboarded_client, auth_headers):
        response = await not_onboarded_client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "update", "update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_submit_no_token_returns_401_or_403(self, unauthed_client):
        response = await unauthed_client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "update", "update_date": TODAY},
        )

        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_submit_content_too_long_returns_422(self, update_client, auth_headers):
        client, _ = update_client

        response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "x" * 1001, "update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_submit_empty_content_returns_422(self, update_client, auth_headers):
        client, _ = update_client

        response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "", "update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_submit_missing_update_date_returns_422(self, update_client, auth_headers):
        client, _ = update_client

        response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "Some content"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/workspaces/{workspace_id}/updates
# ---------------------------------------------------------------------------


class TestGetUpdates:
    @pytest.mark.asyncio
    async def test_get_updates_returns_200(self, update_client, auth_headers):
        client, svc = update_client
        svc.get_workspace_updates.return_value = _fake_update_list_response()

        response = await client.get(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            params={"update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_updates_returns_correct_shape(self, update_client, auth_headers):
        client, svc = update_client
        svc.get_workspace_updates.return_value = _fake_update_list_response(count=2)

        response = await client.get(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            params={"update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert "updates" in body
        assert "total" in body
        assert body["total"] == 2
        assert len(body["updates"]) == 2

    @pytest.mark.asyncio
    async def test_get_updates_calls_service_with_workspace_and_date(self, update_client, auth_headers):
        client, svc = update_client
        svc.get_workspace_updates.return_value = _fake_update_list_response(0)

        await client.get(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            params={"update_date": TODAY},
            headers=auth_headers(USER_ID),
        )

        svc.get_workspace_updates.assert_awaited_once_with(WORKSPACE_ID, TODAY)

    @pytest.mark.asyncio
    async def test_get_updates_no_token_returns_401_or_403(self, unauthed_client):
        response = await unauthed_client.get(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            params={"update_date": TODAY},
        )

        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_get_updates_missing_date_param_returns_422(self, update_client, auth_headers):
        """update_date is a required query param — missing returns 422."""
        client, _ = update_client

        response = await client.get(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /api/v1/workspaces/{workspace_id}/updates/{update_id}
# ---------------------------------------------------------------------------


class TestEditUpdate:
    @pytest.mark.asyncio
    async def test_edit_returns_200(self, update_client, auth_headers):
        client, svc = update_client
        svc.edit_update.return_value = _fake_update_response(content="Edited content")

        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            json={"content": "Edited content"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_edit_returns_updated_content(self, update_client, auth_headers):
        client, svc = update_client
        svc.edit_update.return_value = _fake_update_response(content="Edited content")

        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            json={"content": "Edited content"},
            headers=auth_headers(USER_ID),
        )

        assert response.json()["content"] == "Edited content"

    @pytest.mark.asyncio
    async def test_edit_not_owner_returns_403(self, update_client, auth_headers):
        client, svc = update_client
        svc.edit_update.side_effect = UpdateError("unauthorized", "You can only edit your own updates.")

        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            json={"content": "Edited"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 403
        assert response.json()["error"] == "unauthorized"

    @pytest.mark.asyncio
    async def test_edit_not_found_returns_404(self, update_client, auth_headers):
        client, svc = update_client
        svc.edit_update.side_effect = UpdateError("update_not_found", "Update not found.")

        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            json={"content": "Edited"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 404
        assert response.json()["error"] == "update_not_found"

    @pytest.mark.asyncio
    async def test_edit_no_token_returns_401_or_403(self, unauthed_client):
        response = await unauthed_client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            json={"content": "Edited"},
        )

        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_edit_empty_content_returns_422(self, update_client, auth_headers):
        client, _ = update_client

        response = await client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            json={"content": ""},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /api/v1/workspaces/{workspace_id}/updates/{update_id}
# ---------------------------------------------------------------------------


class TestDeleteUpdate:
    @pytest.mark.asyncio
    async def test_delete_returns_204(self, update_client, auth_headers):
        client, svc = update_client
        svc.delete_update.return_value = None

        response = await client.delete(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_returns_empty_body(self, update_client, auth_headers):
        client, svc = update_client
        svc.delete_update.return_value = None

        response = await client.delete(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            headers=auth_headers(USER_ID),
        )

        assert response.content == b""

    @pytest.mark.asyncio
    async def test_delete_not_owner_returns_403(self, update_client, auth_headers):
        client, svc = update_client
        svc.delete_update.side_effect = UpdateError("unauthorized", "You can only delete your own updates.")

        response = await client.delete(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 403
        assert response.json()["error"] == "unauthorized"

    @pytest.mark.asyncio
    async def test_delete_not_found_returns_404(self, update_client, auth_headers):
        client, svc = update_client
        svc.delete_update.side_effect = UpdateError("update_not_found", "Update not found.")

        response = await client.delete(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 404
        assert response.json()["error"] == "update_not_found"

    @pytest.mark.asyncio
    async def test_delete_no_token_returns_401_or_403(self, unauthed_client):
        response = await unauthed_client.delete(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
        )

        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_delete_calls_service_with_correct_args(self, update_client, make_jwt):
        client, svc = update_client
        svc.delete_update.return_value = None
        token = make_jwt(USER_ID, EMAIL)

        await client.delete(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
            headers={"Authorization": f"Bearer {token}"},
        )

        svc.delete_update.assert_awaited_once_with(WORKSPACE_ID, USER_ID, UPDATE_ID)
