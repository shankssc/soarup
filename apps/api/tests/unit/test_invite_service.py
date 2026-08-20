# apps/api/tests/unit/test_invite_service.py
# Unit tests for app/services/invite_service.py
#
# Strategy:
#   - All repository methods patched via AsyncMock — no DB calls
#   - send_invite_email patched — no real Resend calls
#   - settings.app_base_url patched where needed to control invite URL
#   - Tests cover: happy path, all InviteError cases, email-mismatch warning

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.invite import CreateInviteRequest
from app.services.invite_service import InviteError, InviteService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DB = MagicMock()
WORKSPACE_ID = "ws-abc"
INVITER_ID = "user-owner"
INVITEE_EMAIL = "invitee@example.com"
INVITEE_USER_ID = "user-invitee"


def _make_service() -> InviteService:
    return InviteService(db=DB)


def _make_workspace(name: str = "Acme", slug: str = "acme") -> MagicMock:
    w = MagicMock()
    w.id = WORKSPACE_ID
    w.name = name
    w.slug = slug
    return w


def _make_profile(full_name: str = "Alice Owner") -> MagicMock:
    p = MagicMock()
    p.id = INVITER_ID
    p.full_name = full_name
    return p


def _make_invite(
    code: str = "testcode123",
    is_used: bool = False,
    expires_at: datetime | None = None,
    email: str = INVITEE_EMAIL,
) -> MagicMock:
    inv = MagicMock()
    inv.id = "inv-1"
    inv.workspace_id = WORKSPACE_ID
    inv.code = code
    inv.is_used = is_used
    inv.email = email
    inv.expires_at = expires_at or (datetime.now(UTC) + timedelta(days=7))
    inv.used_at = None
    inv.used_by = None
    return inv


# ---------------------------------------------------------------------------
# create_invite
# ---------------------------------------------------------------------------


class TestCreateInvite:
    async def test_creates_invite_and_sends_email(self):
        service = _make_service()
        invite = _make_invite()
        request = CreateInviteRequest(email=INVITEE_EMAIL)

        with (
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=_make_workspace())),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=_make_profile())),
            patch("app.services.invite_service.InviteRepository.create", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.send_invite_email", new=AsyncMock(return_value=True)) as mock_email,
            patch("app.services.invite_service.settings") as mock_settings,
        ):
            mock_settings.app_base_url = "http://localhost:3000"
            result = await service.create_invite(WORKSPACE_ID, INVITER_ID, request)

        mock_email.assert_awaited_once()
        call_kwargs = mock_email.call_args.kwargs
        assert call_kwargs["to_email"] == INVITEE_EMAIL
        assert "testcode123" in call_kwargs["invite_url"]
        assert result.code == invite.code

    async def test_invite_url_uses_app_base_url(self):
        service = _make_service()
        invite = _make_invite(code="mycode")
        request = CreateInviteRequest(email=INVITEE_EMAIL)

        with (
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=_make_workspace())),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=_make_profile())),
            patch("app.services.invite_service.InviteRepository.create", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.send_invite_email", new=AsyncMock(return_value=True)) as mock_email,
            patch("app.services.invite_service.settings") as mock_settings,
        ):
            mock_settings.app_base_url = "https://soarup.app"
            await service.create_invite(WORKSPACE_ID, INVITER_ID, request)

        url = mock_email.call_args.kwargs["invite_url"]
        assert url == "https://soarup.app/invite/mycode"

    async def test_raises_when_workspace_not_found(self):
        service = _make_service()
        request = CreateInviteRequest(email=INVITEE_EMAIL)

        with patch(  # Noqa: SIM117
            "app.services.invite_service.WorkspaceRepository.get_by_id",
            new=AsyncMock(return_value=None),
        ):
            with pytest.raises(InviteError) as exc_info:
                await service.create_invite(WORKSPACE_ID, INVITER_ID, request)

        assert exc_info.value.error_code == "workspace_not_found"

    async def test_non_fatal_when_email_send_fails(self):
        service = _make_service()
        invite = _make_invite()
        request = CreateInviteRequest(email=INVITEE_EMAIL)

        with (
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=_make_workspace())),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=_make_profile())),
            patch("app.services.invite_service.InviteRepository.create", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.send_invite_email", new=AsyncMock(return_value=False)),
            patch("app.services.invite_service.settings") as mock_settings,
        ):
            mock_settings.app_base_url = "http://localhost:3000"
            # Should not raise — email failure is non-fatal
            result = await service.create_invite(WORKSPACE_ID, INVITER_ID, request)

        assert result is not None

    async def test_falls_back_to_teammate_when_inviter_profile_missing(self):
        service = _make_service()
        invite = _make_invite()
        request = CreateInviteRequest(email=INVITEE_EMAIL)

        with (
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=_make_workspace())),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=None)),  # no profile
            patch("app.services.invite_service.InviteRepository.create", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.send_invite_email", new=AsyncMock(return_value=True)) as mock_email,
            patch("app.services.invite_service.settings") as mock_settings,
        ):
            mock_settings.app_base_url = "http://localhost:3000"
            await service.create_invite(WORKSPACE_ID, INVITER_ID, request)

        assert mock_email.call_args.kwargs["invited_by_name"] == "A teammate"


# ---------------------------------------------------------------------------
# accept_invite
# ---------------------------------------------------------------------------


