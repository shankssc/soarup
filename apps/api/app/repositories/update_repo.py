# apps/api/app/repositories/update_repo.py

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.update import Update


class UpdateRepository:
    """CRUD operations for standup updates. All queries exclude soft-deleted records."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "UpdateRepository":
        return cls(db)

    async def create(
        self,
        workspace_id: str,
        user_id: str,
        content: str,
        update_date: str,
        mode: str = "text",
        audio_key: str | None = None,
        audio_duration_seconds: int | None = None,
    ) -> Update:
        """Insert a new update record and return it refreshed from DB."""
        update = Update(
            workspace_id=workspace_id,
            user_id=user_id,
            content=content,
            update_date=update_date,
            mode=mode,
            status="pending",
            audio_key=audio_key,
            audio_duration_seconds=audio_duration_seconds,
        )
        self.db.add(update)
        await self.db.commit()
        await self.db.refresh(update)
        return update

    async def get_by_id(self, update_id: str) -> Update | None:
        """Fetch a single update by ID, or None if not found or soft-deleted."""
        result = await self.db.execute(
            select(Update).where(
                Update.id == update_id,
                Update.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_for_user_on_date(
        self,
        workspace_id: str,
        user_id: str,
        update_date: str,
    ) -> Update | None:
        """Return the user's update for a given workspace + date, or None if not submitted."""
        result = await self.db.execute(
            select(Update).where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.user_id == user_id,
                    Update.update_date == update_date,
                    Update.is_deleted == False,  # noqa: E712
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_workspace_updates_for_date(
        self,
        workspace_id: str,
        update_date: str,
    ) -> list[Update]:
        """Return all non-deleted updates for a workspace on a given date, ordered by created_at asc."""
        result = await self.db.execute(
            select(Update)
            .where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.update_date == update_date,
                    Update.is_deleted == False,  # noqa: E712
                )
            )
            .order_by(Update.created_at.asc())
        )
        return list(result.scalars().all())

    async def update_content(self, update: Update, content: str) -> Update:
        """Overwrite update content in place and return the refreshed record."""
        update.content = content
        await self.db.commit()
        await self.db.refresh(update)
        return update

    async def update_transcript(self, update: Update, transcript: str) -> Update:
        """
        Store transcript text after faster-whisper transcription completes.
        Sets both transcript (dedicated field) and content (so existing
        queries that read content work without changes).
        Voice updates have content = "" until this is called.
        """
        update.transcript = transcript
        update.content = transcript
        await self.db.commit()
        await self.db.refresh(update)
        return update

    async def soft_delete(self, update: Update) -> None:
        """Mark update as deleted without removing the row."""
        update.is_deleted = True
        await self.db.commit()

    async def update_status(
        self,
        update: Update,
        status: str,
        summary: str | None = None,
    ) -> Update:
        """
        Transition an update's processing status and optionally store its summary.

        Called by the Celery task at each stage of the pipeline:
          pending → processing  (no summary)
          processing → processed (summary populated)
          processing → failed    (no summary)

        Args:
            update:  ORM instance to mutate — must belong to the current session.
            status:  Target status string: "processing", "processed", or "failed".
            summary: AI-generated summary text. Only written when not None,
                     so passing None on a failed transition won't overwrite
                     a previously stored summary.

        Returns:
            The refreshed Update instance.
        """
        update.status = status
        if summary is not None:
            update.summary = summary
        await self.db.commit()
        await self.db.refresh(update)
        return update

    async def get_workspace_updates_paginated(
        self,
        workspace_id: str,
        limit: int = 20,
        cursor: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        user_id: str | None = None,
    ) -> tuple[list[Update], str | None]:
        """
        Cursor-based pagination for update history.
        Cursor is the update.id of the last seen item.
        Uses keyset pagination on (update_date DESC, id DESC) for stable ordering.
        Returns (updates, next_cursor).  next_cursor is None on the last page.
        """
        query = (
            select(Update)
            .where(
                Update.workspace_id == workspace_id,
                Update.is_deleted == False,  # noqa: E712
            )
            .order_by(Update.update_date.desc(), Update.id.desc())
        )

        if from_date:
            query = query.where(Update.update_date >= from_date)
        if to_date:
            query = query.where(Update.update_date <= to_date)
        if user_id:
            query = query.where(Update.user_id == user_id)

        if cursor:
            cursor_update = await self.get_by_id(cursor)
            if cursor_update:
                # Keyset: fetch updates older than the cursor item.
                # Handles ties on update_date by also comparing id.
                query = query.where(
                    or_(
                        Update.update_date < cursor_update.update_date,
                        and_(
                            Update.update_date == cursor_update.update_date,
                            Update.id < cursor_update.id,
                        ),
                    )
                )

        query = query.limit(limit + 1)
        result = await self.db.execute(query)
        updates = list(result.scalars().all())

        next_cursor: str | None = None
        if len(updates) > limit:
            updates = updates[:limit]
            next_cursor = updates[-1].id

        return updates, next_cursor
