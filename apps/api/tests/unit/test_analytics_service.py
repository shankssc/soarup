# apps/api/tests/unit/test_analytics_service.py
# Unit tests for analytics_service.py pure helper functions.
#
# _intensity, _build_heatmap, and _calculate_streak are pure functions
# with no DB access — tested directly without fixtures or asyncio.
#
# AnalyticsService integration tests (get_personal_analytics,
# get_team_analytics) use mocked repos following the _make_service pattern
# from test_update_service_batch.py.

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.analytics_service import (
    AnalyticsService,
    _build_heatmap,
    _calculate_streak,
    _intensity,
)

# ===========================================================================
# _intensity — pure, synchronous, no fixtures needed
# ===========================================================================


class TestIntensity:
    def test_zero_count_returns_zero(self):
        assert _intensity(0, 10) == 0

    def test_any_submission_with_max_one_returns_three(self):
        assert _intensity(1, 1) == 3

    def test_low_ratio_returns_one(self):
        # 1/10 = 10% < 33%
        assert _intensity(1, 10) == 1

    def test_mid_ratio_returns_two(self):
        # 5/10 = 50%, between 33% and 67%
        assert _intensity(5, 10) == 2

    def test_high_ratio_returns_three(self):
        # 8/10 = 80% >= 67%
        assert _intensity(8, 10) == 3

    def test_boundary_exactly_33_percent_is_two(self):
        # 33/100 = 0.33 — not < 0.33, so returns 2
        assert _intensity(33, 100) == 2

    def test_boundary_exactly_67_percent_is_three(self):
        # 67/100 = 0.67 — not < 0.67, so returns 3
        assert _intensity(67, 100) == 3


# ===========================================================================
# _build_heatmap — pure, synchronous
# ===========================================================================


class TestBuildHeatmap:
    def test_covers_every_day_in_range(self):
        from_date = date(2026, 6, 1)
        to_date = date(2026, 6, 7)
        result = _build_heatmap({}, from_date, to_date)
        assert len(result) == 7

    def test_missing_days_have_count_zero_intensity_zero(self):
        from_date = date(2026, 6, 1)
        to_date = date(2026, 6, 3)
        result = _build_heatmap({"2026-06-02": 1}, from_date, to_date)
        by_date = {d.date: d for d in result}
        assert by_date["2026-06-01"].count == 0
        assert by_date["2026-06-01"].intensity == 0
        assert by_date["2026-06-03"].count == 0
        assert by_date["2026-06-03"].intensity == 0

    def test_submission_day_has_nonzero_intensity(self):
        from_date = date(2026, 6, 1)
        to_date = date(2026, 6, 1)
        result = _build_heatmap({"2026-06-01": 1}, from_date, to_date)
        assert result[0].intensity > 0

    def test_dates_are_iso_strings(self):
        from_date = date(2026, 6, 1)
        to_date = date(2026, 6, 1)
        result = _build_heatmap({}, from_date, to_date)
        assert result[0].date == "2026-06-01"

    def test_single_submission_gets_max_intensity(self):
        # max_count == 1, so _intensity(1, 1) == 3
        from_date = date(2026, 6, 1)
        to_date = date(2026, 6, 1)
        result = _build_heatmap({"2026-06-01": 1}, from_date, to_date)
        assert result[0].intensity == 3

    def test_52_weeks_produces_364_days(self):
        today = date.today()
        from_date = today - timedelta(weeks=52)
        result = _build_heatmap({}, from_date, today)
        assert len(result) == (today - from_date).days + 1


# ===========================================================================
# _calculate_streak — pure, synchronous
# ===========================================================================


