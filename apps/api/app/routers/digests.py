# apps/api/app/routers/digests.py
# Thin HTTP layer for digest endpoints

import structlog
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep,
    DBSessionDep,
    create_error_response,
    create_success_response,
)
from app.api.rbac import WorkspaceAdminDep, WorkspaceMemberDep
from app.schemas.digest import (
    DigestListResponse,
    DigestPreviewResponse,
    DigestResponse,
    MyDigestPreferenceResponse,
    UpdateDigestSettingsRequest,
    UpdateMyDigestPreferenceRequest,
)
from app.services.digest_service import DigestError, DigestService

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/workspaces",
    tags=["digests"],
)

# === Error code → HTTP status mapping ===

_DIGEST_STATUS_MAP: dict[str, int] = {
    "digest_not_found": status.HTTP_404_NOT_FOUND,
    "workspace_not_found": status.HTTP_404_NOT_FOUND,
    "unauthorized": status.HTTP_403_FORBIDDEN,
    "invalid_settings": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "fetch_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
    "update_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
    "preview_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
}


def _handle_digest_error(
    e: DigestError,
    api_version: "ApiVersionDep | None" = None,
) -> Response:
    return create_error_response(
        error_code=e.error_code,
        message=e.message,
        status_code=_DIGEST_STATUS_MAP.get(e.error_code, status.HTTP_400_BAD_REQUEST),
        details=e.details,
        api_version=api_version,
    )


# === Dependency injector ===


def get_digest_service(db: DBSessionDep) -> DigestService:
    return DigestService(db)


# === Endpoints ===


