# apps/api/app/routers/updates.py

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api import ApiVersionDep, DBSessionDep, OnboardedDep, create_error_response, create_success_response, handle_update_error
from app.schemas.update import SubmitUpdateRequest, UpdateUpdateRequest
from app.services.update_service import UpdateError, UpdateService

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/workspaces", tags=["updates"])


def get_update_service(db: DBSessionDep) -> UpdateService:
    return UpdateService(db)


@router.post("/{workspace_id}/updates", status_code=202)
async def submit_update(
    workspace_id: str,
    request: SubmitUpdateRequest,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Submit a new standup update. Returns 409 if already submitted today."""
    try:
        result = await service.submit_update(workspace_id, user_ctx["user_id"], request)
        return create_success_response(result, status_code=202, api_version=api_version)
    except UpdateError as e:
        return handle_update_error(e, api_version)


@router.get("/{workspace_id}/updates", status_code=200)
async def get_updates(
    workspace_id: str,
    update_date: str,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Fetch all updates for a workspace on a given date."""
    try:
        result = await service.get_workspace_updates(workspace_id, update_date)
        return create_success_response(result, api_version=api_version)
    except Exception as e:
        logger.exception("get_updates_error", workspace_id=workspace_id, error=str(e))
        return create_error_response(
            "internal_error",
            "Failed to retrieve updates",
            500,
            api_version=api_version,
        )


@router.patch("/{workspace_id}/updates/{update_id}", status_code=200)
async def edit_update(
    workspace_id: str,
    update_id: str,
    request: UpdateUpdateRequest,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Edit an existing update. Only the owner can edit."""
    try:
        result = await service.edit_update(workspace_id, user_ctx["user_id"], update_id, request)
        return create_success_response(result, api_version=api_version)
    except UpdateError as e:
        return handle_update_error(e, api_version)


@router.delete("/{workspace_id}/updates/{update_id}", status_code=204)
async def delete_update(
    workspace_id: str,
    update_id: str,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Soft-delete an update. Only the owner can delete."""
    try:
        await service.delete_update(workspace_id, user_ctx["user_id"], update_id)
    except UpdateError as e:
        return handle_update_error(e, api_version)
    return Response(status_code=204)