class TestCalculateStreak:
    def test_consecutive_days_returns_correct_streak(self):
        today = date.today()
        dates = [(today - timedelta(days=i)).isoformat() for i in range(5)]
        current, best = _calculate_streak(dates, None)
        assert current == 5
        assert best == 5

    def test_gap_breaks_current_streak_but_best_preserved(self):
        today = date.today()
        # Today + yesterday = current 2; gap at day 2; days 3-5 = run of 3
        dates = [
            today.isoformat(),
            (today - timedelta(days=1)).isoformat(),
            # day 2 missing — gap
            (today - timedelta(days=3)).isoformat(),
            (today - timedelta(days=4)).isoformat(),
            (today - timedelta(days=5)).isoformat(),
        ]
        current, best = _calculate_streak(dates, None)
        assert current == 2
        assert best == 3

    def test_no_submissions_returns_zero_zero(self):
        current, best = _calculate_streak([], None)
        assert current == 0
        assert best == 0

    def test_digest_days_none_uses_all_calendar_days(self):
        today = date.today()
        dates = [(today - timedelta(days=i)).isoformat() for i in range(7)]
        current, best = _calculate_streak(dates, None)
        assert current == 7

    def test_digest_days_empty_list_uses_all_calendar_days(self):
        today = date.today()
        dates = [(today - timedelta(days=i)).isoformat() for i in range(3)]
        current, best = _calculate_streak(dates, [])
        assert current == 3

    def test_best_streak_found_in_past_not_current(self):
        today = date.today()
        # Current run: 2 days
        current_run = [
            today.isoformat(), (today - timedelta(days=1)).isoformat()]
        # Past run of 10 starting 30 days ago
        past_run = [(today - timedelta(days=30 + i)).isoformat()
                    for i in range(10)]
        dates = current_run + past_run

        current, best = _calculate_streak(dates, None)
        assert current == 2
        assert best == 10

    def test_single_submission_today_returns_one_one(self):
        today = date.today()
        current, best = _calculate_streak([today.isoformat()], None)
        assert current == 1
        assert best == 1

    def test_saturday_does_not_break_monday_friday_streak(self):
        """
        Mon-Fri workspace. User submits Mon-Fri for two consecutive weeks.
        Today is Saturday. Current streak should be 10 (Friday's submission
        is the most recent counting day and it has a submission).
        """
        dates = [
            "2026-06-19",  # Friday week 2
            "2026-06-18",  # Thursday week 2
            "2026-06-17",  # Wednesday week 2
            "2026-06-16",  # Tuesday week 2
            "2026-06-15",  # Monday week 2
            "2026-06-12",  # Friday week 1
            "2026-06-11",  # Thursday week 1
            "2026-06-10",  # Wednesday week 1
            "2026-06-09",  # Tuesday week 1
            "2026-06-08",  # Monday week 1
        ]
        digest_days = [1, 2, 3, 4, 5]  # Mon-Fri
        saturday = date(2026, 6, 20)

        current, best = _calculate_streak(dates, digest_days, today=saturday)

        assert current == 10
        assert best == 10

    def test_gap_on_counting_day_breaks_streak(self):
        """Missing a configured digest day resets current streak to 0."""
        dates = [
            "2026-06-19",  # Friday — submission
            # Thursday missing — gap
            "2026-06-17",  # Wednesday — submission
        ]
        digest_days = [1, 2, 3, 4, 5]
        friday = date(2026, 6, 19)

        current, best = _calculate_streak(dates, digest_days, today=friday)

        assert current == 1
        assert best == 1

# ===========================================================================
# AnalyticsService — mocked repos
# ===========================================================================


def _make_service():
    """Return (service, mock_analytics_repo, mock_workspace_repo)."""
    db = MagicMock()
    service = AnalyticsService(db)

    analytics_repo = MagicMock()
    workspace_repo = MagicMock()

    # Patch internal repo instantiation
    service._analytics_repo = analytics_repo
    service._workspace_repo = workspace_repo

    return service, analytics_repo, workspace_repo


def _fake_workspace(digest_enabled: bool = False, digest_days: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        id="ws-1",
        digest_enabled=digest_enabled,
        digest_days=digest_days,
    )


def _fake_member(user_id: str, role: str = "member") -> SimpleNamespace:
    return SimpleNamespace(user_id=user_id, role=role)


def _fake_profile(user_id: str, name: str = "Test User") -> SimpleNamespace:
    return SimpleNamespace(id=user_id, full_name=name, avatar_url=None)


