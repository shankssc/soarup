# apps/api/app/api/rbac.py
# Role-based access control helpers.
#
# Used as FastAPI dependencies on endpoints that require a specific workspace
# role. Reads workspace_id from the request path parameter — only works on
# routes with {workspace_id} in the URL. Endpoints with a different path shape
# need a custom dependency (known tradeoff, documented in M5 spec).
#
# Role hierarchy: owner > admin > member
# A check for "admin" passes for both owner and admin.

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

import structlog
from fastapi import Depends, HTTPException, status

from app.api.dependencies import DBSessionDep, OnboardedDep
from app.repositories.workspace_repo import WorkspaceRepository

logger = structlog.get_logger(__name__)

ROLE_HIERARCHY: dict[str, int] = {"owner": 3, "admin": 2, "member": 1}


def _check_role(member_role: str, required_role: str) -> bool:
    """Return True if member_role satisfies the required_role threshold."""
    return ROLE_HIERARCHY.get(member_role, 0) >= ROLE_HIERARCHY.get(required_role, 0)


def require_workspace_role(required_role: str) -> Callable[..., Coroutine[Any, Any, dict[str, Any]]]:
    """
    Dependency factory — verifies the current user holds at least
    `required_role` in the workspace identified by the {workspace_id}
    path parameter.

    Injects the full user context dict augmented with "workspace_role" so
    downstream handlers can inspect the caller's role without a second DB hit.

    Usage:
        @router.delete(
            "/{workspace_id}/members/{user_id}",
            dependencies=[Depends(require_workspace_role("admin"))],
        )

    Or to also receive the enriched context:
        async def handler(user_ctx: WorkspaceAdminDep): ...
    """

    async def checker(
        workspace_id: str,
        user_ctx: OnboardedDep,
        db: DBSessionDep,
    ) -> dict[str, Any]:
        workspace_repo = WorkspaceRepository.from_session(db)
        member = await workspace_repo.get_member(workspace_id, user_ctx["user_id"])

        if not member:
            logger.warning(
                "rbac_non_member",
                workspace_id=workspace_id,
                user_id=user_ctx["user_id"],
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace.",
            )

        if not _check_role(member.role, required_role):
            logger.warning(
                "rbac_insufficient_role",
                workspace_id=workspace_id,
                user_id=user_ctx["user_id"],
                member_role=member.role,
                required_role=required_role,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires {required_role} role or higher.",
            )

        return {**user_ctx, "workspace_role": member.role}

    return checker


# Capture the checker functions at module load time — these are the exact
# objects FastAPI registers as dependencies. Exposing them allows tests to
# override them via app.dependency_overrides without needing lru_cache.
_member_checker = require_workspace_role("member")
_admin_checker = require_workspace_role("admin")
_owner_checker = require_workspace_role("owner")

# ---------------------------------------------------------------------------
# Convenience type aliases — use these in router signatures
# ---------------------------------------------------------------------------

WorkspaceMemberDep = Annotated[dict[str, Any], Depends(_member_checker)]
WorkspaceAdminDep = Annotated[dict[str, Any], Depends(_admin_checker)]
WorkspaceOwnerDep = Annotated[dict[str, Any], Depends(_owner_checker)]
