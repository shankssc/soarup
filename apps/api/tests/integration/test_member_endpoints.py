# apps/api/tests/integration/test_member_endpoints.py
# Integration tests for app/routers/members.py
#
# Patching strategy:
#   Both the RBAC checker and the router call WorkspaceRepository.get_member.
#   Patching the method with a fixed return_value means whichever call runs
#   last wins, breaking either RBAC or the handler guard.
#
#   Solution: patch with side_effect. The side_effect function receives
#   (workspace_id, user_id) and returns the right mock based on user_id:
#     - caller_id    → caller's role mock  (satisfies RBAC)
#     - target_id    → target member mock  (satisfies handler guard)
#     - anything else → None               (triggers 404)
#
#   This is defined once per fixture via _make_get_member_side_effect and
#   tests can pass additional overrides as needed.

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import require_onboarded
from app.db.session import get_db_session
from app.routers.members import router

pytestmark = pytest.mark.db

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WORKSPACE_ID = "ws-abc"
OWNER_ID = "user-owner"
ADMIN_ID = "user-admin"
MEMBER_ID = "user-member"
NOW = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)  # Noqa: UP017
RBAC_GET_MEMBER = "app.api.rbac.WorkspaceRepository.get_member"


def _make_member_orm(user_id: str, role: str) -> MagicMock:
    m = MagicMock()
    m.user_id = user_id
    m.role = role
    m.joined_at = NOW
    return m


def _make_profile(user_id: str, name: str) -> MagicMock:
    p = MagicMock()
    p.id = user_id
    p.full_name = name
    p.avatar_url = None
    return p


def _make_rows(
    members: list[tuple[str, str, str]],
) -> list[tuple[MagicMock, MagicMock]]:
    """members: list of (user_id, role, full_name)"""
    return [(_make_member_orm(uid, role), _make_profile(uid, name)) for uid, role, name in members]


def _make_get_member_side_effect(
    caller_id: str,
    caller_role: str,
    extra: dict[str, MagicMock | None] | None = None,
):
    """
    Returns an async side_effect for WorkspaceRepository.get_member that
    serves different mocks depending on which user_id is being looked up.

    - caller_id  → mock member with caller_role  (RBAC check passes)
    - keys in extra → their mapped value          (handler guard sees target)
    - anything else → None                        (triggers 404)
    """
    lookup: dict[str, MagicMock | None] = {
        caller_id: _make_member_orm(caller_id, caller_role),
        **(extra or {}),
    }

    async def _side_effect(workspace_id: str, user_id: str) -> MagicMock | None:
        return lookup.get(user_id)

    return _side_effect


