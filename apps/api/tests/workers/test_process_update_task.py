# apps/api/tests/workers/test_process_update_task.py
# Tests for the Celery update processing pipeline.
#
# Strategy:
#   - Test _process_update_async directly to avoid Celery worker setup
#   - All DB repos, Claude client, and Redis are mocked
#   - Imports inside _process_update_async are deferred — patch at source
#     module level, not at app.workers.tasks.*
#   - async_sessionmaker patched at sqlalchemy.ext.asyncio
#   - Repos patched at their own module paths
#   - summarise patched at app.lib.claude
#   - publish_event patched at app.lib.events
#   - build_summarisation_prompt patched at app.workers.prompts

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.tasks import _process_update_async

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-123"
USER_ID = "user-123"
UPDATE_ID = "update-abc"
UPDATE_DATE = "2026-05-21"
MOCK_SUMMARY = "They completed the auth flow and began working on the dashboard."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_fake_update(
    update_id: str = UPDATE_ID,
    workspace_id: str = WORKSPACE_ID,
    user_id: str = USER_ID,
    content: str = "Finished the auth flow and started on the dashboard.",
    status: str = "pending",
    update_date: str = UPDATE_DATE,
    summary: str | None = None,
) -> MagicMock:
    update = MagicMock()
    update.id = update_id
    update.workspace_id = workspace_id
    update.user_id = user_id
    update.content = content
    update.status = status
    update.update_date = update_date
    update.summary = summary
    return update


def make_fake_workspace(
    workspace_id: str = WORKSPACE_ID,
    summarisation_prompt: str | None = None,
) -> MagicMock:
    workspace = MagicMock()
    workspace.id = workspace_id
    workspace.summarisation_prompt = summarisation_prompt
    return workspace


def make_fake_profile(
    user_id: str = USER_ID,
    full_name: str = "Jane Doe",
) -> MagicMock:
    profile = MagicMock()
    profile.id = user_id
    profile.full_name = full_name
    return profile


def make_mock_task(retries: int = 0, max_retries: int = 3) -> MagicMock:
    task = MagicMock()
    task.request.retries = retries
    task.max_retries = max_retries
    task.redis = AsyncMock()
    task.redis.publish = AsyncMock(return_value=1)
    task.db_engine = MagicMock()
    return task


