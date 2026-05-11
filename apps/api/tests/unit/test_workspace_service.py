# apps/api/tests/unit/test_workspace_service.py
# Unit tests for WorkspaceService
#
# Strategy:
#   WorkspaceService has two repo dependencies — WorkspaceRepository and
#   ProfileRepository — plus direct calls to db.commit() and db.refresh().
#   We inject mock repos directly onto the service instance and mock the
#   db session methods to avoid any real DB calls.
#
#   Covered:
#   - create_workspace: slug taken, success, race condition (IntegrityError),
#     rollback on profile update failure
#   - join_workspace: always raises invalid_invite_code (stub)
#   - get_user_workspaces: returns list, empty list, fetch failure

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.schemas.workspace import CreateWorkspaceRequest
from app.services.workspace_service import WorkspaceError, WorkspaceService

# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def _make_service() -> tuple[WorkspaceService, MagicMock, MagicMock, MagicMock]:
    """
    Return (service, mock_db, mock_workspace_repo, mock_profile_repo).
    db.commit and db.refresh are pre-configured as AsyncMocks since
    the service calls them directly (not via repos).
    """
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()

    service = WorkspaceService(db_session=db)

    workspace_repo = MagicMock()
    profile_repo = MagicMock()

    # Inject directly — bypasses lazy-init
    service._workspace_repo = workspace_repo
    service._profile_repo = profile_repo

    return service, db, workspace_repo, profile_repo


def _mock_workspace(
    workspace_id: str = "ws-123",
    name: str = "My Team",
    slug: str = "my-team",
    owner_id: str = "user-abc",
    plan: str = "free",
    created_at: datetime | None = None,
) -> SimpleNamespace:
    """SimpleNamespace workspace — avoids MagicMock attribute interception."""
    return SimpleNamespace(
        id=workspace_id,
        name=name,
        slug=slug,
        owner_id=owner_id,
        plan=plan,
        created_at=created_at or datetime.now(UTC),
    )


def _mock_member(
    member_id: str = "mem-123",
    workspace_id: str = "ws-123",
    user_id: str = "user-abc",
    role: str = "owner",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=member_id,
        workspace_id=workspace_id,
        user_id=user_id,
        role=role,
        joined_at=datetime.now(UTC),
    )


# ---------------------------------------------------------------------------
# create_workspace()
# ---------------------------------------------------------------------------