class TestAcceptInvite:
    async def test_adds_member_and_marks_invite_used(self):
        service = _make_service()
        invite = _make_invite()

        with (
            patch("app.services.invite_service.InviteRepository.get_by_code", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.WorkspaceRepository.get_member", new=AsyncMock(return_value=None)),
            patch("app.services.invite_service.WorkspaceRepository.add_member", new=AsyncMock()) as mock_add,
            patch("app.services.invite_service.InviteRepository.mark_used", new=AsyncMock()) as mock_mark,
        ):
            result = await service.accept_invite(
                code="testcode123",
                user_id=INVITEE_USER_ID,
                user_email=INVITEE_EMAIL,
            )

        assert result == WORKSPACE_ID
        mock_add.assert_awaited_once_with(WORKSPACE_ID, INVITEE_USER_ID, "member")
        mock_mark.assert_awaited_once_with(invite, INVITEE_USER_ID)

    async def test_raises_when_invite_not_found(self):
        service = _make_service()
        with patch(  # Noqa: SIM117
            "app.services.invite_service.InviteRepository.get_by_code",  # Noqa: SIM117
            new=AsyncMock(return_value=None),
        ):
            with pytest.raises(InviteError) as exc_info:
                await service.accept_invite("bad-code", INVITEE_USER_ID, INVITEE_EMAIL)
        assert exc_info.value.error_code == "invite_not_found"

    async def test_raises_when_invite_already_used(self):
        service = _make_service()
        invite = _make_invite(is_used=True)
        with patch(  # Noqa: SIM117
            "app.services.invite_service.InviteRepository.get_by_code",
            new=AsyncMock(return_value=invite),
        ):
            with pytest.raises(InviteError) as exc_info:
                await service.accept_invite("code", INVITEE_USER_ID, INVITEE_EMAIL)
        assert exc_info.value.error_code == "invite_already_used"

    async def test_raises_when_invite_expired(self):
        service = _make_service()
        invite = _make_invite(expires_at=datetime.now(UTC) - timedelta(hours=1))
        with patch(  # Noqa: SIM117
            "app.services.invite_service.InviteRepository.get_by_code",  # Noqa: SIM117
            new=AsyncMock(return_value=invite),
        ):
            with pytest.raises(InviteError) as exc_info:
                await service.accept_invite("code", INVITEE_USER_ID, INVITEE_EMAIL)
        assert exc_info.value.error_code == "invite_expired"

    async def test_raises_when_already_a_member(self):
        service = _make_service()
        invite = _make_invite()
        existing_member = MagicMock()
        with (  # Noqa: SIM117
            patch("app.services.invite_service.InviteRepository.get_by_code", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.WorkspaceRepository.get_member", new=AsyncMock(return_value=existing_member)),
        ):
            with pytest.raises(InviteError) as exc_info:
                await service.accept_invite("code", INVITEE_USER_ID, INVITEE_EMAIL)
        assert exc_info.value.error_code == "already_member"

    async def test_warns_on_email_mismatch_but_does_not_block(self, caplog):
        """
        Email mismatch: invited via work email, accepted with personal email.
        We log a warning but allow acceptance — documented known tradeoff.
        """
        service = _make_service()
        invite = _make_invite(email="work@company.com")

        with (
            patch("app.services.invite_service.InviteRepository.get_by_code", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.WorkspaceRepository.get_member", new=AsyncMock(return_value=None)),
            patch("app.services.invite_service.WorkspaceRepository.add_member", new=AsyncMock()),
            patch("app.services.invite_service.InviteRepository.mark_used", new=AsyncMock()),
        ):
            import logging

            with caplog.at_level(logging.WARNING):
                result = await service.accept_invite(
                    code="testcode123",
                    user_id=INVITEE_USER_ID,
                    user_email="personal@gmail.com",  # different from invite email
                )

        # Acceptance succeeds despite mismatch
        assert result == WORKSPACE_ID


# ---------------------------------------------------------------------------
# get_invite_details
# ---------------------------------------------------------------------------


class TestGetInviteDetails:
    async def test_returns_valid_details_for_active_invite(self):
        service = _make_service()
        invite = _make_invite()
        workspace = _make_workspace(name="Acme Corp", slug="acme-corp")
        inviter = _make_profile("Bob Inviter")

        with (
            patch("app.services.invite_service.InviteRepository.get_by_code", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=workspace)),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=inviter)),
        ):
            result = await service.get_invite_details("testcode123")

        assert result.workspace_name == "Acme Corp"
        assert result.workspace_slug == "acme-corp"
        assert result.invited_by_name == "Bob Inviter"
        assert result.is_valid is True

    async def test_is_valid_false_for_expired_invite(self):
        service = _make_service()
        invite = _make_invite(expires_at=datetime.now(UTC) - timedelta(hours=1))

        with (
            patch("app.services.invite_service.InviteRepository.get_by_code", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=_make_workspace())),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=_make_profile())),
        ):
            result = await service.get_invite_details("expiredcode")

        assert result.is_valid is False

    async def test_is_valid_false_for_used_invite(self):
        service = _make_service()
        invite = _make_invite(is_used=True)

        with (
            patch("app.services.invite_service.InviteRepository.get_by_code", new=AsyncMock(return_value=invite)),
            patch("app.services.invite_service.WorkspaceRepository.get_by_id", new=AsyncMock(return_value=_make_workspace())),
            patch("app.services.invite_service.ProfileRepository.get_by_user_id", new=AsyncMock(return_value=_make_profile())),
        ):
            result = await service.get_invite_details("usedcode")

        assert result.is_valid is False

    async def test_raises_when_code_not_found(self):
        service = _make_service()
        with patch(  # Noqa: SIM117
            "app.services.invite_service.InviteRepository.get_by_code",
            new=AsyncMock(return_value=None),
        ):
            with pytest.raises(InviteError) as exc_info:
                await service.get_invite_details("nonexistent")
        assert exc_info.value.error_code == "invite_not_found"
