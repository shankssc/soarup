# apps/api/app/services/slack_service.py

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.lib.slack import post_to_slack
from app.lib.slack_blocks import (
    build_digest_blocks,
    build_test_blocks,
    build_update_notification_blocks,
)
from app.lib.slack_crypto import decrypt_webhook_url, encrypt_webhook_url
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.slack import (
    SlackSettingsResponse,
    SlackTestResponse,
    UpdateSlackSettingsRequest,
)

logger = structlog.get_logger(__name__)


class SlackError(Exception):
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)


class SlackService:
    """
    Async service layer for Slack integration.

    Responsibilities:
    - Manage Slack webhook URL storage (encrypted at rest via Fernet)
    - Build and deliver Block Kit messages for digests and update notifications
    - Expose settings management and test message delivery for admin configuration

    This layer should NOT contain:
    - Block Kit structure definitions (see app.lib.slack_blocks)
    - Raw HTTP calls to Slack incoming webhooks (see app.lib.slack)
    - Encryption primitives (see app.lib.slack_crypto)
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(self, workspace_id: str) -> SlackSettingsResponse:
        """Return Slack settings for the workspace. Webhook URL is never returned raw — hint shows last 8 chars only."""

        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)
        if not workspace:
            raise SlackError("workspace_not_found", "Workspace not found.")

        webhook_hint = None
        if workspace.slack_webhook_url_encrypted:
            decrypted = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
            if decrypted:
                webhook_hint = f"...{decrypted[-8:]}"

        return SlackSettingsResponse(
            slack_configured=bool(workspace.slack_webhook_url_encrypted),
            slack_digest_enabled=workspace.slack_digest_enabled,
            slack_updates_enabled=workspace.slack_updates_enabled,
            webhook_url_hint=webhook_hint,
        )

    async def update_settings(
        self,
        workspace_id: str,
        request: UpdateSlackSettingsRequest,
    ) -> SlackSettingsResponse:
        """
        Update Slack webhook URL and notification toggles.
        Passing an empty string for webhook_url clears the integration entirely
        and disables all toggles.
        """

        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)
        if not workspace:
            raise SlackError("workspace_not_found", "Workspace not found.")

        if request.webhook_url is not None:
            if request.webhook_url == "":
                # Empty string = remove integration
                workspace.slack_webhook_url_encrypted = None
                workspace.slack_digest_enabled = False
                workspace.slack_updates_enabled = False
            else:
                workspace.slack_webhook_url_encrypted = encrypt_webhook_url(request.webhook_url)

        if request.slack_digest_enabled is not None:
            workspace.slack_digest_enabled = request.slack_digest_enabled
        if request.slack_updates_enabled is not None:
            workspace.slack_updates_enabled = request.slack_updates_enabled

        await self.db.commit()
        await self.db.refresh(workspace)

        return await self.get_settings(workspace_id)

    async def send_test_message(self, workspace_id: str) -> SlackTestResponse:
        """
        Post a sample digest preview to the configured Slack channel.
        Returns success=False (non-raising) if delivery fails — caller
        surfaces the message to the admin via the UI.
        """

        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)

        if not workspace or not workspace.slack_webhook_url_encrypted:
            raise SlackError(
                "no_webhook",
                "No Slack webhook URL configured. Add one above and save first.",
            )

        webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
        if not webhook_url:
            raise SlackError(
                "decrypt_failed",
                "Could not read the webhook URL. " "Please re-enter and save the webhook URL.",
            )

        blocks = build_test_blocks(
            workspace_name=workspace.name,
            app_url=settings.app_base_url,
        )
        success = await post_to_slack(
            webhook_url=webhook_url,
            blocks=blocks,
            fallback_text=f"🧪 Test message from SoarUp — {workspace.name}",
        )

        if success:
            return SlackTestResponse(
                success=True,
                message="Test message sent successfully. Check your Slack channel.",
            )
        else:  # Noqa: RET505
            return SlackTestResponse(
                success=False,
                message=("Failed to send test message. " "Check that the webhook URL is correct and the Slack app " "is still installed in your workspace."),
            )

    async def post_digest_to_slack(
        self,
        workspace_id: str,
        workspace_name: str,
        digest_date: str,
        team_summary: str,
        items: list[dict[str, Any]],
    ) -> bool:
        """
        Post the daily digest to Slack after email delivery.
        Returns True if delivered, False on any failure (non-fatal).
        No-ops silently if slack_digest_enabled=False or no webhook configured.
        """
        """
        Called from the digest Celery task after email delivery.
        Returns True if delivered, False on any failure (non-fatal).
        """
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)

        if not workspace or not workspace.slack_digest_enabled:
            return False
        if not workspace.slack_webhook_url_encrypted:
            return False

        webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
        if not webhook_url:
            logger.error("slack_digest_decrypt_failed", workspace_id=workspace_id)
            return False

        blocks = build_digest_blocks(
            workspace_name=workspace_name,
            digest_date=digest_date,
            team_summary=team_summary,
            items=items,
            app_url=settings.app_base_url,
        )
        return await post_to_slack(
            webhook_url=webhook_url,
            blocks=blocks,
            fallback_text=f"🚀 {workspace_name} standup digest — {digest_date}",
        )

    async def post_update_notification(
        self,
        workspace_id: str,
        author_name: str,
        workspace_name: str,
        update_date: str,
        content: str,
        summary: str,
        mode: str = "text",
    ) -> bool:
        """
        Post an individual update notification after AI summarisation completes.
        Returns True if delivered, False on any failure (non-fatal).
        No-ops silently if slack_updates_enabled=False or no webhook configured.
        """
        """
        Called from process_update / process_audio_update Celery tasks
        after AI summarisation is complete.
        Returns True if delivered, False on any failure (non-fatal).
        """
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)

        if not workspace or not workspace.slack_updates_enabled:
            return False
        if not workspace.slack_webhook_url_encrypted:
            return False

        webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
        if not webhook_url:
            return False

        blocks = build_update_notification_blocks(
            author_name=author_name,
            workspace_name=workspace_name,
            update_date=update_date,
            content=content,
            summary=summary,
            app_url=settings.app_base_url,
            mode=mode,
        )
        return await post_to_slack(
            webhook_url=webhook_url,
            blocks=blocks,
            fallback_text=(f"📝 {author_name} submitted their standup — {workspace_name}"),
        )
