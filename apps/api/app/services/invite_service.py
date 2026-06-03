# apps/api/app/services/invite_service.py

from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.lib.email import send_invite_email
from app.repositories.invite_repo import InviteRepository
from app.repositories.profile_repo import ProfileRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.invite import (
    CreateInviteRequest,
    InviteDetailsResponse,
    InviteResponse,
)

logger = structlog.get_logger(__name__)


class InviteError(Exception):
    """
    Structured invite error — carries an error_code for the router to
    translate into an appropriate HTTP status and detail message.
    """

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


class InviteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_invite(
        self,
        workspace_id: str,
        inviter_id: str,
        request: CreateInviteRequest,
    ) -> InviteResponse:
        """
        Create and email a workspace invite.

        NOTE — "already a member" pre-check is intentionally absent:
        Profile does not store an email column (only email_notifications: bool),
        so we cannot look up a member by email at the repository layer without
        a Supabase admin client call. The accept_invite endpoint enforces the
        already_member guard after the user authenticates, which is the correct
        place for it. The invite may be sent to someone who is already a member,
        but they will be told so when they click the link.

        M5 KNOWN TRADEOFF: Any workspace member can send invites (not restricted
        to admin+). This is intentional for now — the RBAC enforcement in the
        router is straightforward to tighten to WorkspaceAdminDep in a follow-up
        PR without touching this service.
        """
        workspace_repo = WorkspaceRepository.from_session(self.db)
        profile_repo = ProfileRepository.from_session(self.db)
        invite_repo = InviteRepository.from_session(self.db)

        workspace = await workspace_repo.get_by_id(workspace_id)
        if not workspace:
            raise InviteError("workspace_not_found", "Workspace not found.")

        inviter = await profile_repo.get_by_user_id(inviter_id)

        invite = await invite_repo.create(
            workspace_id=workspace_id,
            invited_by=inviter_id,
            email=str(request.email),
        )

        invite_url = f"{settings.app_base_url}/invite/{invite.code}"

        inviter_by_name = inviter.full_name if inviter else "A teammate"

        if not inviter_by_name:
            raise ValueError("Inviter name not found")

        email_sent = await send_invite_email(
            to_email=str(request.email),
            workspace_name=workspace.name,
            invited_by_name=inviter_by_name,
            invite_url=invite_url,
        )

        if not email_sent:
            logger.warning(
                "invite_email_not_sent",
                workspace_id=workspace_id,
                invite_id=invite.id,
                invite_url=invite_url,
            )
            # Non-fatal — invite is created. Admin can share the link manually.

        return InviteResponse.model_validate(invite)

    async def get_invite_details(self, code: str) -> InviteDetailsResponse:
        """
        Return public invite info for the /invite/:code acceptance page.
        Does not require authentication — safe for unauthenticated GET.
        """
        invite_repo = InviteRepository.from_session(self.db)
        workspace_repo = WorkspaceRepository.from_session(self.db)
        profile_repo = ProfileRepository.from_session(self.db)

        invite = await invite_repo.get_by_code(code)
        if not invite:
            raise InviteError("invite_not_found", "Invite not found.")

        workspace = await workspace_repo.get_by_id(invite.workspace_id)
        inviter = await profile_repo.get_by_user_id(invite.invited_by)

        is_valid = not invite.is_used and invite.expires_at > datetime.now(UTC)

        return InviteDetailsResponse(
            workspace_name=workspace.name if workspace else "Unknown Workspace",
            workspace_slug=workspace.slug if workspace else "",
            invited_by_name=inviter.full_name if inviter else None,
            email=invite.email,
            expires_at=invite.expires_at,
            is_valid=is_valid,
        )

    async def accept_invite(
        self,
        code: str,
        user_id: str,
        user_email: str,
    ) -> str:
        """
        Accept an invite and add the user to the workspace.
        Returns workspace_id on success.

        Email mismatch is warned but not blocked — a user invited via their
        work email may have signed up with a personal email. Requiring exact
        match would create friction for a common real-world scenario. The
        frontend shows a warning when emails don't match; the user can
        proceed anyway.
        """
        invite_repo = InviteRepository.from_session(self.db)
        workspace_repo = WorkspaceRepository.from_session(self.db)

        invite = await invite_repo.get_by_code(code)
        if not invite:
            raise InviteError("invite_not_found", "Invite not found.")
        if invite.is_used:
            raise InviteError(
                "invite_already_used",
                "This invite has already been used.",
            )
        if invite.expires_at < datetime.now(UTC):
            raise InviteError(
                "invite_expired",
                "This invite has expired. Ask an admin to send a new one.",
            )

        if invite.email.lower() != user_email.lower():
            logger.warning(
                "invite_email_mismatch",
                invite_email=invite.email,
                user_email=user_email,
                workspace_id=invite.workspace_id,
            )

        existing = await workspace_repo.get_member(invite.workspace_id, user_id)
        if existing:
            raise InviteError(
                "already_member",
                "You are already a member of this workspace.",
            )

        await workspace_repo.add_member(invite.workspace_id, user_id, "member")
        await invite_repo.mark_used(invite, user_id)

        logger.info(
            "invite_accepted",
            workspace_id=invite.workspace_id,
            user_id=user_id,
        )
        return invite.workspace_id
