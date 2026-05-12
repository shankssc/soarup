# apps/api/tests/unit/test_workspace_repo.py
# Unit tests for WorkspaceRepository
#
# Strategy:
#   These tests use a real DB session (soarup_test via Supabase local Postgres)
#   with SAVEPOINT isolation — every test rolls back on teardown so there is
#   no test data leakage between runs.
#
#   All tests depend on `seeded_profile` which inserts a Profile row for
#   `test_user_id` within the SAVEPOINT, satisfying the workspace FK constraint.
#
#   WorkspaceRepository uses flush() not commit() — the service owns the
#   transaction boundary. Tests call flush() and assert on the returned
#   objects; the SAVEPOINT rollback cleans up.
#
# Prerequisites:
#   - `supabase start` running (Postgres on port 54322)
#   - `soarup_test` database exists
#   - `alembic upgrade head` applied against soarup_test

from app.repositories.workspace_repo import WorkspaceRepository
from sqlalchemy.exc import IntegrityError
import pytest

pytestmark = pytest.mark.db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_workspace(
    workspace_repo: WorkspaceRepository,
    owner_id: str,
    name: str = "Test Workspace",
    slug: str = "test-workspace",
) -> object:
    """Create a workspace and flush — helper to reduce repetition."""
    return await workspace_repo.create(
        owner_id=owner_id,
        name=name,
        slug=slug,
    )


# ---------------------------------------------------------------------------
# create()
# ---------------------------------------------------------------------------


