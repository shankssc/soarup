# apps/api/app/repositories/workspace_repo.py
# Repository pattern for workspace and workspace member data access

from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile
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

    # === Members Mangaement ===

    async def get_workspace_members_with_profiles(
        self,
        workspace_id: str,
    ) -> list[tuple[WorkspaceMember, Profile]]:
        """
        Fetch all members with their profiles in a single JOIN query.

        Args:
            workspace_id: Workspace UUID.

        Returns:
            List of (WorkspaceMember, Profile) tuples ordered by joined_at.
            Used by the members list endpoint and team dashboard to avoid
            N+1 profile lookups.
        """
        result = await self.db.execute(select(WorkspaceMember, Profile).join(Profile, WorkspaceMember.user_id == Profile.id).where(WorkspaceMember.workspace_id == workspace_id).order_by(WorkspaceMember.joined_at.asc()))
        return [(row[0], row[1]) for row in result.all()]

    async def update_member_role(
        self,
        workspace_id: str,
        user_id: str,
        new_role: str,
    ) -> WorkspaceMember | None:
        """
        Set a member's role and persist.

        Args:
            workspace_id: Workspace UUID.
            user_id: Supabase user ID of the member to update.
            new_role: Target role string — "admin" or "member".

        Returns:
            Updated WorkspaceMember instance if found, None otherwise.
        """
        member = await self.get_member(workspace_id, user_id)
        if not member:
            return None
        member.role = new_role
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def remove_member(
        self,
        workspace_id: str,
        user_id: str,
    ) -> bool:
        """
        Hard-delete a workspace membership.

        Args:
            workspace_id: Workspace UUID.
            user_id: Supabase user ID of the member to remove.

        Returns:
            True if the membership was found and deleted, False otherwise.
        """
        member = await self.get_member(workspace_id, user_id)
        if not member:
            return False
        await self.db.delete(member)
        await self.db.commit()
        return True

    # === Batch profile fetch — fixes N+1 in UpdateService ===

    async def get_profiles_for_updates(
        self,
        user_ids: list[str],
    ) -> dict[str, Profile]:
        """
        Batch-fetch profiles for a list of user IDs in a single IN query.

        Args:
            user_ids: List of Supabase user IDs to resolve.

        Returns:
            Dict keyed by profile.id for O(1) lookup in
            UpdateService._to_response_with_profile. Empty dict if
            user_ids is empty. Fixes the N+1 query that previously
            fired once per update in get_workspace_updates.
        """
        if not user_ids:
            return {}
        result = await self.db.execute(select(Profile).where(Profile.id.in_(user_ids)))
        profiles = result.scalars().all()
        return {p.id: p for p in profiles}
