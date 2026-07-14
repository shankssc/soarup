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
from fastapi import APIRouter, Response, status

from app.api import create_error_response
from app.api.dependencies import ApiVersionDep, AuthDep, DBSessionDep
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


def handle_invite_error(err: InviteError, api_version: Any) -> Response:
    """
    Maps InviteError to the standard {error, message, details} envelope
    used by every other router's ERROR path (create_error_response) —
    NOT a raw HTTPException. apiClient.ts parses errBody.error /
    errBody.message specifically; a raw HTTPException's {"detail": "..."}
    shape has neither field, so the frontend previously received an
    empty error message on every invite-related failure (already_member,
    invite_expired, etc.) regardless of whether the backend logic was
    correct.

    NOTE: this is deliberately NOT paired with create_success_response
    on the success side of these endpoints — unlike updates.py/auth.py,
    the invite frontend hooks (useInviteDetails, useAcceptInvite,
    useCreateInvite in useInviteMembers.ts) expect BARE response bodies
    with no {data: ...} envelope, matching how these endpoints already
    worked before this fix. Only the error shape was actually broken;
    wrapping the success responses too would silently break those three
    hooks, which don't unwrap .data the way useWorkspace.ts does.
    """
    code = _INVITE_ERROR_STATUS.get(err.error_code, status.HTTP_400_BAD_REQUEST)
    return create_error_response(
        error_code=err.error_code,
        message=err.message,
        status_code=code,
        api_version=api_version,
    )


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
    user_ctx: WorkspaceAdminDep,
    db: DBSessionDep,
) -> InviteResponse | Response:
    """
    Create a single-use invite and deliver it via email (Resend).
    Any workspace member may invite — this is a deliberate M5 tradeoff.
    Tightening to admin+ requires only swapping OnboardedDep → WorkspaceAdminDep.
    """
    service = InviteService(db)
    try:
        return await service.create_invite(workspace_id, user_ctx["user_id"], request)
    except InviteError as e:
        return handle_invite_error(e, api_version)


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
        return create_error_response(
            error_code="invite_not_found",
            message="Invite not found.",
            status_code=status.HTTP_404_NOT_FOUND,
            api_version=api_version,
        )
    if invite.is_used:
        return create_error_response(
            error_code="invite_already_used",
            message="Invite is already used or revoked.",
            status_code=status.HTTP_410_GONE,
            api_version=api_version,
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
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get invite details (public — no auth required)",
)
async def get_invite_details(
    code: str,
    api_version: ApiVersionDep,
    db: DBSessionDep,
) -> dict[str, Any] | Response:
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
        return handle_invite_error(e, api_version)


@router.post(
    "/invites/{code}/accept",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Accept an invite and join the workspace",
)
async def accept_invite(
    code: str,
    api_version: ApiVersionDep,
    user_ctx: AuthDep,
    db: DBSessionDep,
) -> dict[str, Any] | Response:
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
        return handle_invite_error(e, api_version)
