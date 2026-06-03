# apps/api/tests/integration/test_rbac.py
# Integration tests for app/api/rbac.py
#
# Strategy:
#   - WorkspaceRepository.get_member is patched — no DB calls
#   - FastAPI app is constructed per-test with overrides
#   - Tests exercise the full dependency stack via ASGI to catch
#     any wiring issues (missing imports, wrong dep injection, etc.)
#   - All role hierarchy combinations are covered

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import require_onboarded
from app.api.rbac import WorkspaceAdminDep, WorkspaceMemberDep, WorkspaceOwnerDep, _check_role

pytestmark = pytest.mark.db


# ---------------------------------------------------------------------------
# Pure unit tests for _check_role helper
# ---------------------------------------------------------------------------


class TestCheckRole:
    def test_owner_satisfies_owner(self):
        assert _check_role("owner", "owner") is True

    def test_owner_satisfies_admin(self):
        assert _check_role("owner", "admin") is True

    def test_owner_satisfies_member(self):
        assert _check_role("owner", "member") is True

    def test_admin_satisfies_admin(self):
        assert _check_role("admin", "admin") is True

    def test_admin_satisfies_member(self):
        assert _check_role("admin", "member") is True

    def test_admin_fails_owner(self):
        assert _check_role("admin", "owner") is False

    def test_member_satisfies_member(self):
        assert _check_role("member", "member") is True

    def test_member_fails_admin(self):
        assert _check_role("member", "admin") is False

    def test_member_fails_owner(self):
        assert _check_role("member", "owner") is False

    def test_unknown_role_fails_any(self):
        assert _check_role("unknown", "member") is False
        assert _check_role("unknown", "admin") is False


# ---------------------------------------------------------------------------
# Integration-style tests: dependency enforced in a real FastAPI app
# ---------------------------------------------------------------------------

WORKSPACE_ID = "ws-test-123"
USER_ID = "user-abc"


def _make_mock_member(role: str) -> MagicMock:
    m = MagicMock()
    m.role = role
    return m


def _make_app(dep_alias) -> FastAPI:
    """Build a minimal FastAPI app with a single endpoint using the given dep."""
    app = FastAPI()
    test_router = APIRouter()

    @test_router.get("/workspaces/{workspace_id}/test")
    async def test_endpoint(user_ctx: dep_alias) -> dict[str, Any]:
        return {"role": user_ctx.get("workspace_role")}

    app.include_router(test_router)
    return app


def _user_ctx_override() -> dict[str, Any]:
    return {"user_id": USER_ID, "email": "test@example.com", "access_token": "tok"}


@pytest_asyncio.fixture
async def member_client():
    """Client wired to WorkspaceMemberDep."""
    app = _make_app(WorkspaceMemberDep)
    app.dependency_overrides[require_onboarded] = lambda: _user_ctx_override()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def admin_client():
    app = _make_app(WorkspaceAdminDep)
    app.dependency_overrides[require_onboarded] = lambda: _user_ctx_override()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def owner_client():
    app = _make_app(WorkspaceOwnerDep)
    app.dependency_overrides[require_onboarded] = lambda: _user_ctx_override()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


URL = f"/workspaces/{WORKSPACE_ID}/test"


# --- WorkspaceMemberDep ---


class TestWorkspaceMemberDep:
    async def test_owner_passes(self, member_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("owner")),
        ):
            r = await member_client.get(URL)
        assert r.status_code == 200
        assert r.json()["role"] == "owner"

    async def test_admin_passes(self, member_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("admin")),
        ):
            r = await member_client.get(URL)
        assert r.status_code == 200

    async def test_member_passes(self, member_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("member")),
        ):
            r = await member_client.get(URL)
        assert r.status_code == 200

    async def test_non_member_gets_403(self, member_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=None),
        ):
            r = await member_client.get(URL)
        assert r.status_code == 403
        assert "not a member" in r.json()["detail"].lower()


# --- WorkspaceAdminDep ---


class TestWorkspaceAdminDep:
    async def test_owner_passes(self, admin_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("owner")),
        ):
            r = await admin_client.get(URL)
        assert r.status_code == 200

    async def test_admin_passes(self, admin_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("admin")),
        ):
            r = await admin_client.get(URL)
        assert r.status_code == 200

    async def test_member_gets_403(self, admin_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("member")),
        ):
            r = await admin_client.get(URL)
        assert r.status_code == 403
        assert "admin" in r.json()["detail"].lower()

    async def test_non_member_gets_403(self, admin_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=None),
        ):
            r = await admin_client.get(URL)
        assert r.status_code == 403


# --- WorkspaceOwnerDep ---


class TestWorkspaceOwnerDep:
    async def test_owner_passes(self, owner_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("owner")),
        ):
            r = await owner_client.get(URL)
        assert r.status_code == 200

    async def test_admin_gets_403(self, owner_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("admin")),
        ):
            r = await owner_client.get(URL)
        assert r.status_code == 403
        assert "owner" in r.json()["detail"].lower()

    async def test_member_gets_403(self, owner_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=_make_mock_member("member")),
        ):
            r = await owner_client.get(URL)
        assert r.status_code == 403

    async def test_non_member_gets_403(self, owner_client):
        with patch(
            "app.api.rbac.WorkspaceRepository.get_member",
            new=AsyncMock(return_value=None),
        ):
            r = await owner_client.get(URL)
        assert r.status_code == 403
