# apps/api/app/repositories/digest_repo.py
# Repository pattern for workspace digest data access

from datetime import datetime
from typing import Any

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.digest import Digest, DigestItem

logger = structlog.get_logger(__name__)


class DigestRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "DigestRepository":
        return cls(db)

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------

    async def create(
        self,
        workspace_id: str,
        digest_date: str,
    ) -> Digest:
        """
        Create a new digest record in 'pending' status.
        Caller is responsible for checking idempotency via
        get_for_workspace_date before calling this.
        """
        digest = Digest(
            workspace_id=workspace_id,
            digest_date=digest_date,
            status="pending",
            update_count=0,
        )
        self.db.add(digest)
        await self.db.commit()
        await self.db.refresh(digest)
        logger.info("digest_created", workspace_id=workspace_id, digest_date=digest_date)
        return digest

    async def update_status(
        self,
        digest_id: str,
        status: str,
        summary: str | None = None,
        update_count: int | None = None,
        email_sent_at: datetime | None = None,
    ) -> Digest | None:
        """
        Update digest status + optional fields atomically.
        Used by the Celery task to transition:
        pending → processing → sent | failed
        """
        digest = await self.get_by_id(digest_id)
        if not digest:
            logger.warning("digest_not_found_for_status_update", digest_id=digest_id)
            return None

        digest.status = status
        if summary is not None:
            digest.summary = summary
        if update_count is not None:
            digest.update_count = update_count
        if email_sent_at is not None:
            digest.email_sent_at = email_sent_at

        await self.db.commit()
        await self.db.refresh(digest)
        return digest

    async def add_items(
        self,
        digest_id: str,
        items: list[dict[str, Any]],
    ) -> list[DigestItem]:
        """
        Bulk-insert DigestItem records linking a digest to its updates.

        Each dict in items must have:
            update_id: str
            author_name: str | None
            summary_snapshot: str | None
        """
        digest_items = [
            DigestItem(
                digest_id=digest_id,
                update_id=item["update_id"],
                author_name=item.get("author_name"),
                summary_snapshot=item.get("summary_snapshot"),
            )
            for item in items
        ]
        self.db.add_all(digest_items)
        await self.db.commit()
        logger.info("digest_items_added", digest_id=digest_id, count=len(digest_items))
        return digest_items

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    async def get_by_id(self, digest_id: str) -> Digest | None:
        result = await self.db.execute(select(Digest).where(Digest.id == digest_id))
        return result.scalar_one_or_none()

    async def get_for_workspace_date(
        self,
        workspace_id: str,
        digest_date: str,
    ) -> Digest | None:
        """
        Fetch the digest for a specific workspace + date.
        Used for idempotency checks in the Celery task —
        if a 'sent' digest already exists, skip re-sending.
        """
        result = await self.db.execute(
            select(Digest).where(
                Digest.workspace_id == workspace_id,
                Digest.digest_date == digest_date,
            )
        )
        return result.scalar_one_or_none()

    async def get_workspace_digests(
        self,
        workspace_id: str,
        cursor: str | None = None,
        limit: int = 20,
    ) -> tuple[list[Digest], str | None, int]:
        """
        Cursor-paginated list of digests for a workspace.
        Keyset pagination on created_at DESC + id DESC for stability.

        Returns:
            (digests, next_cursor, total)

        Cursor format: "{created_at_isoformat}|{id}"
        """
        # Total count (unpaginated) for DigestListResponse.total
        count_result = await self.db.execute(select(func.count()).where(Digest.workspace_id == workspace_id))
        total = count_result.scalar_one()

        # Base query
        query = select(Digest).where(Digest.workspace_id == workspace_id)

        # Apply cursor if provided
        if cursor:
            try:
                cursor_ts_str, cursor_id = cursor.split("|", 1)
                cursor_ts = datetime.fromisoformat(cursor_ts_str)
                query = query.where((Digest.created_at < cursor_ts) | ((Digest.created_at == cursor_ts) & (Digest.id < cursor_id)))
            except (ValueError, AttributeError):
                logger.warning("invalid_digest_cursor", cursor=cursor)
                # Ignore malformed cursor — return from beginning

        query = query.order_by(Digest.created_at.desc(), Digest.id.desc()).limit(limit + 1)

        result = await self.db.execute(query)
        rows = list(result.scalars().all())

        # Determine next cursor
        if len(rows) > limit:
            rows = rows[:limit]
            last = rows[-1]
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"
        else:
            next_cursor = None

        return rows, next_cursor, total

    async def get_items(self, digest_id: str) -> list[DigestItem]:
        """Fetch all DigestItems for a given digest, ordered by insertion."""
        result = await self.db.execute(select(DigestItem).where(DigestItem.digest_id == digest_id).order_by(DigestItem.id))
        return list(result.scalars().all())
