# apps/api/app/services/digest_service.py
# Async business logic layer for digest management

from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.digest_repo import DigestRepository
from app.repositories.update_repo import UpdateRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.digest import (
    DigestItemResponse,
    DigestListResponse,
    DigestPreviewResponse,
    DigestResponse,
    MyDigestPreferenceResponse,
    UpdateDigestSettingsRequest,
)

logger = structlog.get_logger(__name__)


class DigestError(Exception):
    """Base exception for digest service errors."""

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


class DigestService:
    """
    Async business logic layer for digest management.

    Responsibilities:
    - List and retrieve workspace digests with cursor pagination
    - Update digest schedule settings on the workspace
    - Generate live digest previews for admin review
    - Map ORM objects to response schemas

    This layer should NOT contain:
    - Digest generation or email delivery (see app.workers.tasks)
    - Direct Celery task calls
    - Raw DB queries (use repositories)
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._digest_repo: DigestRepository | None = None
        self._workspace_repo: WorkspaceRepository | None = None
        self._update_repo: UpdateRepository | None = None

    def _get_digest_repo(self) -> DigestRepository:
        if self._digest_repo is None:
            self._digest_repo = DigestRepository.from_session(self.db)
        return self._digest_repo

    def _get_workspace_repo(self) -> WorkspaceRepository:
        if self._workspace_repo is None:
            self._workspace_repo = WorkspaceRepository.from_session(self.db)
        return self._workspace_repo

    def _get_update_repo(self) -> UpdateRepository:
        if self._update_repo is None:
            self._update_repo = UpdateRepository.from_session(self.db)
        return self._update_repo

    async def list_digests(
        self,
        workspace_id: str,
        cursor: str | None = None,
        limit: int = 20,
    ) -> DigestListResponse:
        """Return cursor-paginated list of digests for a workspace, newest first."""

        digest_repo = self._get_digest_repo()
        try:
            digests, next_cursor, total = await digest_repo.get_workspace_digests(
                workspace_id=workspace_id,
                cursor=cursor,
                limit=limit,
            )
            return DigestListResponse(
                digests=[_map_digest(d) for d in digests],
                next_cursor=next_cursor,
                total=total,
            )
        except Exception as e:
            logger.exception("list_digests_failed", workspace_id=workspace_id, error=str(e))
            raise DigestError("fetch_failed", "Could not retrieve digests.") from e

    async def get_digest(
        self,
        workspace_id: str,
        digest_id: str,
    ) -> DigestResponse:
        """
        Fetch a single digest with its items.
        Raises DigestError('digest_not_found') if the digest doesn't exist
        or belongs to a different workspace.
        """

        digest_repo = self._get_digest_repo()

        digest = await digest_repo.get_by_id(digest_id)
        if not digest or digest.workspace_id != workspace_id:
            raise DigestError("digest_not_found", "Digest not found.")

        items = await digest_repo.get_items(digest_id)
        return _map_digest(
            digest,
            items=[
                DigestItemResponse(
                    id=item.id,
                    update_id=item.update_id,
                    author_name=item.author_name,
                    summary_snapshot=item.summary_snapshot,
                )
                for item in items
            ],
        )

    async def update_digest_settings(
        self,
        workspace_id: str,
        request: UpdateDigestSettingsRequest,
    ) -> DigestResponse:
        """
        Persist digest schedule changes on the workspace.
        Returns the most recent digest as context, or a minimal placeholder
        if no digests exist yet.
        """

        workspace_repo = self._get_workspace_repo()

        workspace = await workspace_repo.get_by_id(workspace_id)
        if not workspace:
            raise DigestError("workspace_not_found", "Workspace not found.")

        update_data: dict[str, Any] = {}
        if request.digest_enabled is not None:
            update_data["digest_enabled"] = request.digest_enabled
        if request.digest_send_time is not None:
            update_data["digest_send_time"] = request.digest_send_time
        if request.digest_timezone is not None:
            update_data["digest_timezone"] = request.digest_timezone
        if request.digest_days is not None:
            update_data["digest_days"] = request.digest_days

        try:
            await workspace_repo.update(workspace_id, update_data)
            await self.db.commit()
            logger.info(
                "digest_settings_updated",
                workspace_id=workspace_id,
                fields=list(update_data.keys()),
            )
        except Exception as e:
            await self.db.rollback()
            logger.exception("digest_settings_update_failed", workspace_id=workspace_id, error=str(e))
            raise DigestError("update_failed", "Could not update digest settings.") from e

        # Return the most recent digest for this workspace as context,
        # or a minimal placeholder if none exist yet
        digest_repo = self._get_digest_repo()
        digests, _, _ = await digest_repo.get_workspace_digests(workspace_id, limit=1)
        if digests:
            return _map_digest(digests[0])

        # No digests yet — return a minimal valid DigestResponse
        return DigestResponse(
            id="",
            workspace_id=workspace_id,
            digest_date=datetime.now(UTC).strftime("%Y-%m-%d"),
            summary=None,
            status="pending",
            update_count=0,
            email_sent_at=None,
            created_at=datetime.now(UTC),
            items=[],
        )

    async def get_my_notification_preference(
        self,
        workspace_id: str,
        user_id: str,
    ) -> MyDigestPreferenceResponse:
        """
        Return whether the given user has digest email notifications
        enabled for this specific workspace. Self-service — any member
        can read their own preference, no admin gate (contrast with
        update_digest_settings, which changes workspace-wide config and
        is admin-only).
        """
        workspace_repo = self._get_workspace_repo()

        member = await workspace_repo.get_member(workspace_id, user_id)
        if not member:
            raise DigestError(
                "workspace_not_found",
                "You are not a member of this workspace.",
            )

        return MyDigestPreferenceResponse(
            email_notifications=member.email_notifications,
        )

    async def update_my_notification_preference(
        self,
        workspace_id: str,
        user_id: str,
        enabled: bool,
    ) -> MyDigestPreferenceResponse:
        """
        Let a member turn their own digest emails for this workspace back
        on or off — the in-app counterpart to the one-way unsubscribe
        link (see app/routers/unsubscribe.py and app/lib/unsubscribe.py).
        Self-service — any member can change their own preference.
        """
        workspace_repo = self._get_workspace_repo()

        member = await workspace_repo.update_member_notification_preference(workspace_id, user_id, enabled=enabled)
        if not member:
            raise DigestError(
                "workspace_not_found",
                "You are not a member of this workspace.",
            )

        logger.info(
            "digest_notification_preference_updated",
            workspace_id=workspace_id,
            user_id=user_id,
            enabled=enabled,
        )

        return MyDigestPreferenceResponse(
            email_notifications=member.email_notifications,
        )

    async def preview_digest(self, workspace_id: str) -> DigestPreviewResponse:
        """
        Generate a live digest preview from today's processed updates.
        Calls Claude to produce a real team summary — not cached.
        Returns empty html and update_count=0 if no processed updates exist today.
        """

        from app.lib.email import render_digest_email
        from app.workers.prompts import build_digest_prompt

        workspace_repo = self._get_workspace_repo()
        update_repo = self._get_update_repo()

        workspace = await workspace_repo.get_by_id(workspace_id)
        if not workspace:
            raise DigestError("workspace_not_found", "Workspace not found.")

        today = datetime.now(UTC).strftime("%Y-%m-%d")

        all_updates = await update_repo.get_workspace_updates_for_date(
            workspace_id=workspace_id,
            update_date=today,
        )
        updates = [u for u in all_updates if u.status == "processed"]

        # Fetch recipient emails for would_send_to
        rows = await workspace_repo.get_workspace_members_with_profiles(workspace_id)
        would_send_to = [profile.email for _, profile in rows if profile and profile.email_notifications and profile.email]

        if not updates:
            return DigestPreviewResponse(
                html="",
                digest_date=today,
                update_count=0,
                would_send_to=would_send_to,
            )

        # Batch-fetch profiles for author names
        user_ids = [u.user_id for u in updates]
        profiles_by_id = await workspace_repo.get_profiles_for_updates(user_ids)

        summaries_text = "\n\n".join(f"- {u.summary or u.content}" for u in updates)
        prompt = build_digest_prompt(
            workspace_name=workspace.name,
            digest_date=today,
            summaries=summaries_text,
            custom_prompt=workspace.digest_prompt,
        )

        try:
            from app.lib.claude import summarise

            team_summary = await summarise(prompt, use_fallback=False)
        except Exception as e:
            logger.warning("preview_summarise_failed", workspace_id=workspace_id, error=str(e))
            team_summary = "Preview summary unavailable."

        items = [
            {
                "author_name": profiles_by_id.get(u.user_id) and profiles_by_id[u.user_id].full_name,
                "summary_snapshot": u.summary,
            }
            for u in updates
        ]

        html = render_digest_email(
            workspace_name=workspace.name,
            digest_date=today,
            team_summary=team_summary,
            items=items,
            unsubscribe_url="",
        )

        return DigestPreviewResponse(
            html=html,
            digest_date=today,
            update_count=len(updates),
            would_send_to=would_send_to,
        )


# ---------------------------------------------------------------------------
# Mapper
# ---------------------------------------------------------------------------


def _map_digest(
    digest: Any,
    items: list[DigestItemResponse] | None = None,
) -> DigestResponse:
    return DigestResponse(
        id=digest.id,
        workspace_id=digest.workspace_id,
        digest_date=digest.digest_date,
        summary=digest.summary,
        status=digest.status,
        update_count=digest.update_count,
        email_sent_at=digest.email_sent_at,
        created_at=digest.created_at,
        items=items or [],
    )