class TestCreate:
    @pytest.mark.asyncio
    async def test_create_returns_workspace(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        assert workspace.id is not None
        assert workspace.slug == "test-workspace"
        assert workspace.name == "Test Workspace"
        assert workspace.owner_id == test_user_id

    @pytest.mark.asyncio
    async def test_create_defaults_plan_to_free(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        assert workspace.plan == "free"

    @pytest.mark.asyncio
    async def test_create_generates_uuid(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        assert workspace.id is not None
        assert len(workspace.id) == 36  # UUID format

    @pytest.mark.asyncio
    async def test_create_sets_created_at(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        assert workspace.created_at is not None

    @pytest.mark.asyncio
    async def test_create_duplicate_slug_raises_integrity_error(self, workspace_repo, seeded_profile, test_user_id):
        """Second workspace with same slug violates unique constraint."""
        await _create_workspace(workspace_repo, test_user_id, slug="unique-slug")

        with pytest.raises(IntegrityError):
            await _create_workspace(workspace_repo, test_user_id, slug="unique-slug")

    @pytest.mark.asyncio
    async def test_create_different_slugs_succeed(self, workspace_repo, seeded_profile, test_user_id):
        """Two workspaces with different slugs can coexist."""
        ws1 = await _create_workspace(workspace_repo, test_user_id, slug="slug-one")
        ws2 = await _create_workspace(workspace_repo, test_user_id, slug="slug-two")

        assert ws1.slug == "slug-one"
        assert ws2.slug == "slug-two"
        assert ws1.id != ws2.id


# ---------------------------------------------------------------------------
# get_by_id()
# ---------------------------------------------------------------------------


class TestGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_workspace(self, workspace_repo, seeded_profile, test_user_id):
        created = await _create_workspace(workspace_repo, test_user_id)

        found = await workspace_repo.get_by_id(created.id)

        assert found is not None
        assert found.id == created.id
        assert found.slug == created.slug

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_when_missing(self, workspace_repo, seeded_profile):
        result = await workspace_repo.get_by_id("nonexistent-uuid")

        assert result is None


# ---------------------------------------------------------------------------
# get_by_slug()
# ---------------------------------------------------------------------------


class TestGetBySlug:
    @pytest.mark.asyncio
    async def test_get_by_slug_returns_workspace(self, workspace_repo, seeded_profile, test_user_id):
        await _create_workspace(workspace_repo, test_user_id, slug="findable-slug")

        found = await workspace_repo.get_by_slug("findable-slug")

        assert found is not None
        assert found.slug == "findable-slug"

    @pytest.mark.asyncio
    async def test_get_by_slug_returns_none_when_missing(self, workspace_repo, seeded_profile):
        result = await workspace_repo.get_by_slug("does-not-exist")

        assert result is None


# ---------------------------------------------------------------------------
# slug_exists()
# ---------------------------------------------------------------------------


class TestSlugExists:
    @pytest.mark.asyncio
    async def test_slug_exists_returns_true_when_taken(self, workspace_repo, seeded_profile, test_user_id):
        await _create_workspace(workspace_repo, test_user_id, slug="taken-slug")

        assert await workspace_repo.slug_exists("taken-slug") is True

    @pytest.mark.asyncio
    async def test_slug_exists_returns_false_when_available(self, workspace_repo, seeded_profile):
        assert await workspace_repo.slug_exists("never-used-slug-xyz") is False

    @pytest.mark.asyncio
    async def test_slug_exists_is_exact_match(self, workspace_repo, seeded_profile, test_user_id):
        """Partial slug matches don't count — must be exact."""
        await _create_workspace(workspace_repo, test_user_id, slug="my-team")

        assert await workspace_repo.slug_exists("my") is False
        assert await workspace_repo.slug_exists("my-team-extra") is False
        assert await workspace_repo.slug_exists("my-team") is True


# ---------------------------------------------------------------------------
# add_member()
# ---------------------------------------------------------------------------


class TestAddMember:
    @pytest.mark.asyncio
    async def test_add_member_returns_membership(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        member = await workspace_repo.add_member(
            workspace_id=workspace.id,
            user_id=test_user_id,
            role="owner",
        )

        assert member.id is not None
        assert member.workspace_id == workspace.id
        assert member.user_id == test_user_id
        assert member.role == "owner"

    @pytest.mark.asyncio
    async def test_add_member_sets_joined_at(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        member = await workspace_repo.add_member(
            workspace_id=workspace.id,
            user_id=test_user_id,
            role="member",
        )

        assert member.joined_at is not None

    @pytest.mark.asyncio
    async def test_add_member_invited_by_none_by_default(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        member = await workspace_repo.add_member(
            workspace_id=workspace.id,
            user_id=test_user_id,
            role="owner",
        )

        assert member.invited_by is None

    @pytest.mark.asyncio
    async def test_add_member_duplicate_raises_integrity_error(self, workspace_repo, seeded_profile, test_user_id):
        """Adding the same user to the same workspace twice violates unique constraint."""
        workspace = await _create_workspace(workspace_repo, test_user_id)
        await workspace_repo.add_member(
            workspace_id=workspace.id,
            user_id=test_user_id,
            role="owner",
        )

        with pytest.raises(IntegrityError):
            await workspace_repo.add_member(
                workspace_id=workspace.id,
                user_id=test_user_id,
                role="member",
            )


# ---------------------------------------------------------------------------
# get_member()
# ---------------------------------------------------------------------------


class TestGetMember:
    @pytest.mark.asyncio
    async def test_get_member_returns_membership(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)
        await workspace_repo.add_member(workspace.id, test_user_id, "owner")

        member = await workspace_repo.get_member(workspace.id, test_user_id)

        assert member is not None
        assert member.user_id == test_user_id
        assert member.role == "owner"

    @pytest.mark.asyncio
    async def test_get_member_returns_none_when_not_member(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        result = await workspace_repo.get_member(workspace.id, "nonexistent-user")

        assert result is None


# ---------------------------------------------------------------------------
# get_user_workspaces()
# ---------------------------------------------------------------------------


class TestGetUserWorkspaces:
    @pytest.mark.asyncio
    async def test_returns_workspace_user_is_member_of(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id, slug="my-ws")
        await workspace_repo.add_member(workspace.id, test_user_id, "owner")

        result = await workspace_repo.get_user_workspaces(test_user_id)

        assert len(result) == 1
        assert result[0].slug == "my-ws"

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_memberships(self, workspace_repo, seeded_profile, test_user_id):
        # Create workspace but don't add member
        await _create_workspace(workspace_repo, test_user_id, slug="orphan-ws")

        result = await workspace_repo.get_user_workspaces(test_user_id)

        assert result == []

    @pytest.mark.asyncio
    async def test_returns_empty_list_for_unknown_user(self, workspace_repo, seeded_profile):
        result = await workspace_repo.get_user_workspaces("unknown-user-id")

        assert result == []

    @pytest.mark.asyncio
    async def test_does_not_return_workspaces_user_is_not_member_of(self, workspace_repo, seeded_profile, test_user_id, db_session):
        """
        Workspace exists but user is not a member — should not appear in results.
        Uses a second profile to own a separate workspace.
        """
        import uuid

        from app.models.profile import Profile

        # Create second user + profile
        other_user_id = str(uuid.uuid4())
        other_profile = Profile(
            id=other_user_id,
            full_name="Other User",
            email_notifications=True,
            timezone="UTC",
        )  # type: ignore[call-arg]
        db_session.add(other_profile)
        await db_session.flush()

        # Other user creates a workspace and is a member of it
        other_ws = await _create_workspace(workspace_repo, other_user_id, slug="other-ws")
        await workspace_repo.add_member(other_ws.id, other_user_id, "owner")

        # test_user creates their own workspace and is a member
        my_ws = await _create_workspace(workspace_repo, test_user_id, slug="my-ws-only")
        await workspace_repo.add_member(my_ws.id, test_user_id, "owner")

        result = await workspace_repo.get_user_workspaces(test_user_id)

        slugs = [ws.slug for ws in result]
        assert "my-ws-only" in slugs
        assert "other-ws" not in slugs

    @pytest.mark.asyncio
    async def test_returns_multiple_workspaces(self, workspace_repo, seeded_profile, test_user_id):
        """User member of multiple workspaces sees all of them."""
        ws1 = await _create_workspace(workspace_repo, test_user_id, slug="ws-alpha")
        ws2 = await _create_workspace(workspace_repo, test_user_id, slug="ws-beta")
        await workspace_repo.add_member(ws1.id, test_user_id, "owner")
        await workspace_repo.add_member(ws2.id, test_user_id, "member")

        result = await workspace_repo.get_user_workspaces(test_user_id)

        slugs = [ws.slug for ws in result]
        assert "ws-alpha" in slugs
        assert "ws-beta" in slugs


# ---------------------------------------------------------------------------
# get_workspace_members()
# ---------------------------------------------------------------------------


class TestGetWorkspaceMembers:
    @pytest.mark.asyncio
    async def test_returns_all_members(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)
        await workspace_repo.add_member(workspace.id, test_user_id, "owner")

        members = await workspace_repo.get_workspace_members(workspace.id)

        assert len(members) == 1
        assert members[0].user_id == test_user_id

    @pytest.mark.asyncio
    async def test_returns_empty_list_for_workspace_with_no_members(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        members = await workspace_repo.get_workspace_members(workspace.id)

        assert members == []


# ---------------------------------------------------------------------------
# update()
# ---------------------------------------------------------------------------


class TestUpdate:
    @pytest.mark.asyncio
    async def test_update_name(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id)

        updated = await workspace_repo.update(workspace.id, {"name": "Updated Name"})

        assert updated is not None
        assert updated.name == "Updated Name"

    @pytest.mark.asyncio
    async def test_update_with_empty_dict_returns_unchanged(self, workspace_repo, seeded_profile, test_user_id):
        workspace = await _create_workspace(workspace_repo, test_user_id, name="Original")

        result = await workspace_repo.update(workspace.id, {})

        assert result is not None
        assert result.name == "Original"

    @pytest.mark.asyncio
    async def test_update_nonexistent_returns_none(self, workspace_repo, seeded_profile):
        result = await workspace_repo.update("nonexistent-id", {"name": "Ghost"})

        assert result is None
