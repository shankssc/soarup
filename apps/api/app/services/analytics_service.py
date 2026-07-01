# apps/api/app/services/analytics_service.py

from datetime import UTC, date, datetime, timedelta

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.analytics_repo import AnalyticsRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.analytics import (
    HeatmapDay,
    MemberParticipationRow,
    PersonalAnalyticsResponse,
    StreakResponse,
    TeamAnalyticsResponse,
)

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Pure helper functions — no DB access, fully unit-testable
# ---------------------------------------------------------------------------


def _intensity(count: int, max_count: int) -> int:
    """
    Map a submission count to 0–3 intensity for heatmap rendering.

    Intensity scale:
      0 → no submission
      1 → light  (< 33% of max)
      2 → medium (33–66% of max)
      3 → high   (>= 67% of max, or max_count <= 1 with any submission)
    """
    if count == 0:
        return 0
    if max_count <= 1:
        return 3
    ratio = count / max_count
    if ratio < 0.33:
        return 1
    if ratio < 0.67:
        return 2
    return 3


def _build_heatmap(
    submission_counts: dict[str, int],
    from_date: date,
    to_date: date,
) -> list[HeatmapDay]:
    """
    Build a complete heatmap covering every calendar day in [from_date, to_date].
    Days absent from submission_counts are filled with count=0, intensity=0.

    Args:
        submission_counts: {date_str: count} — sparse, only days with submissions
        from_date: inclusive start
        to_date:   inclusive end
    """
    max_count = max(submission_counts.values(), default=1)
    days: list[HeatmapDay] = []
    current = from_date
    while current <= to_date:
        date_str = current.isoformat()
        count = submission_counts.get(date_str, 0)
        days.append(
            HeatmapDay(
                date=date_str,
                count=count,
                intensity=_intensity(count, max_count),
            )
        )
        current += timedelta(days=1)
    return days


