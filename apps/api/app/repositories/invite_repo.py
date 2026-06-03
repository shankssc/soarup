# apps/api/app/repositories/invite_repo.py

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invite import WorkspaceInvite

INVITE_EXPIRY_DAYS = 7


class InviteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "InviteRepository":
        return cls(db)

    @staticmethod
    def _generate_code() -> str:
        """Generate a URL-safe 32-character random token."""
        return secrets.token_urlsafe(24)

    async def create(
        self,
        workspace_id: str,
        invited_by: str,
        email: str,
    ) -> WorkspaceInvite:
        """
        Create a new invite.

        Invalidates any existing unused invite for the same
        email+workspace before creating the new one — this prevents a
        single email from accumulating multiple valid invite links, which
        would be confusing and slightly harder to revoke cleanly.
        """
        existing = await self.get_pending_by_email_and_workspace(workspace_id, email)
        if existing:
            existing.is_used = True
            await self.db.flush()

        invite = WorkspaceInvite(
            workspace_id=workspace_id,
            invited_by=invited_by,
            email=email,
            code=self._generate_code(),
            expires_at=datetime.now(UTC) + timedelta(days=INVITE_EXPIRY_DAYS),
        )
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def get_by_code(self, code: str) -> WorkspaceInvite | None:
        result = await self.db.execute(select(WorkspaceInvite).where(WorkspaceInvite.code == code))
        return result.scalar_one_or_none()

    async def get_pending_by_email_and_workspace(self, workspace_id: str, email: str) -> WorkspaceInvite | None:
        """Return any active (unused, non-expired) invite for this email+workspace."""
        now = datetime.now(UTC)
        result = await self.db.execute(
            select(WorkspaceInvite).where(
                WorkspaceInvite.workspace_id == workspace_id,
                WorkspaceInvite.email == email,
                WorkspaceInvite.is_used == False,  # noqa: E712
                WorkspaceInvite.expires_at > now,
            )
        )
        return result.scalar_one_or_none()

    async def get_pending_by_workspace(self, workspace_id: str) -> list[WorkspaceInvite]:
        """Return all unused, non-expired invites for the workspace (for the admin list view)."""
        now = datetime.now(UTC)
        result = await self.db.execute(
            select(WorkspaceInvite)
            .where(
                WorkspaceInvite.workspace_id == workspace_id,
                WorkspaceInvite.is_used == False,  # noqa: E712
                WorkspaceInvite.expires_at > now,
            )
            .order_by(WorkspaceInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def mark_used(self, invite: WorkspaceInvite, used_by: str) -> WorkspaceInvite:
        """Record acceptance — sets is_used, used_by, and used_at."""
        invite.is_used = True
        invite.used_by = used_by
        invite.used_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def revoke(self, invite: WorkspaceInvite) -> None:
        """
        Manually invalidate an invite without recording a used_by.
        used_at stays None so REVOKED is distinguishable from USED.
        """
        invite.is_used = True
        await self.db.commit()

    async def get_by_id(self, invite_id: str) -> WorkspaceInvite | None:
        result = await self.db.execute(select(WorkspaceInvite).where(WorkspaceInvite.id == invite_id))
        return result.scalar_one_or_none()
