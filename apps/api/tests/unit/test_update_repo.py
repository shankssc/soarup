# apps/api/tests/unit/test_update_repo.py
# Unit tests for UpdateRepository against soarup_test DB.
#
# Strategy:
#   - Uses real DB session via db_session fixture (SAVEPOINT rollback)
#   - seeded_profile + seeded_workspace fixtures satisfy FK constraints
#   - UpdateRepository.create() calls db.commit() internally — this commits
#     within the SAVEPOINT so teardown rollback still cleans everything up
#   - All queries exclude soft-deleted records by default
#
# Prerequisites:
#   - supabase start running (Postgres on port 54322)
#   - soarup_test DB exists with alembic upgrade head applied

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.update import Update
from app.repositories.update_repo import UpdateRepository

pytestmark = pytest.mark.db

TODAY = "2026-05-14"
OTHER_DATE = "2026-05-15"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def seeded_workspace(db_session, seeded_profile, test_user_id):
    """
    Insert a Workspace row owned by test_user_id.
    seeded_profile must run first to satisfy the FK on owner_id → profiles.id.
    """
    from app.models.workspace import Workspace

    workspace = Workspace(
        owner_id=test_user_id,
        name="Test Workspace",
        slug=f"test-ws-{test_user_id[:8]}",
        plan="free",
    )  # type: ignore[call-arg]
    db_session.add(workspace)
    await db_session.flush()
    return workspace


@pytest.fixture
async def update_repo(db_session):
    return UpdateRepository.from_session(db_session)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_update(
    db_session,
    workspace_id: str,
    user_id: str,
    update_date: str = TODAY,
    content: str = "Test update",
    mode: str = "text",
) -> Update:
    """Insert an Update row directly via ORM flush — avoids commit() closing the SAVEPOINT."""
    update = Update(
        workspace_id=workspace_id,
        user_id=user_id,
        content=content,
        update_date=update_date,
        mode=mode,
        status="pending",
    )
    db_session.add(update)
    await db_session.flush()
    return update


# ---------------------------------------------------------------------------
# create()
# ---------------------------------------------------------------------------


