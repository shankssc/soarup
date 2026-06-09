# apps/api/tests/unit/test_digest_service.py
# Unit tests for DigestService.
#
# Strategy:
#   - All repositories are mocked — no real DB calls
#   - Claude (summarise) and email (render_digest_email) are mocked
#     where preview_digest is tested
#   - Tests focus on business logic: error mapping, data transformation,
#     conditional branches, fallback behavior

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.digest import UpdateDigestSettingsRequest
from app.services.digest_service import DigestError, DigestService

pytestmark = pytest.mark.asyncio

WORKSPACE_ID = str(uuid.uuid4())
DIGEST_ID = str(uuid.uuid4())
UPDATE_ID = str(uuid.uuid4())
USER_ID = str(uuid.uuid4())
TODAY = "2026-06-07"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_digest(
    digest_id: str = DIGEST_ID,
    status: str = "sent",
    summary: str | None = "Great progress.",
    update_count: int = 2,
) -> MagicMock:
    d = MagicMock()
    d.id = digest_id
    d.workspace_id = WORKSPACE_ID
    d.digest_date = TODAY
    d.summary = summary
    d.status = status
    d.update_count = update_count
    d.email_sent_at = datetime.now(UTC)
    d.created_at = datetime.now(UTC)
    return d


def _make_mock_workspace(
    workspace_id: str = WORKSPACE_ID,
    name: str = "Test Workspace",
    digest_prompt: str | None = None,
) -> MagicMock:
    ws = MagicMock()
    ws.id = workspace_id
    ws.name = name
    ws.digest_prompt = digest_prompt
    ws.digest_enabled = False
    ws.digest_send_time = "09:00"
    ws.digest_timezone = None
    ws.digest_days = "1,2,3,4,5"
    return ws


def _make_mock_update(
    update_id: str | None = None,
    user_id: str = USER_ID,
    status: str = "processed",
    content: str = "Worked on feature X",
    summary: str | None = "Feature X progress",
) -> MagicMock:
    u = MagicMock()
    u.id = update_id or str(uuid.uuid4())
    u.user_id = user_id
    u.status = status
    u.content = content
    u.summary = summary
    return u


def _make_mock_profile(
    user_id: str = USER_ID,
    full_name: str = "Test User",
    email: str = "test@example.com",
    email_notifications: bool = True,
) -> MagicMock:
    p = MagicMock()
    p.id = user_id
    p.full_name = full_name
    p.email = email
    p.email_notifications = email_notifications
    return p


def _make_mock_digest_item(
    digest_id: str = DIGEST_ID,
    update_id: str = UPDATE_ID,
) -> MagicMock:
    item = MagicMock()
    item.id = str(uuid.uuid4())
    item.digest_id = digest_id
    item.update_id = update_id
    item.author_name = "Test User"
    item.summary_snapshot = "Feature X progress"
    return item


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    return db


@pytest.fixture
def service(mock_db):
    return DigestService(mock_db)


@pytest.fixture
def mock_digest_repo():
    repo = MagicMock()
    repo.get_workspace_digests = AsyncMock(return_value=([], None, 0))
    repo.get_by_id = AsyncMock(return_value=None)
    repo.get_for_workspace_date = AsyncMock(return_value=None)
    repo.create = AsyncMock(return_value=_make_mock_digest(status="pending"))
    repo.update_status = AsyncMock(return_value=_make_mock_digest())
    repo.add_items = AsyncMock(return_value=[])
    repo.get_items = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def mock_workspace_repo():
    repo = MagicMock()
    repo.get_by_id = AsyncMock(return_value=_make_mock_workspace())
    repo.update = AsyncMock(return_value=_make_mock_workspace())
    repo.get_workspace_members_with_profiles = AsyncMock(return_value=[])
    repo.get_profiles_for_updates = AsyncMock(return_value={})
    return repo


@pytest.fixture
def mock_update_repo():
    repo = MagicMock()
    repo.get_workspace_updates_for_date = AsyncMock(return_value=[])
    return repo


def _inject_repos(service, digest_repo, workspace_repo, update_repo):
    """Inject mock repos directly into service's lazy-load slots."""
    service._digest_repo = digest_repo
    service._workspace_repo = workspace_repo
    service._update_repo = update_repo


# ---------------------------------------------------------------------------
# list_digests()
# ---------------------------------------------------------------------------


