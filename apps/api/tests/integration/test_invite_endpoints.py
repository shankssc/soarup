# apps/api/tests/integration/test_invite_endpoints.py
# Integration tests for app/routers/invites.py
#
# Patching strategy:
#   - Workspace-scoped endpoints go through RBAC — patch
#     app.api.rbac.WorkspaceRepository.get_member with side_effect
#     (same pattern as test_member_router.py)
#   - Public endpoints (GET /invites/{code}) need no RBAC patch
#   - Authenticated endpoints (POST /invites/{code}/accept) only need
#     require_onboarded overridden — no RBAC involved
#   - InviteService methods patched per-test — no real DB calls

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import require_onboarded
from app.db.session import get_db_session
from app.routers.invites import router
from app.schemas.invite import InviteDetailsResponse, InviteResponse, PendingInviteResponse
from app.services.invite_service import InviteError

pytestmark = pytest.mark.db

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WORKSPACE_ID = "ws-abc"
OWNER_ID = "user-owner"
ADMIN_ID = "user-admin"
MEMBER_ID = "user-member"
INVITEE_EMAIL = "invitee@example.com"
INVITE_ID = "inv-001"
INVITE_CODE = "testcode123"
RBAC_GET_MEMBER = "app.api.rbac.WorkspaceRepository.get_member"
NOW = datetime(2026, 6, 1, 12, 0, 0, tzinfo=UTC)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_member_orm(user_id: str, role: str) -> MagicMock:
    m = MagicMock()
    m.user_id = user_id
    m.role = role
    m.joined_at = NOW
    return m


def _make_invite_response() -> InviteResponse:
    return InviteResponse(
        id=INVITE_ID,
        workspace_id=WORKSPACE_ID,
        email=INVITEE_EMAIL,
        code=INVITE_CODE,
        expires_at=NOW + timedelta(days=7),
        is_used=False,
        created_at=NOW,
    )


def _make_pending_invite(invite_id: str = INVITE_ID) -> PendingInviteResponse:
    return PendingInviteResponse(
        id=invite_id,
        email=INVITEE_EMAIL,
        expires_at=NOW + timedelta(days=7),
        created_at=NOW,
    )


def _make_invite_details(is_valid: bool = True) -> InviteDetailsResponse:
    return InviteDetailsResponse(
        workspace_name="Acme Corp",
        workspace_slug="acme-corp",
        invited_by_name="Alice Owner",
        email=INVITEE_EMAIL,
        expires_at=NOW + timedelta(days=7),
        is_valid=is_valid,
    )


