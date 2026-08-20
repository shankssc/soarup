# apps/api/tests/unit/test_slack_service.py
# Unit tests for app/services/slack_service.py
#
# Strategy:
#   - WorkspaceRepository is mocked — no real DB calls
#   - post_to_slack and crypto functions are mocked where needed
#   - Tests focus on business logic: settings masking, encryption,
#     toggle guards, error mapping, non-fatal delivery behaviour

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.slack_service import SlackError, SlackService

WORKSPACE_ID = "ws-123"
WEBHOOK_URL = "https://hooks.slack.com/services/T123/B456/abcdefghijklmnop"
WEBHOOK_HINT = f"...{WEBHOOK_URL[-8:]}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_workspace(
    slack_webhook_url_encrypted: str | None = None,
    slack_digest_enabled: bool = False,
    slack_updates_enabled: bool = False,
    name: str = "Rocket Team",
) -> MagicMock:
    ws = MagicMock()
    ws.id = WORKSPACE_ID
    ws.name = name
    ws.slack_webhook_url_encrypted = slack_webhook_url_encrypted
    ws.slack_digest_enabled = slack_digest_enabled
    ws.slack_updates_enabled = slack_updates_enabled
    return ws


def _make_service(workspace: MagicMock | None = None) -> tuple[SlackService, MagicMock]:
    db = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    service = SlackService(db)

    mock_repo = MagicMock()
    mock_repo.get_by_id = AsyncMock(return_value=workspace or _make_workspace())

    with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
        mockrepo.from_session.return_value = mock_repo
        service._mock_repo = mock_repo

    return service, mock_repo


# ---------------------------------------------------------------------------
# get_settings()
# ---------------------------------------------------------------------------


class TestGetSettings:
    @pytest.mark.asyncio
    async def test_slack_configured_false_when_no_webhook(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted=None)

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            result = await service.get_settings(WORKSPACE_ID)

        assert result.slack_configured is False
        assert result.webhook_url_hint is None

    @pytest.mark.asyncio
    async def test_slack_configured_true_when_webhook_stored(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted="encrypted-value")

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                result = await service.get_settings(WORKSPACE_ID)

        assert result.slack_configured is True

    @pytest.mark.asyncio
    async def test_webhook_hint_shows_last_8_chars(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted="encrypted-value")

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                result = await service.get_settings(WORKSPACE_ID)

        assert result.webhook_url_hint == WEBHOOK_HINT

    @pytest.mark.asyncio
    async def test_webhook_hint_none_when_decrypt_fails(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted="corrupted")

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=None,
            ):
                result = await service.get_settings(WORKSPACE_ID)

        assert result.webhook_url_hint is None

    @pytest.mark.asyncio
    async def test_raises_slack_error_when_workspace_not_found(self):
        db = MagicMock()
        service = SlackService(db)

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=None)
            with pytest.raises(SlackError) as exc_info:
                await service.get_settings(WORKSPACE_ID)

        assert exc_info.value.error_code == "workspace_not_found"

    @pytest.mark.asyncio
    async def test_returns_toggle_states(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_digest_enabled=True,
            slack_updates_enabled=False,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            result = await service.get_settings(WORKSPACE_ID)

        assert result.slack_digest_enabled is True
        assert result.slack_updates_enabled is False


# ---------------------------------------------------------------------------
# update_settings()
# ---------------------------------------------------------------------------


class TestUpdateSettings:
    @pytest.mark.asyncio
    async def test_webhook_url_encrypted_before_storage(self):
        from app.schemas.slack import UpdateSlackSettingsRequest

        db = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        service = SlackService(db)
        workspace = _make_workspace()

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(  # Noqa: SIM117
                "app.services.slack_service.encrypt_webhook_url",
                return_value="encrypted-value",
            ) as mock_encrypt:
                with patch(
                    "app.services.slack_service.decrypt_webhook_url",
                    return_value=WEBHOOK_URL,
                ):
                    await service.update_settings(
                        WORKSPACE_ID,
                        UpdateSlackSettingsRequest(webhook_url=WEBHOOK_URL),
                    )

        mock_encrypt.assert_called_once_with(WEBHOOK_URL)
        assert workspace.slack_webhook_url_encrypted == "encrypted-value"

    @pytest.mark.asyncio
    async def test_empty_webhook_url_clears_integration(self):
        from app.schemas.slack import UpdateSlackSettingsRequest

        db = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="existing",
            slack_digest_enabled=True,
            slack_updates_enabled=True,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=None,
            ):
                await service.update_settings(
                    WORKSPACE_ID,
                    UpdateSlackSettingsRequest(webhook_url=""),
                )

        assert workspace.slack_webhook_url_encrypted is None
        assert workspace.slack_digest_enabled is False
        assert workspace.slack_updates_enabled is False

    @pytest.mark.asyncio
    async def test_toggle_update_without_webhook_change(self):
        from app.schemas.slack import UpdateSlackSettingsRequest

        db = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="existing",
            slack_digest_enabled=False,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                await service.update_settings(
                    WORKSPACE_ID,
                    UpdateSlackSettingsRequest(slack_digest_enabled=True),
                )

        assert workspace.slack_digest_enabled is True
        assert workspace.slack_webhook_url_encrypted == "existing"

    @pytest.mark.asyncio
    async def test_commits_after_update(self):
        from app.schemas.slack import UpdateSlackSettingsRequest

        db = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        service = SlackService(db)
        workspace = _make_workspace()

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=None,
            ):
                await service.update_settings(
                    WORKSPACE_ID,
                    UpdateSlackSettingsRequest(slack_digest_enabled=True),
                )

        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_raises_slack_error_when_workspace_not_found(self):
        from app.schemas.slack import UpdateSlackSettingsRequest

        db = MagicMock()
        service = SlackService(db)

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=None)
            with pytest.raises(SlackError) as exc_info:
                await service.update_settings(
                    WORKSPACE_ID,
                    UpdateSlackSettingsRequest(slack_digest_enabled=True),
                )

        assert exc_info.value.error_code == "workspace_not_found"