def _make_mock_session_factory() -> tuple[MagicMock, AsyncMock]:
    """Return (mock_factory, mock_session) wired as async context manager."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_factory = MagicMock()
    mock_factory.return_value = mock_session
    return mock_factory, mock_session


def _noop_status(u: MagicMock, _s: str, summary: str | None = None) -> MagicMock:
    """No-op update_status side_effect — returns update unchanged."""
    return u


# ---------------------------------------------------------------------------
# Patch targets
# All deferred imports in _process_update_async must be patched at source.
# ---------------------------------------------------------------------------


_ASYNC_SESSIONMAKER = "sqlalchemy.ext.asyncio.async_sessionmaker"
_UPDATE_REPO = "app.repositories.update_repo.UpdateRepository"
_WORKSPACE_REPO = "app.repositories.workspace_repo.WorkspaceRepository"
_PROFILE_REPO = "app.repositories.profile_repo.ProfileRepository"
_SUMMARISE = "app.lib.claude.summarise"
_PUBLISH_EVENT = "app.lib.events.append_event"
_BUILD_PROMPT = "app.workers.prompts.build_summarisation_prompt"


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_pending_to_processed(self):
        """Full pipeline: update found → processing → Claude → processed."""
        update = make_fake_update(status="pending")
        workspace = make_fake_workspace()
        profile = make_fake_profile()
        task = make_mock_task(retries=0)
        mock_factory, _ = _make_mock_session_factory()

        async def set_status(u, status, summary=None):
            u.status = status
            if summary:
                u.summary = summary
            return u

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=set_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(return_value=MOCK_SUMMARY)),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=workspace)
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=profile)

            await _process_update_async(task, UPDATE_ID)

        assert update.status == "processed"
        assert update.summary == MOCK_SUMMARY

    @pytest.mark.asyncio
    async def test_update_status_called_twice(self):
        """update_status called once for 'processing' then once for 'processed'."""
        update = make_fake_update()
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        status_calls = []

        async def track_status(u, status, summary=None):
            status_calls.append(status)
            u.status = status
            return u

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=track_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(return_value=MOCK_SUMMARY)),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        assert status_calls == ["processing", "processed"]

    @pytest.mark.asyncio
    async def test_uses_haiku_on_first_attempt(self):
        """retries=0 → use_fallback=False → Haiku."""
        update = make_fake_update()
        task = make_mock_task(retries=0)
        mock_factory, _ = _make_mock_session_factory()
        mock_summarise = AsyncMock(return_value=MOCK_SUMMARY)

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=mock_summarise),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        mock_summarise.assert_awaited_once()
        _, kwargs = mock_summarise.call_args
        assert kwargs.get("use_fallback") is False

    @pytest.mark.asyncio
    async def test_uses_sonnet_on_retry(self):
        """retries>0 → use_fallback=True → Sonnet."""
        update = make_fake_update()
        task = make_mock_task(retries=1)
        mock_factory, _ = _make_mock_session_factory()
        mock_summarise = AsyncMock(return_value=MOCK_SUMMARY)

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=mock_summarise),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        mock_summarise.assert_awaited_once()
        _, kwargs = mock_summarise.call_args
        assert kwargs.get("use_fallback") is True

    @pytest.mark.asyncio
    async def test_processing_event_published_with_correct_payload(self):
        """First publish_event call uses status='processing' with no summary."""
        update = make_fake_update()
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append((event_type, payload))

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(return_value=MOCK_SUMMARY)),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        assert publish_calls[0][0] == "update.status_changed"
        assert publish_calls[0][1]["status"] == "processing"
        assert publish_calls[0][1]["summary"] is None

    @pytest.mark.asyncio
    async def test_processed_event_published_with_summary(self):
        """Second publish_event call uses status='processed' with summary."""
        update = make_fake_update()
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append((event_type, payload))

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(return_value=MOCK_SUMMARY)),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        assert publish_calls[1][1]["status"] == "processed"
        assert publish_calls[1][1]["summary"] == MOCK_SUMMARY

    @pytest.mark.asyncio
    async def test_custom_workspace_prompt_passed_to_build_prompt(self):
        """workspace.summarisation_prompt is forwarded to build_summarisation_prompt."""
        update = make_fake_update()
        workspace = make_fake_workspace(
            summarisation_prompt="Focus on blockers only.")
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        mock_build = MagicMock(return_value="built-prompt")

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(return_value=MOCK_SUMMARY)),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch(_BUILD_PROMPT, mock_build),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=workspace)
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        mock_build.assert_called_once()
        _, kwargs = mock_build.call_args
        assert kwargs.get("custom_prompt") == "Focus on blockers only."

    @pytest.mark.asyncio
    async def test_none_workspace_prompt_passes_none_to_build_prompt(self):
        """workspace.summarisation_prompt=None passes None as custom_prompt."""
        update = make_fake_update()
        workspace = make_fake_workspace(summarisation_prompt=None)
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        mock_build = MagicMock(return_value="built-prompt")

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(return_value=MOCK_SUMMARY)),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch(_BUILD_PROMPT, mock_build),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=workspace)
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        _, kwargs = mock_build.call_args
        assert kwargs.get("custom_prompt") is None


# ---------------------------------------------------------------------------
# Update not found
# ---------------------------------------------------------------------------


class TestUpdateNotFound:
    @pytest.mark.asyncio
    async def test_early_return_when_update_not_found(self):
        """If get_by_id returns None, task exits immediately — no status update, no event."""
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        mock_publish = AsyncMock()

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=None)
        mock_update_repo.update_status = AsyncMock()

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO),
            patch(_PROFILE_REPO),
            patch(_SUMMARISE, new=AsyncMock()),
            patch(_PUBLISH_EVENT, new=mock_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo

            await _process_update_async(task, "nonexistent-id")

        mock_update_repo.update_status.assert_not_awaited()
        mock_publish.assert_not_awaited()


# ---------------------------------------------------------------------------
# Max retries exhausted
# ---------------------------------------------------------------------------


class TestMaxRetries:
    @pytest.mark.asyncio
    async def test_failed_status_set_on_max_retries(self):
        """When retries >= max_retries and Claude fails, status → failed."""
        update = make_fake_update()
        task = make_mock_task(retries=3, max_retries=3)
        mock_factory, _ = _make_mock_session_factory()
        status_calls = []

        async def track_status(u, status, summary=None):
            status_calls.append(status)
            u.status = status
            return u

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=track_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(side_effect=Exception("API down"))),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        assert "failed" in status_calls

    @pytest.mark.asyncio
    async def test_failed_event_published_on_max_retries(self):
        """Failure event published with status='failed' when all retries exhausted."""
        update = make_fake_update()
        task = make_mock_task(retries=3, max_retries=3)
        mock_factory, _ = _make_mock_session_factory()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append(payload)

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(side_effect=Exception("fail"))),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            await _process_update_async(task, UPDATE_ID)

        failed_payloads = [
            p for p in publish_calls if p.get("status") == "failed"]
        assert len(failed_payloads) == 1

    @pytest.mark.asyncio
    async def test_exception_reraised_on_non_final_retry(self):
        """On non-final retry, exception is re-raised so Celery's autoretry picks it up."""
        update = make_fake_update()
        task = make_mock_task(retries=1, max_retries=3)
        mock_factory, _ = _make_mock_session_factory()

        mock_update_repo = MagicMock()
        mock_update_repo.get_by_id = AsyncMock(return_value=update)
        mock_update_repo.update_status = AsyncMock(side_effect=_noop_status)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
            patch(_PROFILE_REPO) as mock_profile_repo_cls,
            patch(_SUMMARISE, new=AsyncMock(
                side_effect=Exception("transient"))),
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(
                return_value=make_fake_workspace())
            mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(
                return_value=make_fake_profile())

            with pytest.raises(Exception, match="transient"):
                await _process_update_async(task, UPDATE_ID)