class TestCreateWorkspace:
    @pytest.mark.asyncio
    async def test_slug_taken_raises_slug_already_taken(self):
        """slug_exists returns True → WorkspaceError with slug_already_taken."""
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.slug_exists = AsyncMock(return_value=True)

        with pytest.raises(WorkspaceError) as exc_info:
            await service.create_workspace(
                "user-abc",
                CreateWorkspaceRequest(name="My Team", slug="taken-slug"),
            )

        assert exc_info.value.error_code == "slug_already_taken"
        assert "taken-slug" in exc_info.value.message

    @pytest.mark.asyncio
    async def test_slug_taken_includes_slug_in_details(self):
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.slug_exists = AsyncMock(return_value=True)

        with pytest.raises(WorkspaceError) as exc_info:
            await service.create_workspace(
                "user-abc",
                CreateWorkspaceRequest(name="My Team", slug="taken-slug"),
            )

        assert exc_info.value.details is not None
        assert exc_info.value.details["slug"] == "taken-slug"

    @pytest.mark.asyncio
    async def test_success_returns_workspace_response(self):
        """Happy path: workspace created, member added, is_onboarded set."""
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock(return_value=MagicMock())

        result = await service.create_workspace(
            "user-abc",
            CreateWorkspaceRequest(name="My Team", slug="my-team"),
        )

        assert result.slug == "my-team"
        assert result.owner_id == "user-abc"
        assert result.plan == "free"
        assert result.id == "ws-123"

    @pytest.mark.asyncio
    async def test_success_commits_transaction(self):
        """All writes commit in a single transaction."""
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock()

        await service.create_workspace(
            "user-abc",
            CreateWorkspaceRequest(name="My Team", slug="my-team"),
        )

        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_success_sets_is_onboarded_true(self):
        """profile_repo.update is called with is_onboarded=True."""
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock()

        await service.create_workspace(
            "user-abc",
            CreateWorkspaceRequest(name="My Team", slug="my-team"),
        )

        profile_repo.update.assert_awaited_once_with("user-abc", {"is_onboarded": True})

    @pytest.mark.asyncio
    async def test_success_adds_creator_as_owner(self):
        """add_member is called with role='owner' for the creating user."""
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock()

        await service.create_workspace(
            "user-abc",
            CreateWorkspaceRequest(name="My Team", slug="my-team"),
        )

        workspace_repo.add_member.assert_awaited_once_with(
            workspace_id="ws-123",
            user_id="user-abc",
            role="owner",
            invited_by=None,
        )

    @pytest.mark.asyncio
    async def test_race_condition_integrity_error_raises_slug_already_taken(self):
        """
        slug_exists returns False but INSERT raises IntegrityError (race condition).
        Service catches it and raises WorkspaceError with slug_already_taken.
        """
        service, db, workspace_repo, profile_repo = _make_service()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(side_effect=IntegrityError("duplicate key", {}, Exception()))

        with pytest.raises(WorkspaceError) as exc_info:
            await service.create_workspace(
                "user-abc",
                CreateWorkspaceRequest(name="My Team", slug="my-team"),
            )

        assert exc_info.value.error_code == "slug_already_taken"

    @pytest.mark.asyncio
    async def test_race_condition_rolls_back(self):
        """IntegrityError triggers a rollback."""
        service, db, workspace_repo, _ = _make_service()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(side_effect=IntegrityError("duplicate key", {}, Exception()))

        with pytest.raises(WorkspaceError):
            await service.create_workspace(
                "user-abc",
                CreateWorkspaceRequest(name="My Team", slug="my-team"),
            )

        db.rollback.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_profile_update_failure_raises_create_failed(self):
        """If profile.update raises, the whole transaction rolls back."""
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock(side_effect=Exception("DB connection lost"))

        with pytest.raises(WorkspaceError) as exc_info:
            await service.create_workspace(
                "user-abc",
                CreateWorkspaceRequest(name="My Team", slug="my-team"),
            )

        assert exc_info.value.error_code == "create_failed"

    @pytest.mark.asyncio
    async def test_profile_update_failure_rolls_back(self):
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock(side_effect=Exception("DB connection lost"))

        with pytest.raises(WorkspaceError):
            await service.create_workspace(
                "user-abc",
                CreateWorkspaceRequest(name="My Team", slug="my-team"),
            )

        db.rollback.assert_awaited_once()
        db.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_create_workspace_passes_correct_args_to_repo(self):
        """workspace_repo.create is called with the right owner_id, name, slug."""
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace()

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock()

        await service.create_workspace(
            "user-xyz",
            CreateWorkspaceRequest(name="Different Team", slug="diff-team"),
        )

        workspace_repo.create.assert_awaited_once_with(
            owner_id="user-xyz",
            name="Different Team",
            slug="diff-team",
        )

    @pytest.mark.asyncio
    async def test_workspace_response_has_correct_name(self):
        service, db, workspace_repo, profile_repo = _make_service()
        workspace = _mock_workspace(name="Specific Name", slug="specific-slug")

        workspace_repo.slug_exists = AsyncMock(return_value=False)
        workspace_repo.create = AsyncMock(return_value=workspace)
        workspace_repo.add_member = AsyncMock(return_value=_mock_member())
        profile_repo.update = AsyncMock()

        result = await service.create_workspace(
            "user-abc",
            CreateWorkspaceRequest(name="Specific Name", slug="specific-slug"),
        )

        assert result.name == "Specific Name"


# ---------------------------------------------------------------------------
# join_workspace()
# ---------------------------------------------------------------------------


