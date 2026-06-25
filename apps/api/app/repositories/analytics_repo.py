# apps/api/app/repositories/analytics_repo.py

from datetime import date

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.update import Update


class AnalyticsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "AnalyticsRepository":
        return cls(db)

    async def get_user_submission_dates(
        self,
        workspace_id: str,
        user_id: str,
        from_date: date,
        to_date: date,
    ) -> list[str]:
        """
        Return all dates (YYYY-MM-DD strings) on which the user submitted
        an update in the given workspace + date range.
        Ordered descending — used directly by streak calculation.
        Hits ix_updates_user_date index.
        """
        result = await self.db.execute(
            select(Update.update_date)
            .where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.user_id == user_id,
                    Update.is_deleted == False,  # noqa: E712
                    Update.update_date >= from_date.isoformat(),
                    Update.update_date <= to_date.isoformat(),
                )
            )
            .order_by(Update.update_date.desc())
        )
        return [row[0] for row in result.all()]

    async def get_workspace_daily_counts(
        self,
        workspace_id: str,
        from_date: date,
        to_date: date,
    ) -> dict[str, int]:
        """
        Return {date_str: distinct_member_count} for the workspace heatmap.
        Count = number of distinct users who submitted on each day.
        Hits ix_updates_workspace_date index.
        """
        result = await self.db.execute(
            select(
                Update.update_date,
                func.count(Update.user_id.distinct()).label("member_count"),
            )
            .where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.is_deleted == False,  # noqa: E712
                    Update.update_date >= from_date.isoformat(),
                    Update.update_date <= to_date.isoformat(),
                )
            )
            .group_by(Update.update_date)
        )
        return {row[0]: row[1] for row in result.all()}

    async def get_member_submission_counts(
        self,
        workspace_id: str,
        user_id: str,
        from_date: date,
        to_date: date,
    ) -> dict[str, int]:
        """
        Return {date_str: count} for a single member's submissions.
        Used for the 14-day sparkline in the team analytics table.
        Hits ix_updates_user_workspace index.
        """
        result = await self.db.execute(
            select(
                Update.update_date,
                func.count(Update.id).label("count"),
            )
            .where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.user_id == user_id,
                    Update.is_deleted == False,  # noqa: E712
                    Update.update_date >= from_date.isoformat(),
                    Update.update_date <= to_date.isoformat(),
                )
            )
            .group_by(Update.update_date)
        )
        return {row[0]: row[1] for row in result.all()}

    async def get_workspace_total_updates(
        self,
        workspace_id: str,
        from_date: date,
        to_date: date,
    ) -> int:
        """
        Total non-deleted updates in date range.
        Used to compute avg updates/day in team analytics.
        """
        result = await self.db.execute(
            select(func.count(Update.id)).where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.is_deleted == False,  # noqa: E712
                    Update.update_date >= from_date.isoformat(),
                    Update.update_date <= to_date.isoformat(),
                )
            )
        )
        return result.scalar_one() or 0
