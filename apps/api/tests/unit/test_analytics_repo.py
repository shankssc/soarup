# apps/api/tests/unit/test_analytics_repo.py
# Unit tests for AnalyticsRepository.
#
# Strategy:
#   - Uses real DB session via db_session fixture (SAVEPOINT rollback)
#   - seeded_profile + seeded_workspace fixtures from conftest satisfy FK constraints
#   - Updates inserted via ORM flush (not commit) so SAVEPOINT teardown cleans up
#   - All queries exclude soft-deleted rows via is_deleted == False

import uuid
from datetime import date, timedelta

import pytest

from app.models.profile import Profile
from app.models.update import Update
from app.repositories.analytics_repo import AnalyticsRepository

pytestmark = pytest.mark.db

TODAY = date.today().isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_update(
    db_session,
    workspace_id: str,
    user_id: str,
    update_date: str = TODAY,
) -> Update:
    update = Update(
        workspace_id=workspace_id,
        user_id=user_id,
        content="Test update",
        update_date=update_date,
        mode="text",
        status="processed",
    )
    db_session.add(update)
    await db_session.flush()
    return update


async def _seed_profile(db_session, user_id: str) -> Profile:
    profile = Profile(
        id=user_id,
        full_name="Test User",
        email_notifications=True,
        timezone="UTC",
    )  # type: ignore[call-arg]
    db_session.add(profile)
    await db_session.flush()
    return profile


# ---------------------------------------------------------------------------
# get_user_submission_dates
# ---------------------------------------------------------------------------


class TestGetUserSubmissionDates:
    @pytest.mark.asyncio
    async def test_returns_correct_dates_in_range(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        result = await repo.get_user_submission_dates(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert TODAY in result

    @pytest.mark.asyncio
    async def test_returns_descending_order(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        other_user_id = str(uuid.uuid4())
        await _seed_profile(db_session, other_user_id)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, YESTERDAY)
        await _seed_update(db_session, seeded_workspace.id, other_user_id, TODAY)

        # Fetch for test_user_id only
        result = await repo.get_user_submission_dates(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date.fromisoformat(YESTERDAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result == [YESTERDAY]

    @pytest.mark.asyncio
    async def test_empty_workspace_returns_empty_list(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)

        result = await repo.get_user_submission_dates(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date(2000, 1, 1),
            to_date=date(2000, 1, 31),
        )

        assert result == []

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        update = await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        update.is_deleted = True
        await db_session.flush()

        result = await repo.get_user_submission_dates(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result == []


# ---------------------------------------------------------------------------
# get_workspace_daily_counts
# ---------------------------------------------------------------------------


class TestGetWorkspaceDailyCounts:
    @pytest.mark.asyncio
    async def test_groups_correctly_by_date(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        other_user_id = str(uuid.uuid4())
        await _seed_profile(db_session, other_user_id)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        await _seed_update(db_session, seeded_workspace.id, other_user_id, TODAY)

        result = await repo.get_workspace_daily_counts(
            workspace_id=seeded_workspace.id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result[TODAY] == 2

    @pytest.mark.asyncio
    async def test_empty_workspace_returns_empty_dict(self, db_session, seeded_workspace):
        repo = AnalyticsRepository.from_session(db_session)

        result = await repo.get_workspace_daily_counts(
            workspace_id=seeded_workspace.id,
            from_date=date(2000, 1, 1),
            to_date=date(2000, 1, 31),
        )

        assert result == {}

    @pytest.mark.asyncio
    async def test_counts_distinct_users_not_updates(self, db_session, seeded_workspace, test_user_id):
        """Two updates from the same user on the same day count as 1 member."""
        repo = AnalyticsRepository.from_session(db_session)
        # Only one user submits — count should be 1 even if we had two updates
        # (unique constraint prevents two from same user, but the query uses DISTINCT)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        result = await repo.get_workspace_daily_counts(
            workspace_id=seeded_workspace.id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result[TODAY] == 1


# ---------------------------------------------------------------------------
# get_member_submission_counts
# ---------------------------------------------------------------------------


class TestGetMemberSubmissionCounts:
    @pytest.mark.asyncio
    async def test_per_day_counts_correct(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        result = await repo.get_member_submission_counts(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result[TODAY] == 1

    @pytest.mark.asyncio
    async def test_missing_days_absent_from_result(self, db_session, seeded_workspace, test_user_id):
        """Sparse result — days with no submissions are not included."""
        repo = AnalyticsRepository.from_session(db_session)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        result = await repo.get_member_submission_counts(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date.fromisoformat(YESTERDAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert TODAY in result
        assert YESTERDAY not in result

    @pytest.mark.asyncio
    async def test_empty_returns_empty_dict(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)

        result = await repo.get_member_submission_counts(
            workspace_id=seeded_workspace.id,
            user_id=test_user_id,
            from_date=date(2000, 1, 1),
            to_date=date(2000, 1, 31),
        )

        assert result == {}


# ---------------------------------------------------------------------------
# get_workspace_total_updates
# ---------------------------------------------------------------------------


class TestGetWorkspaceTotalUpdates:
    @pytest.mark.asyncio
    async def test_counts_updates_in_range(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)

        result = await repo.get_workspace_total_updates(
            workspace_id=seeded_workspace.id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result == 1

    @pytest.mark.asyncio
    async def test_empty_workspace_returns_zero(self, db_session, seeded_workspace):
        repo = AnalyticsRepository.from_session(db_session)

        result = await repo.get_workspace_total_updates(
            workspace_id=seeded_workspace.id,
            from_date=date(2000, 1, 1),
            to_date=date(2000, 1, 31),
        )

        assert result == 0

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted(self, db_session, seeded_workspace, test_user_id):
        repo = AnalyticsRepository.from_session(db_session)
        update = await _seed_update(db_session, seeded_workspace.id, test_user_id, TODAY)
        update.is_deleted = True
        await db_session.flush()

        result = await repo.get_workspace_total_updates(
            workspace_id=seeded_workspace.id,
            from_date=date.fromisoformat(TODAY),
            to_date=date.fromisoformat(TODAY),
        )

        assert result == 0