class TestListDigests:
    async def test_returns_digest_list_response(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        digest = _make_mock_digest()
        mock_digest_repo.get_workspace_digests = AsyncMock(return_value=([digest], None, 1))
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.list_digests(WORKSPACE_ID)

        assert result.total == 1
        assert len(result.digests) == 1
        assert result.digests[0].id == DIGEST_ID
        assert result.next_cursor is None

    async def test_passes_cursor_and_limit_to_repo(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        await service.list_digests(WORKSPACE_ID, cursor="some-cursor", limit=5)

        mock_digest_repo.get_workspace_digests.assert_called_once_with(
            workspace_id=WORKSPACE_ID,
            cursor="some-cursor",
            limit=5,
        )

    async def test_returns_empty_list_when_no_digests(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.list_digests(WORKSPACE_ID)

        assert result.total == 0
        assert result.digests == []

    async def test_raises_digest_error_on_repo_failure(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_digest_repo.get_workspace_digests = AsyncMock(side_effect=Exception("DB down"))
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        with pytest.raises(DigestError) as exc_info:
            await service.list_digests(WORKSPACE_ID)

        assert exc_info.value.error_code == "fetch_failed"

    async def test_forwards_next_cursor(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        digest = _make_mock_digest()
        mock_digest_repo.get_workspace_digests = AsyncMock(return_value=([digest], "cursor-abc", 5))
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.list_digests(WORKSPACE_ID, limit=1)

        assert result.next_cursor == "cursor-abc"
        assert result.total == 5


# ---------------------------------------------------------------------------
# get_digest()
# ---------------------------------------------------------------------------


class TestGetDigest:
    async def test_returns_digest_with_items(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        digest = _make_mock_digest()
        item = _make_mock_digest_item()
        mock_digest_repo.get_by_id = AsyncMock(return_value=digest)
        mock_digest_repo.get_items = AsyncMock(return_value=[item])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.get_digest(WORKSPACE_ID, DIGEST_ID)

        assert result.id == DIGEST_ID
        assert len(result.items) == 1
        assert result.items[0].author_name == "Test User"

    async def test_raises_not_found_when_digest_missing(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_digest_repo.get_by_id = AsyncMock(return_value=None)
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        with pytest.raises(DigestError) as exc_info:
            await service.get_digest(WORKSPACE_ID, DIGEST_ID)

        assert exc_info.value.error_code == "digest_not_found"

    async def test_raises_not_found_when_digest_belongs_to_different_workspace(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        digest = _make_mock_digest()
        digest.workspace_id = "different-workspace-id"
        mock_digest_repo.get_by_id = AsyncMock(return_value=digest)
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        with pytest.raises(DigestError) as exc_info:
            await service.get_digest(WORKSPACE_ID, DIGEST_ID)

        assert exc_info.value.error_code == "digest_not_found"

    async def test_returns_empty_items_when_none_exist(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        digest = _make_mock_digest()
        mock_digest_repo.get_by_id = AsyncMock(return_value=digest)
        mock_digest_repo.get_items = AsyncMock(return_value=[])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.get_digest(WORKSPACE_ID, DIGEST_ID)

        assert result.items == []


# ---------------------------------------------------------------------------
# update_digest_settings()
# ---------------------------------------------------------------------------


class TestUpdateDigestSettings:
    async def test_updates_digest_enabled(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        await service.update_digest_settings(WORKSPACE_ID, request)

        mock_workspace_repo.update.assert_called_once_with(WORKSPACE_ID, {"digest_enabled": True})

    async def test_updates_multiple_fields(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(
            digest_enabled=True,
            digest_send_time="10:00",
            digest_days="1,2,3",
        )

        await service.update_digest_settings(WORKSPACE_ID, request)

        call_args = mock_workspace_repo.update.call_args[0][1]
        assert call_args["digest_enabled"] is True
        assert call_args["digest_send_time"] == "10:00"
        assert call_args["digest_days"] == "1,2,3"

    async def test_skips_none_fields(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        """Fields not provided in request are not passed to repo.update."""
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        await service.update_digest_settings(WORKSPACE_ID, request)

        call_args = mock_workspace_repo.update.call_args[0][1]
        assert "digest_send_time" not in call_args
        assert "digest_timezone" not in call_args
        assert "digest_days" not in call_args

    async def test_commits_after_update(self, service, mock_db, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        await service.update_digest_settings(WORKSPACE_ID, request)

        mock_db.commit.assert_called_once()

    async def test_raises_not_found_when_workspace_missing(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_workspace_repo.get_by_id = AsyncMock(return_value=None)
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        with pytest.raises(DigestError) as exc_info:
            await service.update_digest_settings(WORKSPACE_ID, request)

        assert exc_info.value.error_code == "workspace_not_found"

    async def test_raises_update_failed_on_repo_error(self, service, mock_db, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_workspace_repo.update = AsyncMock(side_effect=Exception("DB error"))
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        with pytest.raises(DigestError) as exc_info:
            await service.update_digest_settings(WORKSPACE_ID, request)

        assert exc_info.value.error_code == "update_failed"
        mock_db.rollback.assert_called_once()

    async def test_returns_most_recent_digest_when_exists(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        digest = _make_mock_digest()
        mock_digest_repo.get_workspace_digests = AsyncMock(return_value=([digest], None, 1))
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        result = await service.update_digest_settings(WORKSPACE_ID, request)

        assert result.id == DIGEST_ID

    async def test_returns_placeholder_when_no_digests_exist(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_digest_repo.get_workspace_digests = AsyncMock(return_value=([], None, 0))
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)
        request = UpdateDigestSettingsRequest(digest_enabled=True)

        result = await service.update_digest_settings(WORKSPACE_ID, request)

        assert result.id == ""
        assert result.workspace_id == WORKSPACE_ID
        assert result.status == "pending"


# ---------------------------------------------------------------------------
# preview_digest()
# ---------------------------------------------------------------------------


class TestPreviewDigest:
    async def test_returns_empty_html_when_no_processed_updates(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.preview_digest(WORKSPACE_ID)

        assert result.html == ""
        assert result.update_count == 0

    async def test_filters_out_non_processed_updates(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        """Only updates with status='processed' are included."""
        pending_update = _make_mock_update(status="pending")
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[pending_update])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.preview_digest(WORKSPACE_ID)

        assert result.html == ""
        assert result.update_count == 0

    async def test_raises_not_found_when_workspace_missing(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        mock_workspace_repo.get_by_id = AsyncMock(return_value=None)
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        with pytest.raises(DigestError) as exc_info:
            await service.preview_digest(WORKSPACE_ID)

        assert exc_info.value.error_code == "workspace_not_found"

    async def test_builds_would_send_to_from_members(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        profile = _make_mock_profile(email="alice@example.com")
        mock_workspace_repo.get_workspace_members_with_profiles = AsyncMock(return_value=[(MagicMock(), profile)])
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.preview_digest(WORKSPACE_ID)

        assert "alice@example.com" in result.would_send_to

    async def test_excludes_members_with_notifications_disabled(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        profile = _make_mock_profile(email="alice@example.com", email_notifications=False)
        mock_workspace_repo.get_workspace_members_with_profiles = AsyncMock(return_value=[(MagicMock(), profile)])
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.preview_digest(WORKSPACE_ID)

        assert result.would_send_to == []

    async def test_excludes_members_with_no_email(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        profile = _make_mock_profile(email=None)
        mock_workspace_repo.get_workspace_members_with_profiles = AsyncMock(return_value=[(MagicMock(), profile)])
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        result = await service.preview_digest(WORKSPACE_ID)

        assert result.would_send_to == []

    async def test_returns_rendered_html_when_updates_exist(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        update = _make_mock_update()
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[update])
        profile = _make_mock_profile()
        mock_workspace_repo.get_profiles_for_updates = AsyncMock(return_value={USER_ID: profile})

        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        with (
            patch("app.services.digest_service.DigestService.preview_digest") as _,
            patch("app.lib.claude.summarise", new=AsyncMock(return_value="Great day.")),
            patch(
                "app.lib.email.render_digest_email",
                return_value="<html>digest</html>",
            ),
        ):
            # Call the real method with mocked internals
            pass

        # Simpler approach — mock summarise and render at import point
        with (
            patch(
                "app.services.digest_service.DigestService._get_update_repo",
                return_value=mock_update_repo,
            ),
            patch(
                "app.services.digest_service.DigestService._get_workspace_repo",
                return_value=mock_workspace_repo,
            ),
            patch(
                "app.services.digest_service.DigestService._get_digest_repo",
                return_value=mock_digest_repo,
            ),
        ):
            service2 = DigestService(MagicMock())
            service2._digest_repo = mock_digest_repo
            service2._workspace_repo = mock_workspace_repo
            service2._update_repo = mock_update_repo

            with (
                patch(
                    "app.lib.claude.summarise",
                    new=AsyncMock(return_value="Great day."),
                ),
                patch(
                    "app.lib.email.render_digest_email",
                    return_value="<html>digest</html>",
                ),
            ):
                result = await service2.preview_digest(WORKSPACE_ID)

        assert result.html == "<html>digest</html>"
        assert result.update_count == 1

    async def test_uses_fallback_summary_when_claude_fails(self, service, mock_digest_repo, mock_workspace_repo, mock_update_repo):
        update = _make_mock_update()
        mock_update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[update])
        profile = _make_mock_profile()
        mock_workspace_repo.get_profiles_for_updates = AsyncMock(return_value={USER_ID: profile})
        _inject_repos(service, mock_digest_repo, mock_workspace_repo, mock_update_repo)

        with (
            patch(
                "app.lib.claude.summarise",
                new=AsyncMock(side_effect=Exception("API down")),
            ),
            patch(
                "app.lib.email.render_digest_email",
                return_value="<html>fallback</html>",
            ) as mock_render,
        ):
            result = await service.preview_digest(WORKSPACE_ID)

        # render_digest_email should be called with fallback summary
        render_call_kwargs = mock_render.call_args.kwargs
        assert render_call_kwargs["team_summary"] == "Preview summary unavailable."
        assert result.update_count == 1