def _calculate_streak(
    submission_date_strs: list[str],
    digest_days: list[int] | None,
    today: date | None = None,
) -> tuple[int, int]:
    """
    Calculate current and best streak from a list of submission dates.

    Args:
        submission_date_strs:
            Descending-sorted list of ISO date strings on which the user
            submitted at least one update.
        digest_days:
            ISO weekday numbers (1=Mon … 7=Sun) that count toward the streak.
            None or [] means every calendar day counts (no schedule configured).
        today:
            Override the current date. Defaults to UTC today.
            Pass explicitly in tests to pin the date.

    Returns:
        (current_streak, best_streak)

    Edge cases handled:
    - Today is a non-digest day (e.g. Saturday on a Mon–Fri schedule):
      the algorithm starts checking from the previous counting day, so a
      streak built through Friday is still live on Saturday.
    - Submissions on non-counting days are ignored — they do not extend the
      streak but also do not break it.
    - Safety cap of 730 iterations prevents infinite loops for misconfigured
      digest_days that produce no counting days in a 14-day window.
    """
    if not submission_date_strs:
        return 0, 0

    submission_dates: set[date] = {date.fromisoformat(d) for d in submission_date_strs}

    _today = today or datetime.now(UTC).date()
    use_digest_days = bool(digest_days)

    def is_counting_day(d: date) -> bool:
        if not use_digest_days:
            return True
        return d.isoweekday() in digest_days  # type: ignore[operator]

    def prev_counting_day(d: date) -> date:
        """Walk backward until we hit a counting day (safety cap: 14 days)."""
        candidate = d - timedelta(days=1)
        for _ in range(14):
            if is_counting_day(candidate):
                return candidate
            candidate -= timedelta(days=1)
        return candidate  # fall back even if no counting day found

    # Start from today (or the most recent counting day if today doesn't count)
    check_day = _today
    if not is_counting_day(check_day):
        check_day = prev_counting_day(check_day)

    current_streak = 0
    best_streak = 0
    temp_streak = 0
    current_streak_locked = False  # True once the first gap is encountered

    max_lookback = 730  # 2 years
    days_walked = 0

    while days_walked < max_lookback:
        if check_day in submission_dates:
            temp_streak += 1
            best_streak = max(best_streak, temp_streak)
            if not current_streak_locked:
                current_streak = temp_streak
        else:
            # Gap found — lock in current_streak, reset temp for best tracking
            current_streak_locked = True
            temp_streak = 0

        check_day = prev_counting_day(check_day)
        days_walked += 1

    return current_streak, best_streak


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_personal_analytics(
        self,
        workspace_id: str,
        user_id: str,
    ) -> PersonalAnalyticsResponse:
        analytics_repo = AnalyticsRepository.from_session(self.db)
        workspace_repo = WorkspaceRepository.from_session(self.db)

        today = datetime.now(UTC).date()
        heatmap_start = today - timedelta(weeks=52)

        # Fetch workspace digest schedule for streak calculation
        workspace = await workspace_repo.get_by_id(workspace_id)
        digest_days: list[int] | None = None
        if workspace and workspace.digest_days and workspace.digest_enabled:
            digest_days = [int(d) for d in workspace.digest_days.split(",") if d.strip()]

        # Single query: all submission dates in the 52-week window
        submission_date_strs = await analytics_repo.get_user_submission_dates(
            workspace_id=workspace_id,
            user_id=user_id,
            from_date=heatmap_start,
            to_date=today,
        )

        # Personal heatmap: each day is 0 or 1 submission
        date_counts = {d: 1 for d in submission_date_strs}
        heatmap = _build_heatmap(date_counts, heatmap_start, today)

        current_streak, best_streak = _calculate_streak(submission_date_strs, digest_days)

        last_date = submission_date_strs[0] if submission_date_strs else None

        return PersonalAnalyticsResponse(
            streak=StreakResponse(
                current_streak=current_streak,
                best_streak=best_streak,
                total_submissions=len(submission_date_strs),
                last_submission_date=last_date,
            ),
            heatmap=heatmap,
        )

    async def get_team_analytics(
        self,
        workspace_id: str,
    ) -> TeamAnalyticsResponse:
        analytics_repo = AnalyticsRepository.from_session(self.db)
        workspace_repo = WorkspaceRepository.from_session(self.db)

        today = datetime.now(UTC).date()
        thirty_days_ago = today - timedelta(days=30)
        twelve_weeks_ago = today - timedelta(weeks=12)
        fourteen_days_ago = today - timedelta(days=14)

        # Workspace members + profiles in one call
        members_with_profiles = await workspace_repo.get_workspace_members_with_profiles(workspace_id)
        active_member_count = len(members_with_profiles)

        # Digest schedule for streak + participation denominator
        workspace = await workspace_repo.get_by_id(workspace_id)
        digest_days: list[int] | None = None
        digest_day_count_30d = 30  # default: all calendar days count
        if workspace and workspace.digest_days and workspace.digest_enabled:
            digest_days = [int(d) for d in workspace.digest_days.split(",") if d.strip()]
            # Count digest days in the last 30 calendar days
            digest_day_count_30d = sum(1 for i in range(30) if (today - timedelta(days=i)).isoweekday() in digest_days)

        # Total updates for avg/day metric
        total_updates_30d = await analytics_repo.get_workspace_total_updates(
            workspace_id=workspace_id,
            from_date=thirty_days_ago,
            to_date=today,
        )
        avg_updates_per_day = total_updates_30d / 30 if total_updates_30d > 0 else 0.0

        # Per-member rows — 2 batch queries replace 2N per-member queries.
        # Reduces team analytics from 2N queries to 4 total regardless of member count.
        all_dates = await analytics_repo.get_all_member_submission_dates(workspace_id, twelve_weeks_ago, today)
        all_sparklines = await analytics_repo.get_all_member_sparklines(workspace_id, fourteen_days_ago, today)

        member_rows: list[MemberParticipationRow] = []
        total_participation = 0.0

        for member, profile in members_with_profiles:
            uid = member.user_id
            member_dates = all_dates.get(uid, [])
            current_streak, _ = _calculate_streak(member_dates, digest_days)

            submissions_30d = sum(1 for d in member_dates if d >= thirty_days_ago.isoformat())
            participation_rate = submissions_30d / digest_day_count_30d if digest_day_count_30d > 0 else 0.0
            total_participation += participation_rate

            sparkline_map = all_sparklines.get(uid, {})
            sparkline = [sparkline_map.get((today - timedelta(days=i)).isoformat(), 0) for i in range(13, -1, -1)]

            member_rows.append(
                MemberParticipationRow(
                    user_id=member.user_id,
                    full_name=profile.full_name if profile else None,
                    avatar_url=profile.avatar_url if profile else None,
                    current_streak=current_streak,
                    participation_rate_30d=round(participation_rate, 3),
                    submissions_30d=submissions_30d,
                    sparkline=sparkline,
                )
            )

        team_participation_rate = total_participation / active_member_count if active_member_count > 0 else 0.0

        # Workspace heatmap — 12 weeks
        workspace_daily_counts = await analytics_repo.get_workspace_daily_counts(
            workspace_id=workspace_id,
            from_date=twelve_weeks_ago,
            to_date=today,
        )
        workspace_heatmap = _build_heatmap(workspace_daily_counts, twelve_weeks_ago, today)

        return TeamAnalyticsResponse(
            participation_rate_30d=round(team_participation_rate, 3),
            avg_updates_per_day_30d=round(avg_updates_per_day, 2),
            active_member_count=active_member_count,
            members=member_rows,
            workspace_heatmap=workspace_heatmap,
        )