def _make_app(caller_id: str) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_onboarded] = lambda: {
        "user_id": caller_id,
        "email": f"{caller_id}@example.com",
    }
    app.dependency_overrides[get_db_session] = lambda: AsyncMock()
    return app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def owner_client():
    app = _make_app(OWNER_ID)
    with patch(RBAC_GET_MEMBER, new=AsyncMock(side_effect=_make_get_member_side_effect(OWNER_ID, "owner"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def admin_client():
    app = _make_app(ADMIN_ID)
    with patch(RBAC_GET_MEMBER, new=AsyncMock(side_effect=_make_get_member_side_effect(ADMIN_ID, "admin"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def member_client():
    app = _make_app(MEMBER_ID)
    with patch(RBAC_GET_MEMBER, new=AsyncMock(side_effect=_make_get_member_side_effect(MEMBER_ID, "member"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


# Fixtures with a known target — used when the handler guard also calls
# get_member for a specific target user_id.


@pytest_asyncio.fixture
async def owner_client_with_member_target():
    app = _make_app(OWNER_ID)
    with patch(
        RBAC_GET_MEMBER,
        new=AsyncMock(
            side_effect=_make_get_member_side_effect(
                OWNER_ID,
                "owner",
                extra={MEMBER_ID: _make_member_orm(MEMBER_ID, "member")},
            )
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def owner_client_with_owner_target():
    app = _make_app(OWNER_ID)
    with patch(
        RBAC_GET_MEMBER,
        new=AsyncMock(
            side_effect=_make_get_member_side_effect(
                OWNER_ID,
                "owner",
                extra={OWNER_ID: _make_member_orm(OWNER_ID, "owner")},
            )
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def admin_client_with_member_target():
    app = _make_app(ADMIN_ID)
    with patch(
        RBAC_GET_MEMBER,
        new=AsyncMock(
            side_effect=_make_get_member_side_effect(
                ADMIN_ID,
                "admin",
                extra={MEMBER_ID: _make_member_orm(MEMBER_ID, "member")},
            )
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def admin_client_with_owner_target():
    app = _make_app(ADMIN_ID)
    with patch(
        RBAC_GET_MEMBER,
        new=AsyncMock(
            side_effect=_make_get_member_side_effect(
                ADMIN_ID,
                "admin",
                extra={OWNER_ID: _make_member_orm(OWNER_ID, "owner")},
            )
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def admin_client_with_other_admin_target():
    app = _make_app(ADMIN_ID)
    with patch(
        RBAC_GET_MEMBER,
        new=AsyncMock(
            side_effect=_make_get_member_side_effect(
                ADMIN_ID,
                "admin",
                extra={"other-admin": _make_member_orm("other-admin", "admin")},
            )
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


# ---------------------------------------------------------------------------
# GET /members — list
# ---------------------------------------------------------------------------


class TestListMembers:
    async def test_returns_member_list(self, member_client):
        rows = _make_rows(
            [
                (OWNER_ID, "owner", "Alice Owner"),
                (ADMIN_ID, "admin", "Bob Admin"),
                (MEMBER_ID, "member", "Carol Member"),
            ]
        )
        with patch(
            "app.routers.members.WorkspaceRepository.get_workspace_members_with_profiles",
            new=AsyncMock(return_value=rows),
        ):
            r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/members")

        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        names = [m["full_name"] for m in body["members"]]
        assert "Alice Owner" in names
        assert "Bob Admin" in names

    async def test_empty_workspace(self, member_client):
        with patch(
            "app.routers.members.WorkspaceRepository.get_workspace_members_with_profiles",
            new=AsyncMock(return_value=[]),
        ):
            r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/members")

        assert r.status_code == 200
        assert r.json()["total"] == 0

    async def test_member_role_present_in_response(self, member_client):
        rows = _make_rows([(OWNER_ID, "owner", "Alice")])
        with patch(
            "app.routers.members.WorkspaceRepository.get_workspace_members_with_profiles",
            new=AsyncMock(return_value=rows),
        ):
            r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/members")

        assert r.status_code == 200
        assert r.json()["members"][0]["role"] == "owner"


# ---------------------------------------------------------------------------
# PATCH /members/:id/role — owner only
# ---------------------------------------------------------------------------


class TestUpdateMemberRole:
    async def test_owner_can_change_member_to_admin(self, owner_client_with_member_target):
        updated = _make_member_orm(MEMBER_ID, "admin")
        rows = _make_rows([(MEMBER_ID, "admin", "Carol")])

        with (
            patch("app.routers.members.WorkspaceRepository.update_member_role", new=AsyncMock(return_value=updated)),
            patch("app.routers.members.WorkspaceRepository.get_workspace_members_with_profiles", new=AsyncMock(return_value=rows)),
        ):
            r = await owner_client_with_member_target.patch(
                f"/api/v1/workspaces/{WORKSPACE_ID}/members/{MEMBER_ID}/role",
                json={"role": "admin"},
            )

        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    async def test_admin_gets_403(self, admin_client):
        r = await admin_client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/members/{MEMBER_ID}/role",
            json={"role": "admin"},
        )
        assert r.status_code == 403

    async def test_cannot_change_owner_role(self, owner_client_with_owner_target):
        r = await owner_client_with_owner_target.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/members/{OWNER_ID}/role",
            json={"role": "member"},
        )
        assert r.status_code == 400
        assert "owner role cannot be changed" in r.json()["detail"].lower()

    async def test_invalid_role_value_rejected(self, owner_client):
        r = await owner_client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/members/{MEMBER_ID}/role",
            json={"role": "superuser"},
        )
        assert r.status_code == 422

    async def test_target_not_found_returns_404(self, owner_client):
        # ghost-user not in the side_effect lookup → get_member returns None → 404
        r = await owner_client.patch(
            f"/api/v1/workspaces/{WORKSPACE_ID}/members/ghost-user/role",
            json={"role": "admin"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /members/:id — admin+
# ---------------------------------------------------------------------------


class TestRemoveMember:
    async def test_admin_can_remove_member(self, admin_client_with_member_target):
        with patch(
            "app.routers.members.WorkspaceRepository.remove_member",
            new=AsyncMock(return_value=True),
        ):
            r = await admin_client_with_member_target.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/members/{MEMBER_ID}")
        assert r.status_code == 204

    async def test_owner_can_remove_member(self, owner_client_with_member_target):
        with patch(
            "app.routers.members.WorkspaceRepository.remove_member",
            new=AsyncMock(return_value=True),
        ):
            r = await owner_client_with_member_target.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/members/{MEMBER_ID}")
        assert r.status_code == 204

    async def test_member_gets_403(self, member_client):
        r = await member_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/members/{ADMIN_ID}")
        assert r.status_code == 403

    async def test_cannot_remove_owner(self, admin_client_with_owner_target):
        r = await admin_client_with_owner_target.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/members/{OWNER_ID}")
        assert r.status_code == 400
        assert "owner" in r.json()["detail"].lower()

    async def test_admin_cannot_remove_another_admin(self, admin_client_with_other_admin_target):
        r = await admin_client_with_other_admin_target.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/members/other-admin")
        assert r.status_code == 403

    async def test_target_not_found_returns_404(self, admin_client):
        # ghost-user not in the side_effect lookup → get_member returns None → 404
        r = await admin_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/members/ghost-user")
        assert r.status_code == 404
