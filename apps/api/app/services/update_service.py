# apps/api/app/services/update_service.py

from typing import Any

import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.events import append_event
from app.repositories.profile_repo import ProfileRepository
from app.repositories.update_repo import UpdateRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.update import (
    SubmitUpdateRequest,
    UpdateHistoryResponse,
    UpdateListResponse,
    UpdateResponse,
    UpdateUpdateRequest,
)
from app.workers.tasks import process_audio_update, process_update

logger = structlog.get_logger(__name__)


class UpdateError(Exception):
    def __init__(
        self,
        error_code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ):
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


class UpdateService:
    """
    Business logic for standup update operations.
    Enforces ownership, duplicate submission rules, and response shaping.
    """

    def __init__(self, db: AsyncSession, redis: Redis):
        self.db = db
        self._redis = redis
        self._update_repo: UpdateRepository | None = None
        self._profile_repo: ProfileRepository | None = None
        self._workspace_repo: WorkspaceRepository | None = None

    def _get_update_repo(self) -> UpdateRepository:
        if self._update_repo is None:
            self._update_repo = UpdateRepository.from_session(self.db)
        return self._update_repo

    def _get_profile_repo(self) -> ProfileRepository:
        if self._profile_repo is None:
            self._profile_repo = ProfileRepository.from_session(self.db)
        return self._profile_repo

    def _get_workspace_repo(self) -> WorkspaceRepository | Any:
        if self._workspace_repo is None:
            self._workspace_repo = WorkspaceRepository.from_session(self.db)
        return self._workspace_repo

    async def submit_update(
        self,
        workspace_id: str,
        user_id: str,
        request: SubmitUpdateRequest,
    ) -> UpdateResponse:
        """
        Create a new update and enqueue it for AI processing.
        - Text mode: enqueues process_update (summarisation only)
        - Voice mode: enqueues process_audio_update (transcription → summarisation)
        Raises UpdateError if one already exists for this user + workspace + date.
        """
        repo = self._get_update_repo()
        existing = await repo.get_for_user_on_date(workspace_id, user_id, request.update_date)
        if existing:
            raise UpdateError(
                "update_already_exists",
                "You have already submitted an update for today.",
                {"existing_id": existing.id},
            )

        if request.mode == "voice" and request.audio_key:
            update = await repo.create(
                workspace_id=workspace_id,
                user_id=user_id,
                content="",
                update_date=request.update_date,
                mode="voice",
                audio_key=request.audio_key,
                audio_duration_seconds=request.audio_duration_seconds,
            )
            process_audio_update.delay(update.id)
            logger.info(
                "voice_update_submitted",
                update_id=update.id,
                workspace_id=workspace_id,
                user_id=user_id,
            )
        else:
            update = await repo.create(
                workspace_id=workspace_id,
                user_id=user_id,
                content=request.content,
                update_date=request.update_date,
                mode=request.mode,
            )
            process_update.delay(update.id)
            logger.info(
                "update_submitted",
                update_id=update.id,
                workspace_id=workspace_id,
                user_id=user_id,
            )

        await append_event(
            self._redis,
            "member.update_submitted",
            workspace_id,
            {
                "update_id": update.id,
                "workspace_id": workspace_id,
                "user_id": user_id,
                "update_date": str(request.update_date),
            },
        )

        return await self._to_response(update)

    async def get_workspace_updates(
        self,
        workspace_id: str,
        update_date: str,
    ) -> UpdateListResponse:
        """
        Return all updates for a workspace on a given date.

        M5: Replaced the per-update profile fetch (N+1) with a single
        batch query via get_profiles_for_updates. One IN query fetches
        all author profiles regardless of how many updates are returned.
        """
        updates = await self._get_update_repo().get_workspace_updates_for_date(workspace_id, update_date)

        if not updates:
            return UpdateListResponse(updates=[], total=0)

        user_ids = list({u.user_id for u in updates})
        profile_map = await self._get_workspace_repo().get_profiles_for_updates(user_ids)

        responses = [self._to_response_batch(u, profile_map) for u in updates]
        return UpdateListResponse(updates=responses, total=len(responses))

    async def edit_update(
        self,
        workspace_id: str,
        user_id: str,
        update_id: str,
        request: UpdateUpdateRequest,
    ) -> UpdateResponse:
        """
        Edit an existing update. Raises UpdateError if not found,
        wrong workspace, or requester is not the owner.
        """
        repo = self._get_update_repo()
        update = await repo.get_by_id(update_id)
        if not update or update.workspace_id != workspace_id:
            raise UpdateError("update_not_found", "Update not found.")
        if update.user_id != user_id:
            raise UpdateError("unauthorized", "You can only edit your own updates.")
        updated = await repo.update_content(update, request.content)
        return await self._to_response(updated)

    async def delete_update(
        self,
        workspace_id: str,
        user_id: str,
        update_id: str,
    ) -> None:
        """
        Soft-delete an update. Raises UpdateError if not found,
        wrong workspace, or requester is not the owner.
        """
        repo = self._get_update_repo()
        update = await repo.get_by_id(update_id)
        if not update or update.workspace_id != workspace_id:
            raise UpdateError("update_not_found", "Update not found.")
        if update.user_id != user_id:
            raise UpdateError("unauthorized", "You can only delete your own updates.")
        await repo.soft_delete(update)
        logger.info("update_deleted", update_id=update_id, user_id=user_id)

    async def get_update_history(
        self,
        workspace_id: str,
        cursor: str | None,
        limit: int,
        from_date: str | None,
        to_date: str | None,
        user_id: str | None,
    ) -> UpdateHistoryResponse:
        repo = self._get_update_repo()
        updates, next_cursor = await repo.get_workspace_updates_paginated(
            workspace_id=workspace_id,
            limit=limit,
            cursor=cursor,
            from_date=from_date,
            to_date=to_date,
            user_id=user_id,
        )

        if not updates:
            return UpdateHistoryResponse(updates=[], next_cursor=None)

        user_ids = list({u.user_id for u in updates})
        profile_map = await self._get_profile_repo().get_by_user_ids(user_ids)

        responses = [self._to_response_batch(u, profile_map) for u in updates]

        return UpdateHistoryResponse(
            updates=responses,
            next_cursor=next_cursor,
        )

    async def _to_response(self, update: Any) -> UpdateResponse:
        """
        Shape a single Update ORM object into an UpdateResponse.
        Makes one profile query — used by submit_update and edit_update
        where only one update is being shaped at a time.
        For list operations use _to_response_batch to avoid N+1.
        """
        profile = await self._get_profile_repo().get_by_user_id(update.user_id)
        return UpdateResponse(
            id=update.id,
            workspace_id=update.workspace_id,
            user_id=update.user_id,
            content=update.content,
            mode=update.mode,
            status=update.status,
            summary=update.summary,
            transcript=update.transcript,
            audio_duration_seconds=update.audio_duration_seconds,
            update_date=update.update_date,
            created_at=update.created_at,
            updated_at=update.updated_at,
            author_name=profile.full_name if profile else None,
            author_avatar_url=profile.avatar_url if profile else None,
        )

    def _to_response_batch(
        self,
        update: Any,
        profile_map: dict[str, Any],
    ) -> UpdateResponse:
        """
        Shape an Update ORM object into an UpdateResponse using a
        pre-fetched profile map. Synchronous — no DB calls.

        Args:
            update: Update ORM instance.
            profile_map: Dict of user_id → Profile from
                         get_profiles_for_updates. Missing user_ids
                         resolve to None (author fields will be null).

        Returns:
            UpdateResponse with author fields populated where available.
        """
        profile = profile_map.get(update.user_id)
        return UpdateResponse(
            id=update.id,
            workspace_id=update.workspace_id,
            user_id=update.user_id,
            content=update.content,
            mode=update.mode,
            status=update.status,
            summary=update.summary,
            transcript=update.transcript,
            audio_duration_seconds=update.audio_duration_seconds,
            update_date=update.update_date,
            created_at=update.created_at,
            updated_at=update.updated_at,
            author_name=profile.full_name if profile else None,
            author_avatar_url=profile.avatar_url if profile else None,
        )
