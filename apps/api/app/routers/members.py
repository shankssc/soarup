# apps/api/app/routers/members.py
# Member management endpoints for workspace team administration.
#
# RBAC summary:
#   GET    /{workspace_id}/members              — any workspace member
#   PATCH  /{workspace_id}/members/{user_id}/role — owner only
#   DELETE /{workspace_id}/members/{user_id}    — admin+


from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Response, status

from app.api.dependencies import ApiVersionDep, DBSessionDep
from app.api.rbac import WorkspaceAdminDep, WorkspaceMemberDep, WorkspaceOwnerDep
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.workspace import UpdateMemberRoleRequest, WorkspaceMemberDetailResponse

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/workspaces", tags=["members"])


@router.get(
    "/{workspace_id}/members",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="List workspace members",
)
async def list_members(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceMemberDep,
    db: DBSessionDep,
) -> dict[str, Any] | Any:
    """
    Return all members with their profile data in a single JOIN query.
    Available to any workspace member.
    """
    workspace_repo = WorkspaceRepository.from_session(db)
    rows = await workspace_repo.get_workspace_members_with_profiles(workspace_id)

    members = [
        WorkspaceMemberDetailResponse(
            user_id=member.user_id,
            role=member.role,
            joined_at=member.joined_at,
            full_name=profile.full_name if profile else None,
            avatar_url=profile.avatar_url if profile else None,
        )
        for member, profile in rows
    ]

    return {"members": [m.model_dump() for m in members], "total": len(members)}


@router.patch(
    "/{workspace_id}/members/{user_id}/role",
    response_model=WorkspaceMemberDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Change a member's role (owner only)",
)
async def update_member_role(
    workspace_id: str,
    user_id: str,
    request: UpdateMemberRoleRequest,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceOwnerDep,
    db: DBSessionDep,
) -> WorkspaceMemberDetailResponse:
    """
    Change a member's role between 'admin' and 'member'.
    Only the workspace owner can call this endpoint.
    The owner role itself cannot be changed via this endpoint.
    """
    workspace_repo = WorkspaceRepository.from_session(db)

    # Prevent changing the owner's own role (self-demotion guard)
    target_member = await workspace_repo.get_member(workspace_id, user_id)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this workspace.",
        )
    if target_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The owner role cannot be changed via this endpoint.",
        )

    updated = await workspace_repo.update_member_role(workspace_id, user_id, request.role)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this workspace.",
        )

    # Fetch profile separately to build the response
    rows = await workspace_repo.get_workspace_members_with_profiles(workspace_id)
    profile_map = {member.user_id: profile for member, profile in rows}
    profile = profile_map.get(user_id)

    logger.info(
        "member_role_updated",
        workspace_id=workspace_id,
        target_user_id=user_id,
        new_role=request.role,
        changed_by=user_ctx["user_id"],
    )

    return WorkspaceMemberDetailResponse(
        user_id=updated.user_id,
        role=updated.role,
        joined_at=updated.joined_at,
        full_name=profile.full_name if profile else None,
        avatar_url=profile.avatar_url if profile else None,
    )


@router.delete(
    "/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member (admin+)",
)
async def remove_member(
    workspace_id: str,
    user_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    db: DBSessionDep,
) -> Response:
    """
    Remove a member from the workspace. Admin and owner can remove members.
    An admin cannot remove the owner. The owner cannot remove themselves
    (workspace deletion is a separate operation).
    """
    workspace_repo = WorkspaceRepository.from_session(db)

    # Prevent removing the workspace owner entirely
    target_member = await workspace_repo.get_member(workspace_id, user_id)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this workspace.",
        )
    if target_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The workspace owner cannot be removed. Transfer ownership first.",
        )

    # Admins cannot remove other admins (only owners can)
    caller_role = user_ctx.get("workspace_role", "member")
    if target_member.role == "admin" and caller_role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot remove other admins. Only the owner can.",
        )

    removed = await workspace_repo.remove_member(workspace_id, user_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this workspace.",
        )

    logger.info(
        "member_removed",
        workspace_id=workspace_id,
        removed_user_id=user_id,
        removed_by=user_ctx["user_id"],
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
