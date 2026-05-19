# apps/api/app/repositories/workspace_repo.py
# Repository pattern for workspace and workspace member data access

from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace, WorkspaceMember

logger = structlog.get_logger(__name__)


class WorkspaceRepository:
    """Repository for workspace and membership operations."""

    def __init__(self, db_session: AsyncSession):
        """
        Initialize WorkspaceRepository.

        Args:
            db_session: Async SQLAlchemy session instance.
        """
        self.db = db_session

    @classmethod
    def from_session(cls, db_session: AsyncSession) -> "WorkspaceRepository":
        """
        Factory method to create repository with injected session.

        Args:
            db_session: Async SQLAlchemy session.

        Returns:
            WorkspaceRepository instance.
        """
        return cls(db_session)

    # === Workspace ===

    async def create(self, owner_id: str, name: str, slug: str) -> Workspace:
        """
        Create a new workspace.

        Args:
            owner_id: Supabase user ID of the workspace owner.
            name: Display name.
            slug: URL-safe identifier (caller must verify uniqueness first).

        Returns:
            Created Workspace instance.

        Raises:
            IntegrityError: If slug already exists (race condition after slug check).
        """
        workspace = Workspace(
            owner_id=owner_id,
            name=name,
            slug=slug,
            plan="free",
        )
        self.db.add(workspace)
        try:
            await self.db.flush()  # get the id without committing — service owns the commit
            await self.db.refresh(workspace)
            return workspace
        except IntegrityError:
            await self.db.rollback()
            logger.error("workspace_create_integrity_error", slug=slug, owner_id=owner_id)
            raise

    async def get_by_id(self, workspace_id: str) -> Workspace | None:
        """
        Get workspace by UUID.

        Args:
            workspace_id: Workspace UUID string.

        Returns:
            Workspace instance if found, None otherwise.
        """
        result = await self.db.execute(select(Workspace).where(Workspace.id == workspace_id))
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Workspace | None:
        """
        Get workspace by slug.

        Args:
            slug: URL-safe workspace identifier.

        Returns:
            Workspace instance if found, None otherwise.
        """
        result = await self.db.execute(select(Workspace).where(Workspace.slug == slug))
        return result.scalar_one_or_none()

    async def slug_exists(self, slug: str) -> bool:
        """
        Check whether a slug is already taken.

        Args:
            slug: Slug string to check.

        Returns:
            True if taken, False if available.
        """
        result = await self.db.execute(select(Workspace.id).where(Workspace.slug == slug))
        return result.scalar_one_or_none() is not None

    async def get_user_workspaces(self, user_id: str) -> list[Workspace]:
        """
        Get all workspaces the user is a member of.

        Args:
            user_id: Supabase user ID.

        Returns:
            List of Workspace instances (may be empty).
        """
        result = await self.db.execute(select(Workspace).join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id).where(WorkspaceMember.user_id == user_id).order_by(Workspace.created_at))
        return list(result.scalars().all())

    # === Members ===

    async def add_member(
        self,
        workspace_id: str,
        user_id: str,
        role: str,
        invited_by: str | None = None,
    ) -> WorkspaceMember:
        """
        Add a user to a workspace.

        Args:
            workspace_id: Workspace UUID.
            user_id: Supabase user ID of the new member.
            role: Role to assign — 'owner', 'admin', or 'member'.
            invited_by: Optional Supabase user ID of the inviting user.

        Returns:
            Created WorkspaceMember instance.

        Raises:
            IntegrityError: If the user is already a member (unique constraint).
        """
        member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            invited_by=invited_by,
        )
        self.db.add(member)
        try:
            await self.db.flush()
            await self.db.refresh(member)
            return member
        except IntegrityError:
            await self.db.rollback()
            logger.error(
                "workspace_member_already_exists",
                workspace_id=workspace_id,
                user_id=user_id,
            )
            raise

    async def get_member(self, workspace_id: str, user_id: str) -> WorkspaceMember | None:
        """
        Get a single membership record.

        Args:
            workspace_id: Workspace UUID.
            user_id: Supabase user ID.

        Returns:
            WorkspaceMember instance if found, None otherwise.
        """
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_workspace_members(self, workspace_id: str) -> list[WorkspaceMember]:
        """
        Get all members of a workspace.

        Args:
            workspace_id: Workspace UUID.

        Returns:
            List of WorkspaceMember instances.
        """
        result = await self.db.execute(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id).order_by(WorkspaceMember.joined_at))
        return list(result.scalars().all())

    async def update(self, workspace_id: str, data: dict[str, Any]) -> Workspace | None:
        """
        Update workspace fields.

        Args:
            workspace_id: Workspace UUID to update.
            data: Dict of field names and new values.

        Returns:
            Updated Workspace instance if found, None otherwise.
        """
        if not data:
            return await self.get_by_id(workspace_id)

        try:
            workspace = await self.get_by_id(workspace_id)
            if not workspace:
                return None
            for key, value in data.items():
                setattr(workspace, key, value)
            await self.db.flush()
            await self.db.refresh(workspace)
            return workspace
        except Exception as e:
            await self.db.rollback()
            logger.error(
                "workspace_update_failed",
                workspace_id=workspace_id,
                error=str(e),
                data_keys=list(data.keys()),
            )
            raise
