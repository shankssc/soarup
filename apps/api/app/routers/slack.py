# apps/api/app/routers/slack.py
# Thin HTTP layer for Slack integration endpoints

import structlog
from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep,
    DBSessionDep,
    create_error_response,
    create_success_response,
)
from app.api.rbac import WorkspaceAdminDep
from app.schemas.slack import UpdateSlackSettingsRequest
from app.services.slack_service import SlackError, SlackService

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/workspaces",
    tags=["slack"],
)

# === Error code → HTTP status mapping ===

_SLACK_STATUS_MAP: dict[str, int] = {
    "workspace_not_found": status.HTTP_404_NOT_FOUND,
    "no_webhook": status.HTTP_400_BAD_REQUEST,
    "decrypt_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
}


def _handle_slack_error(
    e: SlackError,
    api_version: "ApiVersionDep | None" = None,
) -> Response:
    return create_error_response(
        error_code=e.error_code,
        message=e.message,
        status_code=_SLACK_STATUS_MAP.get(e.error_code, status.HTTP_400_BAD_REQUEST),
        api_version=api_version,
    )


# === Dependency injector ===


def get_slack_service(db: DBSessionDep) -> SlackService:
    return SlackService(db)


# === Endpoints ===


@router.get(
    "/{workspace_id}/slack/settings",
    status_code=status.HTTP_200_OK,
    summary="Get Slack integration settings",
)
async def get_slack_settings(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """
    Return Slack settings for the workspace.
    Webhook URL is never returned raw — hint shows last 8 chars only.
    Admin only.
    """
    try:
        result = await service.get_settings(workspace_id)
        return create_success_response(result, api_version=api_version)
    except SlackError as e:
        logger.warning(
            "get_slack_settings_failed",
            workspace_id=workspace_id,
            error_code=e.error_code,
        )
        return _handle_slack_error(e, api_version)
    except Exception as e:
        logger.exception("get_slack_settings_error", workspace_id=workspace_id, error=str(e))
        return _handle_slack_error(
            SlackError("fetch_failed", "Could not retrieve Slack settings."),
            api_version,
        )


@router.patch(
    "/{workspace_id}/slack/settings",
    status_code=status.HTTP_200_OK,
    summary="Update Slack webhook URL and notification toggles",
)
async def update_slack_settings(
    workspace_id: str,
    request: UpdateSlackSettingsRequest,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """
    Update Slack webhook URL and notification toggles.
    Passing an empty string for webhook_url clears the integration.
    Admin only.
    """
    try:
        result = await service.update_settings(workspace_id, request)
        return create_success_response(result, api_version=api_version)
    except SlackError as e:
        logger.warning(
            "update_slack_settings_failed",
            workspace_id=workspace_id,
            error_code=e.error_code,
        )
        return _handle_slack_error(e, api_version)
    except Exception as e:
        logger.exception("update_slack_settings_error", workspace_id=workspace_id, error=str(e))
        return _handle_slack_error(
            SlackError("update_failed", "Could not update Slack settings."),
            api_version,
        )


@router.post(
    "/{workspace_id}/slack/test",
    status_code=status.HTTP_200_OK,
    summary="Send a test message to the configured Slack channel",
)
async def send_test_message(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """
    Post a sample digest preview to the configured Slack channel.
    Use this to verify the webhook URL is correct after saving.
    Admin only.
    """
    try:
        result = await service.send_test_message(workspace_id)
        return create_success_response(result, api_version=api_version)
    except SlackError as e:
        logger.warning(
            "send_test_message_failed",
            workspace_id=workspace_id,
            error_code=e.error_code,
        )
        return _handle_slack_error(e, api_version)
    except Exception as e:
        logger.exception("send_test_message_error", workspace_id=workspace_id, error=str(e))
        return _handle_slack_error(
            SlackError("test_failed", "Could not send test message."),
            api_version,
        )


@router.delete(
    "/{workspace_id}/slack/settings",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove Slack integration",
)
async def remove_slack_integration(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """
    Clear the webhook URL and disable all Slack notifications.
    Admin only.
    """
    try:
        await service.update_settings(
            workspace_id,
            UpdateSlackSettingsRequest(webhook_url=""),
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except SlackError as e:
        logger.warning(
            "remove_slack_integration_failed",
            workspace_id=workspace_id,
            error_code=e.error_code,
        )
        return _handle_slack_error(e, api_version)
    except Exception as e:
        logger.exception("remove_slack_integration_error", workspace_id=workspace_id, error=str(e))
        return _handle_slack_error(
            SlackError("remove_failed", "Could not remove Slack integration."),
            api_version,
        )
