# apps/api/app/services/workspace_service.py
# Async business logic layer for workspace management

from typing import Any

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.profile_repo import ProfileRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.workspace import (
    CreateWorkspaceRequest,
    WorkspaceListResponse,
    WorkspaceResponse,
)

logger = structlog.get_logger(__name__)


class WorkspaceError(Exception):
    """Base exception for workspace service errors."""

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


class WorkspaceService:
    """
    Async service layer for workspace business logic.

    Responsibilities:
    - Validate business rules (slug uniqueness, membership constraints)
    - Orchestrate workspace + profile repository calls in a single transaction
    - Set is_onboarded = True after successful workspace creation/join
    - Map domain errors to WorkspaceError

    This layer does NOT:
    - Handle HTTP status codes or headers (router responsibility)
    - Accept raw request bodies directly from HTTP (router passes validated schemas)
    - Allow the client to set is_onboarded directly (owned here, not by UpdateProfileRequest)
    """

    def __init__(self, db_session: AsyncSession):
        """
        Initialize WorkspaceService.

        Args:
            db_session: Async SQLAlchemy session. The service owns the
                        transaction boundary — commit happens here, not in repos.
        """
        self.db = db_session
        self._workspace_repo: WorkspaceRepository | None = None
        self._profile_repo: ProfileRepository | None = None

    def _get_workspace_repo(self) -> WorkspaceRepository:
        if self._workspace_repo is None:
            self._workspace_repo = WorkspaceRepository.from_session(self.db)
        return self._workspace_repo

    def _get_profile_repo(self) -> ProfileRepository:
        if self._profile_repo is None:
            self._profile_repo = ProfileRepository.from_session(self.db)
        return self._profile_repo

    async def create_workspace(
        self,
        user_id: str,
        request: CreateWorkspaceRequest,
    ) -> WorkspaceResponse:
        """
        Create a new workspace and mark the user as onboarded.

        Steps:
        1. Check slug uniqueness — raise 409 if taken.
        2. Create workspace row.
        3. Add creator as 'owner' member.
        4. Set profiles.is_onboarded = True.
        5. Commit the transaction — all four writes are atomic.
        6. Return WorkspaceResponse.

        Args:
            user_id: Supabase user ID of the creating user.
            request: Validated CreateWorkspaceRequest from the router.

        Returns:
            WorkspaceResponse for the newly created workspace.

        Raises:
            WorkspaceError: slug_already_taken (409), or internal errors.
        """
        workspace_repo = self._get_workspace_repo()
        profile_repo = self._get_profile_repo()

        # 1. Slug uniqueness check
        if await workspace_repo.slug_exists(request.slug):
            raise WorkspaceError(
                error_code="slug_already_taken",
                message=f"The slug '{request.slug}' is already taken. Please choose a different one.",
                details={"slug": request.slug},
            )

        try:
            # 2. Create workspace (flush, not commit — we own the transaction)
            workspace = await workspace_repo.create(
                owner_id=user_id,
                name=request.name,
                slug=request.slug,
            )

            # 3. Add creator as owner member
            await workspace_repo.add_member(
                workspace_id=workspace.id,
                user_id=user_id,
                role="owner",
                invited_by=None,
            )

            # 4. Set is_onboarded = True
            # We set this directly rather than going through UpdateProfileRequest
            # to prevent the client from controlling this flag.
            await profile_repo.update(user_id, {"is_onboarded": True})

            # 5. Single commit — all writes land together or none do
            await self.db.commit()
            await self.db.refresh(workspace)

            logger.info(
                "workspace_created",
                workspace_id=workspace.id,
                slug=workspace.slug,
                user_id=user_id,
            )

            # 6. Return response
            return WorkspaceResponse(
                id=workspace.id,
                name=workspace.name,
                slug=workspace.slug,
                owner_id=workspace.owner_id,
                plan=workspace.plan,
                created_at=workspace.created_at,
            )

        except IntegrityError:
            # Race condition: slug was available during check but taken before insert
            await self.db.rollback()
            raise WorkspaceError(  # Noqa: B904
                error_code="slug_already_taken",
                message=f"The slug '{request.slug}' is already taken. Please choose a different one.",
                details={"slug": request.slug},
            )
        except WorkspaceError:
            raise
        except Exception as e:
            await self.db.rollback()
            logger.exception(
                "workspace_create_failed",
                user_id=user_id,
                slug=request.slug,
                error=str(e),
            )
            raise WorkspaceError(
                error_code="create_failed",
                message="Could not create workspace. Please try again.",
            ) from e

    async def join_workspace(
        self,
        user_id: str,
        invite_code: str,
    ) -> WorkspaceResponse:
        """
        Join a workspace via invite code and mark the user as onboarded.

        Note: Full invite validation (InviteRepository) is a future milestone.
        For now, all codes return invalid_invite_code. This stub lets the
        endpoint exist, the frontend wire up, and tests be written against
        the expected error contract.

        Args:
            user_id: Supabase user ID of the joining user.
            invite_code: Invite code from the workspace invite link.

        Raises:
            WorkspaceError: invalid_invite_code (400) always, until
                            InviteRepository is implemented.
        """
        logger.info(
            "workspace_join_attempt",
            user_id=user_id,
            invite_code_prefix=invite_code[:6] + "..." if len(invite_code) > 6 else invite_code,
        )

        # Stub: invite validation not yet implemented (Milestone 5).
        # Return a clear error rather than silently accepting codes.
        raise WorkspaceError(
            error_code="invalid_invite_code",
            message="Invite code is invalid or has expired.",
            details={"hint": "Workspace invites are not yet enabled. Create a workspace instead."},
        )

    async def get_user_workspaces(self, user_id: str) -> WorkspaceListResponse:
        """
        Return all workspaces the authenticated user belongs to.

        Args:
            user_id: Supabase user ID.

        Returns:
            WorkspaceListResponse wrapping a list of WorkspaceResponse objects.
        """
        workspace_repo = self._get_workspace_repo()

        try:
            workspaces = await workspace_repo.get_user_workspaces(user_id)

            return WorkspaceListResponse(
                data=[
                    WorkspaceResponse(
                        id=w.id,
                        name=w.name,
                        slug=w.slug,
                        owner_id=w.owner_id,
                        plan=w.plan,
                        created_at=w.created_at,
                    )
                    for w in workspaces
                ]
            )

        except Exception as e:
            logger.exception("get_user_workspaces_failed", user_id=user_id, error=str(e))
            raise WorkspaceError(
                error_code="fetch_failed",
                message="Could not retrieve workspaces. Please try again.",
            ) from e