class TestGetPersonalAnalytics:
    @pytest.mark.asyncio
    async def test_returns_streak_and_heatmap(self):
        from app.repositories.analytics_repo import AnalyticsRepository
        from app.repositories.workspace_repo import WorkspaceRepository

        db = MagicMock()
        service = AnalyticsService(db)

        analytics_repo = MagicMock()
        workspace_repo = MagicMock()

        analytics_repo.get_user_submission_dates = AsyncMock(
            return_value=[
                date.today().isoformat(),
                (date.today() - timedelta(days=1)).isoformat(),
            ]
        )
        workspace_repo.get_by_id = AsyncMock(return_value=_fake_workspace())

        with (
            pytest.MonkeyPatch().context() as mp,
        ):
            mp.setattr(AnalyticsRepository, "from_session", lambda db: analytics_repo)  # Noqa: ARG005
            mp.setattr(WorkspaceRepository, "from_session", lambda db: workspace_repo)  # Noqa: ARG005

            result = await service.get_personal_analytics(
                workspace_id="ws-1",
                user_id="user-1",
            )

        assert result.streak.current_streak == 2
        assert result.streak.best_streak == 2
        assert result.streak.total_submissions == 2
        assert len(result.heatmap) > 0

    @pytest.mark.asyncio
    async def test_streak_is_zero_with_no_submissions(self):
        from app.repositories.analytics_repo import AnalyticsRepository
        from app.repositories.workspace_repo import WorkspaceRepository

        db = MagicMock()
        service = AnalyticsService(db)

        analytics_repo = MagicMock()
        workspace_repo = MagicMock()
        analytics_repo.get_user_submission_dates = AsyncMock(return_value=[])
        workspace_repo.get_by_id = AsyncMock(return_value=_fake_workspace())

        with pytest.MonkeyPatch().context() as mp:
            mp.setattr(AnalyticsRepository, "from_session", lambda db: analytics_repo)  # Noqa: ARG005
            mp.setattr(WorkspaceRepository, "from_session", lambda db: workspace_repo)  # Noqa: ARG005

            result = await service.get_personal_analytics(
                workspace_id="ws-1",
                user_id="user-1",
            )

        assert result.streak.current_streak == 0
        assert result.streak.best_streak == 0
        assert result.streak.total_submissions == 0


class TestGetTeamAnalytics:
    @pytest.mark.asyncio
    async def test_participation_rate_calculation(self):
        from app.repositories.analytics_repo import AnalyticsRepository
        from app.repositories.workspace_repo import WorkspaceRepository

        db = MagicMock()
        service = AnalyticsService(db)

        analytics_repo = MagicMock()
        workspace_repo = MagicMock()

        # Two members: one submitted every day in last 30d, one submitted nothing
        today = date.today()
        all_30_days = [(today - timedelta(days=i)).isoformat()
                       for i in range(30)]

        workspace_repo.get_workspace_members_with_profiles = AsyncMock(
            return_value=[
                (_fake_member("user-1"), _fake_profile("user-1", "Alice")),
                (_fake_member("user-2"), _fake_profile("user-2", "Bob")),
            ]
        )
        workspace_repo.get_by_id = AsyncMock(return_value=_fake_workspace())
        analytics_repo.get_workspace_total_updates = AsyncMock(return_value=30)
        analytics_repo.get_workspace_daily_counts = AsyncMock(return_value={})
        analytics_repo.get_user_submission_dates = AsyncMock(
            side_effect=[all_30_days, []]  # Alice submitted all 30, Bob none
        )
        analytics_repo.get_member_submission_counts = AsyncMock(
            return_value={})

        with pytest.MonkeyPatch().context() as mp:
            mp.setattr(AnalyticsRepository, "from_session", lambda db: analytics_repo)  # Noqa: ARG005
            mp.setattr(WorkspaceRepository, "from_session", lambda db: workspace_repo)  # Noqa: ARG005

            result = await service.get_team_analytics(workspace_id="ws-1")

        # Alice = 100%, Bob = 0% → average = 50%
        assert result.participation_rate_30d == pytest.approx(0.5, abs=0.01)
        assert result.active_member_count == 2

    @pytest.mark.asyncio
    async def test_sparkline_length_is_14(self):
        from app.repositories.analytics_repo import AnalyticsRepository
        from app.repositories.workspace_repo import WorkspaceRepository

        db = MagicMock()
        service = AnalyticsService(db)

        analytics_repo = MagicMock()
        workspace_repo = MagicMock()

        workspace_repo.get_workspace_members_with_profiles = AsyncMock(
            return_value=[
                (_fake_member("user-1"), _fake_profile("user-1")),
            ]
        )
        workspace_repo.get_by_id = AsyncMock(return_value=_fake_workspace())
        analytics_repo.get_workspace_total_updates = AsyncMock(return_value=0)
        analytics_repo.get_workspace_daily_counts = AsyncMock(return_value={})
        analytics_repo.get_user_submission_dates = AsyncMock(return_value=[])
        analytics_repo.get_member_submission_counts = AsyncMock(
            return_value={})

        with pytest.MonkeyPatch().context() as mp:
            mp.setattr(AnalyticsRepository, "from_session", lambda db: analytics_repo)  # Noqa: ARG005
            mp.setattr(WorkspaceRepository, "from_session", lambda db: workspace_repo)  # Noqa: ARG005

            result = await service.get_team_analytics(workspace_id="ws-1")

        assert len(result.members[0].sparkline) == 14
