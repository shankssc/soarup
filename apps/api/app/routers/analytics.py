# apps/api/app/routers/analytics.py

import structlog
from fastapi import APIRouter
from fastapi.responses import Response

from app.api import (
    ApiVersionDep,
    DBSessionDep,
    create_error_response,
    create_success_response,
)
from app.api.rbac import WorkspaceAdminDep, WorkspaceMemberDep
from app.services.analytics_service import AnalyticsService

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/workspaces", tags=["analytics"])


@router.get("/{workspace_id}/analytics/personal", status_code=200)
async def get_personal_analytics(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceMemberDep,
    db: DBSessionDep,
) -> Response:
    """
    Personal analytics for the authenticated user.
    Returns streak + 52-week personal heatmap.
    Available to all workspace members (no admin gate).
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_personal_analytics(
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
        )
        return create_success_response(result, api_version=api_version)
    except Exception as e:
        logger.exception(
            "personal_analytics_error",
            workspace_id=workspace_id,
            error=str(e),
        )
        return create_error_response(
            "internal_error",
            "Failed to retrieve analytics",
            500,
            api_version=api_version,
        )


@router.get("/{workspace_id}/analytics/team", status_code=200)
async def get_team_analytics(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,  # admin and owner only — member gets 403
    db: DBSessionDep,
) -> Response:
    """
    Team analytics for the workspace.
    Returns participation rates, per-member stats, and workspace heatmap.
    Requires admin or owner role.
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_team_analytics(workspace_id=workspace_id)
        return create_success_response(result, api_version=api_version)
    except Exception as e:
        logger.exception(
            "team_analytics_error",
            workspace_id=workspace_id,
            error=str(e),
        )
        return create_error_response(
            "internal_error",
            "Failed to retrieve team analytics",
            500,
            api_version=api_version,
        )