class TestCreate:
    @pytest.mark.asyncio
    async def test_create_returns_update(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        assert update.id is not None
        assert update.workspace_id == seeded_workspace.id
        assert update.user_id == test_user_id
        assert update.content == "Test update"
        assert update.update_date == TODAY

    @pytest.mark.asyncio
    async def test_create_defaults_status_to_pending(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        assert update.status == "pending"

    @pytest.mark.asyncio
    async def test_create_defaults_mode_to_text(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        assert update.mode == "text"

    @pytest.mark.asyncio
    async def test_create_is_deleted_false_by_default(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        assert update.is_deleted is False

    @pytest.mark.asyncio
    async def test_create_generates_uuid(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        assert len(update.id) == 36  # UUID format

    @pytest.mark.asyncio
    async def test_create_sets_timestamps(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        assert update.created_at is not None
        assert update.updated_at is not None


# ---------------------------------------------------------------------------
# get_by_id()
# ---------------------------------------------------------------------------


class TestGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_update(self, update_repo, db_session, seeded_workspace, test_user_id):
        created = await _create_update(db_session, seeded_workspace.id, test_user_id)

        found = await update_repo.get_by_id(created.id)

        assert found is not None
        assert found.id == created.id
        assert found.content == "Test update"

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_missing(self, update_repo, seeded_workspace):
        result = await update_repo.get_by_id("nonexistent-id")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_by_id_excludes_soft_deleted(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)
        update.is_deleted = True
        await db_session.flush()

        result = await update_repo.get_by_id(update.id)

        assert result is None


# ---------------------------------------------------------------------------
# get_for_user_on_date()
# ---------------------------------------------------------------------------


class TestGetForUserOnDate:
    @pytest.mark.asyncio
    async def test_returns_update_for_matching_date(self, update_repo, db_session, seeded_workspace, test_user_id):
        await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        result = await update_repo.get_for_user_on_date(seeded_workspace.id, test_user_id, TODAY)

        assert result is not None
        assert result.update_date == TODAY
        assert result.user_id == test_user_id

    @pytest.mark.asyncio
    async def test_returns_none_when_no_update_for_date(self, update_repo, seeded_workspace, test_user_id):
        result = await update_repo.get_for_user_on_date(seeded_workspace.id, test_user_id, "2099-01-01")

        assert result is None

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        update.is_deleted = True
        await db_session.flush()

        result = await update_repo.get_for_user_on_date(seeded_workspace.id, test_user_id, TODAY)

        assert result is None


# ---------------------------------------------------------------------------
# get_workspace_updates_for_date()
# ---------------------------------------------------------------------------


class TestGetWorkspaceUpdatesForDate:
    @pytest.mark.asyncio
    async def test_returns_all_updates_for_date(self, update_repo, seeded_workspace, test_user_id, db_session):
        """Two updates for same workspace + date — both returned."""
        import uuid

        from app.models.profile import Profile

        # Create second user
        other_user_id = str(uuid.uuid4())
        other_profile = Profile(
            id=other_user_id,
            full_name="Other User",
            email_notifications=True,
            timezone="UTC",
        )  # type: ignore[call-arg]
        db_session.add(other_profile)
        await db_session.flush()

        await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        await _create_update(db_session, seeded_workspace.id, other_user_id, TODAY)

        results = await update_repo.get_workspace_updates_for_date(seeded_workspace.id, TODAY)

        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_ordered_by_created_at_ascending(self, update_repo, seeded_workspace, test_user_id, db_session):
        """Results ordered ascending by created_at."""
        import uuid

        from app.models.profile import Profile

        other_user_id = str(uuid.uuid4())
        db_session.add(
            Profile(
                id=other_user_id,
                full_name="Other",
                email_notifications=True,
                timezone="UTC",
            )
        )  # type: ignore[call-arg]
        await db_session.flush()

        first = await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY, "first")  # Noqa: F841
        second = await _create_update(db_session, seeded_workspace.id, other_user_id, TODAY, "second")  # Noqa: F841

        results = await update_repo.get_workspace_updates_for_date(seeded_workspace.id, TODAY)

        assert results[0].created_at <= results[1].created_at

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted(self, update_repo, seeded_workspace, test_user_id, db_session):
        import uuid

        from app.models.profile import Profile

        other_user_id = str(uuid.uuid4())
        db_session.add(
            Profile(
                id=other_user_id,
                full_name="Other",
                email_notifications=True,
                timezone="UTC",
            )
        )  # type: ignore[call-arg]
        await db_session.flush()

        update1 = await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        await _create_update(db_session, seeded_workspace.id, other_user_id, TODAY)
        update1.is_deleted = True
        await db_session.flush()

        results = await update_repo.get_workspace_updates_for_date(seeded_workspace.id, TODAY)

        assert len(results) == 1
        assert results[0].user_id == other_user_id

    @pytest.mark.asyncio
    async def test_excludes_other_dates(self, update_repo, seeded_workspace, test_user_id, db_session):
        """Updates on a different date are not returned."""
        import uuid

        from app.models.profile import Profile

        other_user_id = str(uuid.uuid4())
        db_session.add(
            Profile(
                id=other_user_id,
                full_name="Other",
                email_notifications=True,
                timezone="UTC",
            )
        )  # type: ignore[call-arg]
        await db_session.flush()

        await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        await _create_update(db_session, seeded_workspace.id, other_user_id, OTHER_DATE)

        results = await update_repo.get_workspace_updates_for_date(seeded_workspace.id, TODAY)

        assert len(results) == 1
        assert results[0].update_date == TODAY

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_updates(self, update_repo, seeded_workspace):
        results = await update_repo.get_workspace_updates_for_date(seeded_workspace.id, TODAY)

        assert results == []


# ---------------------------------------------------------------------------
# update_content()
# ---------------------------------------------------------------------------


class TestUpdateContent:
    @pytest.mark.asyncio
    async def test_update_content_changes_content(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        update.content = "new content"
        await db_session.flush()
        await db_session.refresh(update)

        assert update.content == "new content"


# ---------------------------------------------------------------------------
# soft_delete()
# ---------------------------------------------------------------------------


class TestSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_delete_hides_from_get_by_id(self, update_repo, db_session, seeded_workspace, test_user_id):
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        update.is_deleted = True
        await db_session.flush()

        result = await update_repo.get_by_id(update.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_soft_delete_sets_is_deleted_flag(self, update_repo, seeded_workspace, test_user_id, db_session):
        """is_deleted flag is set to True on the row."""

        update = await _create_update(db_session, seeded_workspace.id, test_user_id)
        update.is_deleted = True
        await db_session.flush()

        assert update.is_deleted is True


# ---------------------------------------------------------------------------
# duplicate constraint
# ---------------------------------------------------------------------------


class TestDuplicateConstraint:
    @pytest.mark.asyncio
    async def test_duplicate_raises_integrity_error(self, update_repo, db_session, seeded_workspace, test_user_id):
        """
        Two updates with same (workspace_id, user_id, update_date)
        violate the unique constraint.
        """
        await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        with pytest.raises(IntegrityError):
            await _create_update(db_session, seeded_workspace.id, test_user_id, TODAY)