class TestJoinWorkspace:
    @pytest.mark.asyncio
    async def test_always_raises_invalid_invite_code(self):
        """join_workspace is a stub — always raises invalid_invite_code."""
        service, _, _, _ = _make_service()

        with pytest.raises(WorkspaceError) as exc_info:
            await service.join_workspace("user-abc", "any-invite-code")

        assert exc_info.value.error_code == "invalid_invite_code"

    @pytest.mark.asyncio
    async def test_invalid_invite_code_has_message(self):
        service, _, _, _ = _make_service()

        with pytest.raises(WorkspaceError) as exc_info:
            await service.join_workspace("user-abc", "any-code")

        assert exc_info.value.message  # non-empty

    @pytest.mark.asyncio
    async def test_invalid_invite_code_includes_hint_in_details(self):
        """Details should hint that invites aren't enabled yet."""
        service, _, _, _ = _make_service()

        with pytest.raises(WorkspaceError) as exc_info:
            await service.join_workspace("user-abc", "any-code")

        assert exc_info.value.details is not None
        assert "hint" in exc_info.value.details

    @pytest.mark.asyncio
    async def test_never_calls_repo(self):
        """Stub should not touch any repo — reject immediately."""
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_by_slug = AsyncMock()

        with pytest.raises(WorkspaceError):
            await service.join_workspace("user-abc", "code")

        workspace_repo.get_by_slug.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_never_commits(self):
        """Stub must not commit anything."""
        service, db, _, _ = _make_service()

        with pytest.raises(WorkspaceError):
            await service.join_workspace("user-abc", "code")

        db.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# get_user_workspaces()
# ---------------------------------------------------------------------------


class TestGetUserWorkspaces:
    @pytest.mark.asyncio
    async def test_returns_workspace_list_response(self):
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_user_workspaces = AsyncMock(return_value=[_mock_workspace()])

        result = await service.get_user_workspaces("user-abc")

        assert len(result.data) == 1
        assert result.data[0].slug == "my-team"

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_workspaces(self):
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_user_workspaces = AsyncMock(return_value=[])

        result = await service.get_user_workspaces("user-abc")

        assert result.data == []

    @pytest.mark.asyncio
    async def test_maps_workspace_fields_correctly(self):
        """Each workspace in the list has correct field values."""
        service, _, workspace_repo, _ = _make_service()
        now = datetime.now(UTC)
        workspace_repo.get_user_workspaces = AsyncMock(
            return_value=[
                _mock_workspace(
                    workspace_id="ws-999",
                    name="Mapped Team",
                    slug="mapped-team",
                    owner_id="owner-xyz",
                    plan="free",
                    created_at=now,
                )
            ]
        )

        result = await service.get_user_workspaces("owner-xyz")

        ws = result.data[0]
        assert ws.id == "ws-999"
        assert ws.name == "Mapped Team"
        assert ws.slug == "mapped-team"
        assert ws.owner_id == "owner-xyz"
        assert ws.plan == "free"

    @pytest.mark.asyncio
    async def test_multiple_workspaces_returned(self):
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_user_workspaces = AsyncMock(
            return_value=[
                _mock_workspace(workspace_id="ws-1", slug="team-a"),
                _mock_workspace(workspace_id="ws-2", slug="team-b"),
            ]
        )

        result = await service.get_user_workspaces("user-abc")

        assert len(result.data) == 2
        slugs = {ws.slug for ws in result.data}
        assert "team-a" in slugs
        assert "team-b" in slugs

    @pytest.mark.asyncio
    async def test_calls_repo_with_user_id(self):
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_user_workspaces = AsyncMock(return_value=[])

        await service.get_user_workspaces("specific-user-id")

        workspace_repo.get_user_workspaces.assert_awaited_once_with("specific-user-id")

    @pytest.mark.asyncio
    async def test_repo_failure_raises_workspace_error(self):
        """DB failure is caught and mapped to fetch_failed WorkspaceError."""
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_user_workspaces = AsyncMock(side_effect=Exception("connection timeout"))

        with pytest.raises(WorkspaceError) as exc_info:
            await service.get_user_workspaces("user-abc")

        assert exc_info.value.error_code == "fetch_failed"

    @pytest.mark.asyncio
    async def test_repo_failure_does_not_leak_db_details(self):
        """Error message exposed to caller is generic — no internal DB details."""
        service, _, workspace_repo, _ = _make_service()
        workspace_repo.get_user_workspaces = AsyncMock(side_effect=Exception("sensitive internal error"))

        with pytest.raises(WorkspaceError) as exc_info:
            await service.get_user_workspaces("user-abc")

        assert "sensitive" not in exc_info.value.message
        assert "internal" not in exc_info.value.message.lower()
