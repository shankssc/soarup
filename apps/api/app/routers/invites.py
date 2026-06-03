# apps/api/app/routers/invites.py
#
# Endpoint summary:
#   POST   /workspaces/{id}/invites           — any member (open, see tradeoff note)
#   GET    /workspaces/{id}/invites           — admin+
#   DELETE /workspaces/{id}/invites/{inv_id} — admin+
#   GET    /invites/{code}                   — public (no auth)
#   POST   /invites/{code}/accept            — authenticated user

from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Response, status

from app.api.dependencies import ApiVersionDep, DBSessionDep, OnboardedDep
from app.api.rbac import WorkspaceAdminDep
from app.repositories.invite_repo import InviteRepository
from app.schemas.invite import (
    CreateInviteRequest,
    InviteResponse,
    PendingInviteResponse,
)
from app.services.invite_service import InviteError, InviteService

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["invites"])

# ---------------------------------------------------------------------------
# Error code → HTTP status mapping
# ---------------------------------------------------------------------------

_INVITE_ERROR_STATUS: dict[str, int] = {
    "workspace_not_found": status.HTTP_404_NOT_FOUND,
    "invite_not_found": status.HTTP_404_NOT_FOUND,
    "invite_already_used": status.HTTP_410_GONE,
    "invite_expired": status.HTTP_410_GONE,
    "already_member": status.HTTP_409_CONFLICT,
}


def _invite_http(err: InviteError) -> HTTPException:
    code = _INVITE_ERROR_STATUS.get(err.error_code, status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=code, detail=err.message)


# ---------------------------------------------------------------------------
# Workspace-scoped invite endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/invites",
    response_model=InviteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and send a workspace invite",
)
async def create_invite(
    workspace_id: str,
    request: CreateInviteRequest,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,  # open to any member — see M5 known tradeoff
    db: DBSessionDep,
) -> InviteResponse:
    """
    Create a single-use invite and deliver it via email (Resend).
    Any workspace member may invite — this is a deliberate M5 tradeoff.
    Tightening to admin+ requires only swapping OnboardedDep → WorkspaceAdminDep.
    """
    service = InviteService(db)
    try:
        return await service.create_invite(workspace_id, user_ctx["user_id"], request)
    except InviteError as e:
        raise _invite_http(e) from e


@router.get(
    "/workspaces/{workspace_id}/invites",
    status_code=status.HTTP_200_OK,
    summary="List pending invites (admin+)",
)
async def list_pending_invites(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    db: DBSessionDep,
) -> dict[str, Any]:
    invite_repo = InviteRepository.from_session(db)
    invites = await invite_repo.get_pending_by_workspace(workspace_id)
    items = [PendingInviteResponse.model_validate(inv) for inv in invites]
    return {"invites": [i.model_dump() for i in items], "total": len(items)}


@router.delete(
    "/workspaces/{workspace_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke a pending invite (admin+)",
)
async def revoke_invite(
    workspace_id: str,
    invite_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    db: DBSessionDep,
) -> Response:
    invite_repo = InviteRepository.from_session(db)
    invite = await invite_repo.get_by_id(invite_id)

    if not invite or invite.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found.",
        )
    if invite.is_used:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invite is already used or revoked.",
        )

    await invite_repo.revoke(invite)
    logger.info(
        "invite_revoked",
        invite_id=invite_id,
        workspace_id=workspace_id,
        revoked_by=user_ctx["user_id"],
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Public / acceptance endpoints (no workspace_id prefix)
# ---------------------------------------------------------------------------


@router.get(
    "/invites/{code}",
    status_code=status.HTTP_200_OK,
    summary="Get invite details (public — no auth required)",
)
async def get_invite_details(
    code: str,
    api_version: ApiVersionDep,
    db: DBSessionDep,
) -> dict[str, Any]:
    """
    Returns workspace name, inviter name, email, expiry, and validity.
    Used by the /invite/:code page to render the appropriate state
    before the user logs in or signs up.
    """
    service = InviteService(db)
    try:
        details = await service.get_invite_details(code)
        return details.model_dump()
    except InviteError as e:
        raise _invite_http(e) from e


@router.post(
    "/invites/{code}/accept",
    status_code=status.HTTP_200_OK,
    summary="Accept an invite and join the workspace",
)
async def accept_invite(
    code: str,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> dict[str, Any]:
    """
    Validates the invite, adds the authenticated user to the workspace,
    and marks the invite as used. Returns workspace_id for redirect.
    """
    service = InviteService(db)
    try:
        workspace_id = await service.accept_invite(
            code=code,
            user_id=user_ctx["user_id"],
            user_email=user_ctx["email"],
        )
        return {"workspace_id": workspace_id}
    except InviteError as e:
        raise _invite_http(e) from e