@router.get(
    "/{workspace_id}/digests",
    response_model=DigestListResponse,
    status_code=status.HTTP_200_OK,
    summary="List digests for a workspace",
)
async def list_digests(
    workspace_id: str,
    user_ctx: WorkspaceMemberDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    cursor: str | None = Query(None, description="Pagination cursor from previous response"),
    limit: int = Query(20, ge=1, le=100, description="Number of digests to return"),
    service: DigestService = Depends(get_digest_service),
) -> Response:
    """
    Return a cursor-paginated list of digests for the workspace.
    Accessible to all workspace members.
    """
    try:
        logger.info(
            "list_digests_attempt",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            cursor=cursor,
            limit=limit,
        )
        result = await service.list_digests(
            workspace_id=workspace_id,
            cursor=cursor,
            limit=limit,
        )
        return create_success_response(result, api_version=api_version)
    except DigestError as e:
        logger.warning(
            "list_digests_failed",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error_code=e.error_code,
        )
        return _handle_digest_error(e, api_version)
    except Exception as e:
        logger.exception(
            "list_digests_error",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return _handle_digest_error(
            DigestError("fetch_failed", "Could not retrieve digests. Please try again."),
            api_version,
        )


@router.get(
    "/{workspace_id}/digests/{digest_id}",
    response_model=DigestResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a single digest with items",
)
async def get_digest(
    workspace_id: str,
    digest_id: str,
    user_ctx: WorkspaceMemberDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: DigestService = Depends(get_digest_service),
) -> Response:
    """
    Return a single digest with its DigestItems expanded.
    Accessible to all workspace members.
    """
    try:
        logger.info(
            "get_digest_attempt",
            workspace_id=workspace_id,
            digest_id=digest_id,
            user_id=user_ctx["user_id"],
        )
        result = await service.get_digest(
            workspace_id=workspace_id,
            digest_id=digest_id,
        )
        return create_success_response(result, api_version=api_version)
    except DigestError as e:
        logger.warning(
            "get_digest_failed",
            workspace_id=workspace_id,
            digest_id=digest_id,
            user_id=user_ctx["user_id"],
            error_code=e.error_code,
        )
        return _handle_digest_error(e, api_version)
    except Exception as e:
        logger.exception(
            "get_digest_error",
            workspace_id=workspace_id,
            digest_id=digest_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return _handle_digest_error(
            DigestError("fetch_failed", "Could not retrieve digest. Please try again."),
            api_version,
        )


@router.patch(
    "/{workspace_id}/digest-settings",
    response_model=DigestResponse,
    status_code=status.HTTP_200_OK,
    summary="Update digest settings for a workspace",
)
async def update_digest_settings(
    workspace_id: str,
    request: UpdateDigestSettingsRequest,
    user_ctx: WorkspaceAdminDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: DigestService = Depends(get_digest_service),
) -> Response:
    """
    Update digest configuration — enable/disable, send time, timezone, days.
    Requires admin role or higher.
    """
    try:
        logger.info(
            "update_digest_settings_attempt",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
        )
        result = await service.update_digest_settings(
            workspace_id=workspace_id,
            request=request,
        )
        return create_success_response(result, api_version=api_version)
    except DigestError as e:
        logger.warning(
            "update_digest_settings_failed",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error_code=e.error_code,
        )
        return _handle_digest_error(e, api_version)
    except Exception as e:
        logger.exception(
            "update_digest_settings_error",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return _handle_digest_error(
            DigestError("update_failed", "Could not update digest settings. Please try again."),
            api_version,
        )


@router.post(
    "/{workspace_id}/digests/preview",
    response_model=DigestPreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Preview digest email without sending",
)
async def preview_digest(
    workspace_id: str,
    user_ctx: WorkspaceAdminDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: DigestService = Depends(get_digest_service),
) -> Response:
    """
    Render the digest email HTML for today's updates without sending.
    Returns empty HTML if no processed updates exist for today.
    Requires admin role or higher.
    """
    try:
        logger.info(
            "preview_digest_attempt",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
        )
        result = await service.preview_digest(workspace_id=workspace_id)
        return create_success_response(result, api_version=api_version)
    except DigestError as e:
        logger.warning(
            "preview_digest_failed",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error_code=e.error_code,
        )
        return _handle_digest_error(e, api_version)
    except Exception as e:
        logger.exception(
            "preview_digest_error",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return _handle_digest_error(
            DigestError("preview_failed", "Could not generate digest preview. Please try again."),
            api_version,
        )


@router.get(
    "/{workspace_id}/digest-settings/me",
    response_model=MyDigestPreferenceResponse,
    status_code=status.HTTP_200_OK,
    summary="Get the current member's own digest notification preference",
)
async def get_my_digest_notification_preference(
    workspace_id: str,
    user_ctx: WorkspaceMemberDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: DigestService = Depends(get_digest_service),
) -> Response:
    """
    Return whether the authenticated user has digest email notifications
    enabled for this workspace. Any member can read their own
    preference — no admin gate, since this is self-service rather than
    workspace configuration.
    """
    try:
        logger.info(
            "get_my_digest_preference_attempt",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
        )
        result = await service.get_my_notification_preference(
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
        )
        return create_success_response(result, api_version=api_version)
    except DigestError as e:
        logger.warning(
            "get_my_digest_preference_failed",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error_code=e.error_code,
        )
        return _handle_digest_error(e, api_version)
    except Exception as e:
        logger.exception(
            "get_my_digest_preference_error",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return _handle_digest_error(
            DigestError("fetch_failed", "Could not retrieve notification preference. Please try again."),
            api_version,
        )


@router.patch(
    "/{workspace_id}/digest-settings/me",
    response_model=MyDigestPreferenceResponse,
    status_code=status.HTTP_200_OK,
    summary="Update the current member's own digest notification preference",
)
async def update_my_digest_notification_preference(
    workspace_id: str,
    request: UpdateMyDigestPreferenceRequest,
    user_ctx: WorkspaceMemberDep,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    service: DigestService = Depends(get_digest_service),
) -> Response:
    """
    Let the authenticated user turn their own digest emails for this
    workspace back on or off — the in-app counterpart to the one-way
    unsubscribe link. Any member can change their own preference.
    """
    try:
        logger.info(
            "update_my_digest_preference_attempt",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
        )
        result = await service.update_my_notification_preference(
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            enabled=request.email_notifications,
        )
        return create_success_response(result, api_version=api_version)
    except DigestError as e:
        logger.warning(
            "update_my_digest_preference_failed",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error_code=e.error_code,
        )
        return _handle_digest_error(e, api_version)
    except Exception as e:
        logger.exception(
            "update_my_digest_preference_error",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return _handle_digest_error(
            DigestError("update_failed", "Could not update notification preference. Please try again."),
            api_version,
        )
