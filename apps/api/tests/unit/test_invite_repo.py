# apps/api/tests/unit/test_invite_repo.py
# Unit tests for app/repositories/invite_repo.py

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.repositories.invite_repo import INVITE_EXPIRY_DAYS, InviteRepository

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_invite(
    invite_id: str = "inv-1",
    workspace_id: str = "ws-1",
    email: str = "user@example.com",
    is_used: bool = False,
    expires_at: datetime | None = None,
) -> MagicMock:
    inv = MagicMock()
    inv.id = invite_id
    inv.workspace_id = workspace_id
    inv.email = email
    inv.is_used = is_used
    inv.expires_at = expires_at or (datetime.now(UTC) + timedelta(days=7))
    inv.used_at = None
    inv.used_by = None
    return inv


def _make_repo() -> tuple[InviteRepository, MagicMock]:
    db = MagicMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()

    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)
    db.execute.return_value.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    return InviteRepository(db), db


# ---------------------------------------------------------------------------
# TestCreate
#
# We patch get_pending_by_email_and_workspace at the instance level instead
# of patching WorkspaceInvite. Patching the model class causes SQLAlchemy to
# receive a MagicMock inside select(), which raises ArgumentError before any
# test logic runs. Patching the pre-check method short-circuits it cleanly
# and lets the real WorkspaceInvite constructor run normally.
# ---------------------------------------------------------------------------


class TestCreate:
    async def test_creates_invite_and_adds_to_session(self):
        repo, db = _make_repo()

        with patch.object(repo, "get_pending_by_email_and_workspace", new=AsyncMock(return_value=None)):
            await repo.create("ws-1", "user-owner", "new@example.com")

        db.add.assert_called_once()
        db.commit.assert_awaited_once()

    async def test_invalidates_existing_pending_invite_before_creating(self):
        repo, db = _make_repo()
        existing = _make_invite(is_used=False)

        with patch.object(repo, "get_pending_by_email_and_workspace", new=AsyncMock(return_value=existing)):
            await repo.create("ws-1", "user-owner", "user@example.com")

        assert existing.is_used is True
        db.flush.assert_awaited_once()
        db.add.assert_called_once()

    async def test_no_flush_when_no_existing_invite(self):
        repo, db = _make_repo()

        with patch.object(repo, "get_pending_by_email_and_workspace", new=AsyncMock(return_value=None)):
            await repo.create("ws-1", "user-owner", "new@example.com")

        db.flush.assert_not_awaited()

    async def test_expiry_is_7_days_from_now(self):
        repo, db = _make_repo()

        # Capture the object passed to db.add to inspect its expires_at
        captured: dict = {}

        def _capture(obj: object) -> None:
            captured["invite"] = obj

        db.add.side_effect = _capture

        with patch.object(repo, "get_pending_by_email_and_workspace", new=AsyncMock(return_value=None)):
            await repo.create("ws-1", "owner", "x@example.com")

        invite = captured["invite"]
        delta = invite.expires_at - datetime.now(UTC)
        assert timedelta(days=6, hours=23) < delta <= timedelta(days=INVITE_EXPIRY_DAYS)


# ---------------------------------------------------------------------------
# TestGetByCode
# ---------------------------------------------------------------------------


class TestGetByCode:
    async def test_returns_invite_when_found(self):
        repo, db = _make_repo()
        invite = _make_invite()
        db.execute.return_value.scalar_one_or_none = MagicMock(return_value=invite)

        result = await repo.get_by_code("abc123")
        assert result is invite

    async def test_returns_none_when_not_found(self):
        repo, db = _make_repo()
        db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

        result = await repo.get_by_code("nonexistent")
        assert result is None


# ---------------------------------------------------------------------------
# TestGetPendingByWorkspace
# ---------------------------------------------------------------------------


class TestGetPendingByWorkspace:
    async def test_returns_list_of_pending_invites(self):
        repo, db = _make_repo()
        invites = [_make_invite("inv-1"), _make_invite("inv-2")]
        db.execute.return_value.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=invites)))

        result = await repo.get_pending_by_workspace("ws-1")
        assert len(result) == 2

    async def test_returns_empty_list_when_none(self):
        repo, db = _make_repo()
        db.execute.return_value.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))

        result = await repo.get_pending_by_workspace("ws-1")
        assert result == []


# ---------------------------------------------------------------------------
# TestMarkUsed
# ---------------------------------------------------------------------------


class TestMarkUsed:
    async def test_sets_is_used_used_by_and_used_at(self):
        repo, db = _make_repo()
        invite = _make_invite()

        await repo.mark_used(invite, "accepting-user-id")

        assert invite.is_used is True
        assert invite.used_by == "accepting-user-id"
        assert invite.used_at is not None
        db.commit.assert_awaited_once()

    async def test_used_at_is_timezone_aware(self):
        repo, db = _make_repo()
        invite = _make_invite()

        await repo.mark_used(invite, "user-id")

        assert invite.used_at.tzinfo is not None


# ---------------------------------------------------------------------------
# TestRevoke
# ---------------------------------------------------------------------------


class TestRevoke:
    async def test_sets_is_used_true_without_used_by(self):
        repo, db = _make_repo()
        invite = _make_invite()

        await repo.revoke(invite)

        assert invite.is_used is True
        assert invite.used_by is None
        assert invite.used_at is None
        db.commit.assert_awaited_once()
