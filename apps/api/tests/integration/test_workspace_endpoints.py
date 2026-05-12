# apps/api/tests/integration/test_workspace_endpoints.py
# Integration tests for apps/api/app/routers/workspaces.py
#
# Strategy:
#   - WorkspaceService is mocked via dependency_overrides on get_workspace_service
#   - JWT validation runs for real — endpoints need valid tokens from make_jwt
#   - All three endpoints use AuthDep (not OnboardedDep) so any valid JWT works
#   - We test: HTTP status codes, response body shape, error mapping,
#     request validation (Pydantic), and auth header handling
#   - We do NOT test: service logic (covered in test_workspace_service.py)

from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_db_session
from app.main import create_app
from app.routers.workspaces import get_workspace_service
from app.schemas.workspace import WorkspaceListResponse, WorkspaceResponse
from app.services.workspace_service import WorkspaceError

USER_ID = "user-abc"
EMAIL = "test@example.com"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _workspace_response(
    workspace_id: str = "ws-123",
    name: str = "My Team",
    slug: str = "my-team",
    owner_id: str = USER_ID,
    plan: str = "free",
) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=workspace_id,
        name=name,
        slug=slug,
        owner_id=owner_id,
        plan=plan,
        created_at=datetime.now(UTC),
    )


def _workspace_list_response(
    workspaces: list[WorkspaceResponse] | None = None,
) -> WorkspaceListResponse:
    return WorkspaceListResponse(data=workspaces or [_workspace_response()])


def _make_mock_workspace_service() -> MagicMock:
    svc = MagicMock()
    svc.create_workspace = AsyncMock()
    svc.join_workspace = AsyncMock()
    svc.get_user_workspaces = AsyncMock()
    return svc


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_workspace_service():
    return _make_mock_workspace_service()


@pytest.fixture
async def workspace_client(db_session, mock_workspace_service):
    """
    AsyncClient with WorkspaceService mocked.
    Auth dependency (JWT validation) still runs — pass valid tokens
    using make_jwt / auth_headers fixtures.
    """
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_workspace_service] = lambda: mock_workspace_service

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client, mock_workspace_service

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# POST /api/v1/workspaces/  — Create workspace
# ---------------------------------------------------------------------------