# ---------------------------------------------------------------------------
# send_test_message()
# ---------------------------------------------------------------------------


class TestSendTestMessage:
    @pytest.mark.asyncio
    async def test_raises_slack_error_when_no_webhook_configured(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted=None)

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with pytest.raises(SlackError) as exc_info:
                await service.send_test_message(WORKSPACE_ID)

        assert exc_info.value.error_code == "no_webhook"

    @pytest.mark.asyncio
    async def test_raises_slack_error_when_decrypt_fails(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted="corrupted")

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(  # Noqa: SIM117
                "app.services.slack_service.decrypt_webhook_url",
                return_value=None,
            ):
                with pytest.raises(SlackError) as exc_info:
                    await service.send_test_message(WORKSPACE_ID)

        assert exc_info.value.error_code == "decrypt_failed"

    @pytest.mark.asyncio
    async def test_returns_success_true_when_post_succeeds(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted="encrypted")

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(  # Noqa: SIM117
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                with patch(
                    "app.services.slack_service.post_to_slack",
                    new=AsyncMock(return_value=True),
                ):
                    with patch(
                        "app.services.slack_service.build_test_blocks",
                        return_value=[],
                    ):
                        result = await service.send_test_message(WORKSPACE_ID)

        assert result.success is True

    @pytest.mark.asyncio
    async def test_returns_success_false_when_post_fails(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(slack_webhook_url_encrypted="encrypted")

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(  # Noqa: SIM117
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                with patch(
                    "app.services.slack_service.post_to_slack",
                    new=AsyncMock(return_value=False),
                ):
                    with patch(
                        "app.services.slack_service.build_test_blocks",
                        return_value=[],
                    ):
                        result = await service.send_test_message(WORKSPACE_ID)

        assert result.success is False


# ---------------------------------------------------------------------------
# post_digest_to_slack()
# ---------------------------------------------------------------------------


class TestPostDigestToSlack:
    @pytest.mark.asyncio
    async def test_returns_false_when_digest_disabled(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="encrypted",
            slack_digest_enabled=False,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            result = await service.post_digest_to_slack(
                workspace_id=WORKSPACE_ID,
                workspace_name="Rocket Team",
                digest_date="2026-06-07",
                team_summary="Great day.",
                items=[],
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_no_webhook(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted=None,
            slack_digest_enabled=True,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            result = await service.post_digest_to_slack(
                workspace_id=WORKSPACE_ID,
                workspace_name="Rocket Team",
                digest_date="2026-06-07",
                team_summary="Great day.",
                items=[],
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_decrypt_fails(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="corrupted",
            slack_digest_enabled=True,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(
                "app.services.slack_service.decrypt_webhook_url",
                return_value=None,
            ):
                result = await service.post_digest_to_slack(
                    workspace_id=WORKSPACE_ID,
                    workspace_name="Rocket Team",
                    digest_date="2026-06-07",
                    team_summary="Great day.",
                    items=[],
                )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_true_when_delivery_succeeds(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="encrypted",
            slack_digest_enabled=True,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(  # Noqa: SIM117
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                with patch(
                    "app.services.slack_service.post_to_slack",
                    new=AsyncMock(return_value=True),
                ):
                    with patch(
                        "app.services.slack_service.build_digest_blocks",
                        return_value=[],
                    ):
                        result = await service.post_digest_to_slack(
                            workspace_id=WORKSPACE_ID,
                            workspace_name="Rocket Team",
                            digest_date="2026-06-07",
                            team_summary="Great day.",
                            items=[],
                        )

        assert result is True


# ---------------------------------------------------------------------------
# post_update_notification()
# ---------------------------------------------------------------------------


class TestPostUpdateNotification:
    @pytest.mark.asyncio
    async def test_returns_false_when_updates_disabled(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="encrypted",
            slack_updates_enabled=False,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            result = await service.post_update_notification(
                workspace_id=WORKSPACE_ID,
                author_name="Alice",
                workspace_name="Rocket Team",
                update_date="2026-06-07",
                content="Did some work.",
                summary="Completed work.",
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_no_webhook(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted=None,
            slack_updates_enabled=True,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            result = await service.post_update_notification(
                workspace_id=WORKSPACE_ID,
                author_name="Alice",
                workspace_name="Rocket Team",
                update_date="2026-06-07",
                content="Did some work.",
                summary="Completed work.",
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_true_when_delivery_succeeds(self):
        db = MagicMock()
        service = SlackService(db)
        workspace = _make_workspace(
            slack_webhook_url_encrypted="encrypted",
            slack_updates_enabled=True,
        )

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=workspace)
            with patch(  # Noqa: SIM117
                "app.services.slack_service.decrypt_webhook_url",
                return_value=WEBHOOK_URL,
            ):
                with patch(
                    "app.services.slack_service.post_to_slack",
                    new=AsyncMock(return_value=True),
                ):
                    with patch(
                        "app.services.slack_service.build_update_notification_blocks",
                        return_value=[],
                    ):
                        result = await service.post_update_notification(
                            workspace_id=WORKSPACE_ID,
                            author_name="Alice",
                            workspace_name="Rocket Team",
                            update_date="2026-06-07",
                            content="Did some work.",
                            summary="Completed work.",
                        )

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_workspace_not_found(self):
        db = MagicMock()
        service = SlackService(db)

        with patch("app.services.slack_service.WorkspaceRepository") as mockrepo:
            mockrepo.from_session.return_value.get_by_id = AsyncMock(return_value=None)
            result = await service.post_update_notification(
                workspace_id=WORKSPACE_ID,
                author_name="Alice",
                workspace_name="Rocket Team",
                update_date="2026-06-07",
                content="Did some work.",
                summary="Completed work.",
            )

        assert result is False