def _make_get_member_side_effect(
    caller_id: str,
    caller_role: str,
    extra: dict[str, MagicMock | None] | None = None,
):
    lookup: dict[str, MagicMock | None] = {
        caller_id: _make_member_orm(caller_id, caller_role),
        **(extra or {}),
    }

    async def _side_effect(workspace_id: str, user_id: str) -> MagicMock | None:
        return lookup.get(user_id)

    return _side_effect


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def _make_app(caller_id: str, caller_email: str = "caller@example.com") -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_onboarded] = lambda: {
        "user_id": caller_id,
        "email": caller_email,
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


@pytest_asyncio.fixture
async def authed_client():
    """Authenticated client for endpoints that only need OnboardedDep (no RBAC)."""
    app = _make_app(MEMBER_ID, INVITEE_EMAIL)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def public_client():
    """Unauthenticated client for public endpoints — no auth override needed."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_db_session] = lambda: AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# POST /workspaces/{id}/invites — create invite
# ---------------------------------------------------------------------------


class TestCreateInvite:
    async def test_returns_201_with_invite(self, member_client):
        with patch(
            "app.routers.invites.InviteService.create_invite",
            new=AsyncMock(return_value=_make_invite_response()),
        ):
            r = await member_client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/invites",
                json={"email": INVITEE_EMAIL},
            )

        assert r.status_code == 201
        body = r.json()
        assert body["email"] == INVITEE_EMAIL
        assert body["code"] == INVITE_CODE
        assert body["is_used"] is False

    async def test_invalid_email_returns_422(self, member_client):
        r = await member_client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/invites",
            json={"email": "not-an-email"},
        )
        assert r.status_code == 422

    async def test_workspace_not_found_returns_404(self, member_client):
        with patch(
            "app.routers.invites.InviteService.create_invite",
            new=AsyncMock(side_effect=InviteError("workspace_not_found", "Workspace not found.")),
        ):
            r = await member_client.post(
                "/api/v1/workspaces/nonexistent/invites",
                json={"email": INVITEE_EMAIL},
            )
        assert r.status_code == 404

    async def test_unauthenticated_returns_401(self, public_client):
        r = await public_client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/invites",
            json={"email": INVITEE_EMAIL},
        )
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /workspaces/{id}/invites — list pending invites (admin+)
# ---------------------------------------------------------------------------


class TestListPendingInvites:
    async def test_admin_sees_pending_invites(self, admin_client):
        invites = [_make_pending_invite("inv-1"), _make_pending_invite("inv-2")]
        with patch(
            "app.routers.invites.InviteRepository.get_pending_by_workspace",
            new=AsyncMock(return_value=invites),
        ):
            r = await admin_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/invites")

        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 2
        assert len(body["invites"]) == 2

    async def test_owner_sees_pending_invites(self, owner_client):
        with patch(
            "app.routers.invites.InviteRepository.get_pending_by_workspace",
            new=AsyncMock(return_value=[]),
        ):
            r = await owner_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/invites")

        assert r.status_code == 200
        assert r.json()["total"] == 0

    async def test_member_gets_403(self, member_client):
        r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/invites")
        assert r.status_code == 403

    async def test_empty_list_when_no_pending(self, admin_client):
        with patch(
            "app.routers.invites.InviteRepository.get_pending_by_workspace",
            new=AsyncMock(return_value=[]),
        ):
            r = await admin_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/invites")

        assert r.status_code == 200
        assert r.json()["invites"] == []


# ---------------------------------------------------------------------------
# DELETE /workspaces/{id}/invites/{invite_id} — revoke (admin+)
# ---------------------------------------------------------------------------


class TestRevokeInvite:
    async def test_admin_can_revoke_pending_invite(self, admin_client):
        invite = MagicMock()
        invite.workspace_id = WORKSPACE_ID
        invite.is_used = False

        with (
            patch("app.routers.invites.InviteRepository.get_by_id", new=AsyncMock(return_value=invite)),
            patch("app.routers.invites.InviteRepository.revoke", new=AsyncMock()),
        ):
            r = await admin_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/invites/{INVITE_ID}")

        assert r.status_code == 204

    async def test_owner_can_revoke_pending_invite(self, owner_client):
        invite = MagicMock()
        invite.workspace_id = WORKSPACE_ID
        invite.is_used = False

        with (
            patch("app.routers.invites.InviteRepository.get_by_id", new=AsyncMock(return_value=invite)),
            patch("app.routers.invites.InviteRepository.revoke", new=AsyncMock()),
        ):
            r = await owner_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/invites/{INVITE_ID}")

        assert r.status_code == 204

    async def test_member_gets_403(self, member_client):
        r = await member_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/invites/{INVITE_ID}")
        assert r.status_code == 403

    async def test_invite_not_found_returns_404(self, admin_client):
        with patch(
            "app.routers.invites.InviteRepository.get_by_id",
            new=AsyncMock(return_value=None),
        ):
            r = await admin_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/invites/ghost-invite")
        assert r.status_code == 404

    async def test_wrong_workspace_returns_404(self, admin_client):
        invite = MagicMock()
        invite.workspace_id = "ws-other"  # belongs to a different workspace
        invite.is_used = False

        with patch(
            "app.routers.invites.InviteRepository.get_by_id",
            new=AsyncMock(return_value=invite),
        ):
            r = await admin_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/invites/{INVITE_ID}")
        assert r.status_code == 404

    async def test_already_used_invite_returns_410(self, admin_client):
        invite = MagicMock()
        invite.workspace_id = WORKSPACE_ID
        invite.is_used = True

        with patch(
            "app.routers.invites.InviteRepository.get_by_id",
            new=AsyncMock(return_value=invite),
        ):
            r = await admin_client.delete(f"/api/v1/workspaces/{WORKSPACE_ID}/invites/{INVITE_ID}")
        assert r.status_code == 410


# ---------------------------------------------------------------------------
# GET /invites/{code} — public invite details
# ---------------------------------------------------------------------------


class TestGetInviteDetails:
    async def test_returns_details_for_valid_invite(self, public_client):
        with patch(
            "app.routers.invites.InviteService.get_invite_details",
            new=AsyncMock(return_value=_make_invite_details(is_valid=True)),
        ):
            r = await public_client.get(f"/api/v1/invites/{INVITE_CODE}")

        assert r.status_code == 200
        body = r.json()
        assert body["workspace_name"] == "Acme Corp"
        assert body["invited_by_name"] == "Alice Owner"
        assert body["is_valid"] is True

    async def test_returns_is_valid_false_for_expired(self, public_client):
        with patch(
            "app.routers.invites.InviteService.get_invite_details",
            new=AsyncMock(return_value=_make_invite_details(is_valid=False)),
        ):
            r = await public_client.get(f"/api/v1/invites/{INVITE_CODE}")

        assert r.status_code == 200
        assert r.json()["is_valid"] is False

    async def test_invalid_code_returns_404(self, public_client):
        with patch(
            "app.routers.invites.InviteService.get_invite_details",
            new=AsyncMock(side_effect=InviteError("invite_not_found", "Invite not found.")),
        ):
            r = await public_client.get("/api/v1/invites/badcode")

        assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /invites/{code}/accept — accept invite
# ---------------------------------------------------------------------------


class TestAcceptInvite:
    async def test_returns_workspace_id_on_success(self, authed_client):
        with patch(
            "app.routers.invites.InviteService.accept_invite",
            new=AsyncMock(return_value=WORKSPACE_ID),
        ):
            r = await authed_client.post(f"/api/v1/invites/{INVITE_CODE}/accept")

        assert r.status_code == 200
        assert r.json()["workspace_id"] == WORKSPACE_ID

    async def test_already_used_returns_410(self, authed_client):
        with patch(
            "app.routers.invites.InviteService.accept_invite",
            new=AsyncMock(side_effect=InviteError("invite_already_used", "Already used.")),
        ):
            r = await authed_client.post(f"/api/v1/invites/{INVITE_CODE}/accept")

        assert r.status_code == 410

    async def test_expired_returns_410(self, authed_client):
        with patch(
            "app.routers.invites.InviteService.accept_invite",
            new=AsyncMock(side_effect=InviteError("invite_expired", "Expired.")),
        ):
            r = await authed_client.post(f"/api/v1/invites/{INVITE_CODE}/accept")

        assert r.status_code == 410

    async def test_already_member_returns_409(self, authed_client):
        with patch(
            "app.routers.invites.InviteService.accept_invite",
            new=AsyncMock(side_effect=InviteError("already_member", "Already a member.")),
        ):
            r = await authed_client.post(f"/api/v1/invites/{INVITE_CODE}/accept")

        assert r.status_code == 409

    async def test_invalid_code_returns_404(self, authed_client):
        with patch(
            "app.routers.invites.InviteService.accept_invite",
            new=AsyncMock(side_effect=InviteError("invite_not_found", "Not found.")),
        ):
            r = await authed_client.post("/api/v1/invites/badcode/accept")

        assert r.status_code == 404

    async def test_unauthenticated_returns_401(self, public_client):
        r = await public_client.post(f"/api/v1/invites/{INVITE_CODE}/accept")
        assert r.status_code == 401