class TestCreateWorkspace:
    @pytest.mark.asyncio
    async def test_create_success_returns_201(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.create_workspace.return_value = _workspace_response()

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_create_returns_workspace_shape(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.create_workspace.return_value = _workspace_response()

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert body["slug"] == "my-team"
        assert body["name"] == "My Team"
        assert body["owner_id"] == USER_ID
        assert body["plan"] == "free"
        assert "id" in body
        assert "created_at" in body

    @pytest.mark.asyncio
    async def test_create_calls_service_with_user_id_and_request(self, workspace_client, make_jwt):
        """Service is called with the JWT user_id and validated request."""
        client, svc = workspace_client
        svc.create_workspace.return_value = _workspace_response()
        token = make_jwt(USER_ID, EMAIL)

        await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers={"Authorization": f"Bearer {token}"},
        )

        svc.create_workspace.assert_awaited_once()
        call_kwargs = svc.create_workspace.call_args
        assert call_kwargs.kwargs["user_id"] == USER_ID
        assert call_kwargs.kwargs["request"].slug == "my-team"

    @pytest.mark.asyncio
    async def test_create_slug_taken_returns_409(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.create_workspace.side_effect = WorkspaceError(
            error_code="slug_already_taken",
            message="The slug 'my-team' is already taken.",
            details={"slug": "my-team"},
        )

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 409
        assert response.json()["error"] == "slug_already_taken"

    @pytest.mark.asyncio
    async def test_create_slug_taken_includes_details(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.create_workspace.side_effect = WorkspaceError(
            error_code="slug_already_taken",
            message="Slug taken",
            details={"slug": "my-team"},
        )

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert body["details"]["slug"] == "my-team"

    @pytest.mark.asyncio
    async def test_create_failed_returns_500(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.create_workspace.side_effect = WorkspaceError(
            error_code="create_failed",
            message="Could not create workspace.",
        )

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_create_unexpected_error_returns_500(self, workspace_client, auth_headers):
        """Unhandled exceptions are caught and wrapped as create_failed."""
        client, svc = workspace_client
        svc.create_workspace.side_effect = RuntimeError("db exploded")

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 500
        assert response.json()["error"] == "create_failed"

    @pytest.mark.asyncio
    async def test_create_missing_name_returns_422(self, workspace_client, auth_headers):
        client, _ = workspace_client

        response = await client.post(
            "/api/v1/workspaces/",
            json={"slug": "my-team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_missing_slug_returns_422(self, workspace_client, auth_headers):
        client, _ = workspace_client

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_invalid_slug_format_returns_422(self, workspace_client, auth_headers):
        """Slug must match ^[a-z0-9-]+$ — uppercase rejected by Pydantic."""
        client, _ = workspace_client

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "My_Team"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_no_token_returns_401(self, workspace_client):
        client, _ = workspace_client

        response = await client.post(
            "/api/v1/workspaces/",
            json={"name": "My Team", "slug": "my-team"},
        )

        assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /api/v1/workspaces/join — Join workspace
# ---------------------------------------------------------------------------


class TestJoinWorkspace:
    @pytest.mark.asyncio
    async def test_join_invalid_invite_code_returns_400(self, workspace_client, auth_headers):
        """join_workspace is a stub — always returns invalid_invite_code."""
        client, svc = workspace_client
        svc.join_workspace.side_effect = WorkspaceError(
            error_code="invalid_invite_code",
            message="Invite code is invalid or has expired.",
            details={"hint": "Workspace invites are not yet enabled."},
        )

        response = await client.post(
            "/api/v1/workspaces/join",
            json={"invite_code": "abc123"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 400
        assert response.json()["error"] == "invalid_invite_code"

    @pytest.mark.asyncio
    async def test_join_calls_service_with_user_id_and_invite_code(self, workspace_client, make_jwt):
        client, svc = workspace_client
        svc.join_workspace.side_effect = WorkspaceError(
            error_code="invalid_invite_code",
            message="Invalid",
        )
        token = make_jwt(USER_ID, EMAIL)

        await client.post(
            "/api/v1/workspaces/join",
            json={"invite_code": "mycode123"},
            headers={"Authorization": f"Bearer {token}"},
        )

        svc.join_workspace.assert_awaited_once_with(
            user_id=USER_ID,
            invite_code="mycode123",
        )

    @pytest.mark.asyncio
    async def test_join_missing_invite_code_returns_422(self, workspace_client, auth_headers):
        client, _ = workspace_client

        response = await client.post(
            "/api/v1/workspaces/join",
            json={},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_join_no_token_returns_401(self, workspace_client):
        client, _ = workspace_client

        response = await client.post(
            "/api/v1/workspaces/join",
            json={"invite_code": "abc123"},
        )

        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_join_unexpected_error_returns_500(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.join_workspace.side_effect = RuntimeError("unexpected")

        response = await client.post(
            "/api/v1/workspaces/join",
            json={"invite_code": "abc123"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_join_already_member_returns_409(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.join_workspace.side_effect = WorkspaceError(
            error_code="already_member",
            message="Already a member of this workspace.",
        )

        response = await client.post(
            "/api/v1/workspaces/join",
            json={"invite_code": "abc123"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 409


# ---------------------------------------------------------------------------
# GET /api/v1/workspaces/  — List workspaces
# ---------------------------------------------------------------------------


class TestGetWorkspaces:
    @pytest.mark.asyncio
    async def test_get_workspaces_returns_200(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.get_user_workspaces.return_value = _workspace_list_response()

        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_workspaces_returns_data_list(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.get_user_workspaces.return_value = _workspace_list_response()

        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert "data" in body
        assert len(body["data"]) == 1
        assert body["data"][0]["slug"] == "my-team"

    @pytest.mark.asyncio
    async def test_get_workspaces_returns_empty_list(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.get_user_workspaces.return_value = WorkspaceListResponse(data=[])

        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert body["data"] == []

    @pytest.mark.asyncio
    async def test_get_workspaces_calls_service_with_user_id(self, workspace_client, make_jwt):
        client, svc = workspace_client
        svc.get_user_workspaces.return_value = _workspace_list_response()
        token = make_jwt(USER_ID, EMAIL)

        await client.get(
            "/api/v1/workspaces/",
            headers={"Authorization": f"Bearer {token}"},
        )

        svc.get_user_workspaces.assert_awaited_once_with(user_id=USER_ID)

    @pytest.mark.asyncio
    async def test_get_workspaces_no_token_returns_401(self, workspace_client):
        client, _ = workspace_client

        response = await client.get("/api/v1/workspaces/")

        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_get_workspaces_fetch_failed_returns_500(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.get_user_workspaces.side_effect = WorkspaceError(
            error_code="fetch_failed",
            message="Could not retrieve workspaces.",
        )

        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 500
        assert response.json()["error"] == "fetch_failed"

    @pytest.mark.asyncio
    async def test_get_workspaces_unexpected_error_returns_500(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.get_user_workspaces.side_effect = RuntimeError("connection lost")

        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 500

    @pytest.mark.asyncio
    async def test_get_workspaces_returns_multiple_workspaces(self, workspace_client, auth_headers):
        client, svc = workspace_client
        svc.get_user_workspaces.return_value = _workspace_list_response(
            workspaces=[
                _workspace_response(workspace_id="ws-1", slug="team-a"),
                _workspace_response(workspace_id="ws-2", slug="team-b"),
            ]
        )

        response = await client.get(
            "/api/v1/workspaces/",
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert len(body["data"]) == 2
        slugs = {ws["slug"] for ws in body["data"]}
        assert "team-a" in slugs
        assert "team-b" in slugs
