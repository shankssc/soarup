# apps/api/app/routers/workspaces.py
# Thin HTTP layer for workspace endpoints

import structlog
from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep,
    AuthDep,
    DBSessionDep,
    create_error_response,
    create_success_response,
)
from app.schemas.workspace import (
    CreateWorkspaceRequest,
    JoinWorkspaceRequest,
    WorkspaceListResponse,
    WorkspaceResponse,
)
from app.services.workspace_service import WorkspaceError, WorkspaceService

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/workspaces",
    tags=["workspaces"],
)

# === Error code → HTTP status mapping ===

_WORKSPACE_STATUS_MAP: dict[str, int] = {
    "slug_already_taken": status.HTTP_409_CONFLICT,
    "invalid_invite_code": status.HTTP_400_BAD_REQUEST,
    "already_member": status.HTTP_409_CONFLICT,
    "workspace_not_found": status.HTTP_404_NOT_FOUND,
    "fetch_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
    "create_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
}


def _handle_workspace_error(
    e: WorkspaceError,
    api_version: "ApiVersionDep | None" = None,
) -> Response:
    return create_error_response(
        error_code=e.error_code,
        message=e.message,
        status_code=_WORKSPACE_STATUS_MAP.get(e.error_code, status.HTTP_400_BAD_REQUEST),
        details=e.details,
        api_version=api_version,
    )


# === Dependency injector ===


def get_workspace_service(db: DBSessionDep) -> WorkspaceService:
    return WorkspaceService(db)


# === Endpoints ===


@router.post(
    "/",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workspace",
)
async def create_workspace(
    request: CreateWorkspaceRequest,
    user_ctx: AuthDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    """
    Create a workspace for the authenticated user.
    The caller becomes the workspace owner.
    Sets is_onboarded = True on the user's profile.
    """
    try:
        logger.info("create_workspace_attempt", user_id=user_ctx["user_id"], slug=request.slug)
        result = await service.create_workspace(user_id=user_ctx["user_id"], request=request)
        return create_success_response(result, status_code=status.HTTP_201_CREATED, api_version=api_version)
    except WorkspaceError as e:
        logger.warning("create_workspace_failed", user_id=user_ctx["user_id"], error_code=e.error_code)
        return _handle_workspace_error(e, api_version)
    except Exception as e:
        logger.exception("create_workspace_error", user_id=user_ctx["user_id"], error=str(e))
        return _handle_workspace_error(
            WorkspaceError("create_failed", "Could not create workspace. Please try again."),
            api_version,
        )


@router.post(
    "/join",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_200_OK,
    summary="Join a workspace via invite code",
)
async def join_workspace(
    request: JoinWorkspaceRequest,
    user_ctx: AuthDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    """
    Join an existing workspace using an invite code.
    Sets is_onboarded = True on the user's profile on success.

    Note: Invite code validation is stubbed — returns 400 until
    the InviteRepository is implemented in Milestone 5.
    """
    try:
        logger.info("join_workspace_attempt", user_id=user_ctx["user_id"])
        result = await service.join_workspace(
            user_id=user_ctx["user_id"],
            invite_code=request.invite_code,
        )
        return create_success_response(result, api_version=api_version)
    except WorkspaceError as e:
        logger.warning("join_workspace_failed", user_id=user_ctx["user_id"], error_code=e.error_code)
        return _handle_workspace_error(e, api_version)
    except Exception as e:
        logger.exception("join_workspace_error", user_id=user_ctx["user_id"], error=str(e))
        return _handle_workspace_error(
            WorkspaceError("create_failed", "Could not join workspace. Please try again."),
            api_version,
        )


@router.get(
    "/",
    response_model=WorkspaceListResponse,
    status_code=status.HTTP_200_OK,
    summary="List workspaces for the authenticated user",
)
async def get_workspaces(
    user_ctx: AuthDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    """
    Return all workspaces the authenticated user is a member of.
    """
    try:
        logger.info("get_workspaces_attempt", user_id=user_ctx["user_id"])
        result = await service.get_user_workspaces(user_id=user_ctx["user_id"])
        return create_success_response(result, api_version=api_version)
    except WorkspaceError as e:
        logger.warning("get_workspaces_failed", user_id=user_ctx["user_id"], error_code=e.error_code)
        return _handle_workspace_error(e, api_version)
    except Exception as e:
        logger.exception("get_workspaces_error", user_id=user_ctx["user_id"], error=str(e))
        return _handle_workspace_error(
            WorkspaceError("fetch_failed", "Could not retrieve workspaces. Please try again."),
            api_version,
        )
