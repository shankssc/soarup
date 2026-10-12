# apps/api/tests/workers/test_reap_stale_processing_updates.py
# Tests for the stale-"processing" reaper (Celery beat task).
#
# Strategy:
#   - Test _reap_stale_processing_updates_async directly — same
#     mock-everything pattern as test_process_update_task.py /
#     test_send_workspace_digest.py
#   - UpdateRepository.get_stale_processing's actual query logic is
#     covered by test_update_repo.py — here it's just mocked to return a
#     fixed list
#   - append_event is patched at its source module, same as the other
#     worker tests

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.tasks import _reap_stale_processing_updates_async

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-123"
UPDATE_DATE = "2026-05-21"

_ASYNC_SESSIONMAKER = "sqlalchemy.ext.asyncio.async_sessionmaker"
_UPDATE_REPO = "app.repositories.update_repo.UpdateRepository"
_PUBLISH_EVENT = "app.lib.events.append_event"


def make_fake_update(update_id: str, workspace_id: str = WORKSPACE_ID) -> MagicMock:
    update = MagicMock()
    update.id = update_id
    update.workspace_id = workspace_id
    update.update_date = UPDATE_DATE
    update.status = "processing"
    return update


def make_mock_task() -> MagicMock:
    task = MagicMock()
    task.db_engine = MagicMock()
    return task


def _make_mock_session_factory() -> tuple[MagicMock, AsyncMock]:
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_factory = MagicMock()
    mock_factory.return_value = mock_session
    return mock_factory, mock_session


class TestReapStaleProcessingUpdates:
    @pytest.mark.asyncio
    async def test_stale_update_marked_failed(self):
        stale = make_fake_update("update-1")
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()

        mock_update_repo = MagicMock()
        mock_update_repo.get_stale_processing = AsyncMock(return_value=[stale])
        mock_update_repo.update_status = AsyncMock(return_value=stale)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_PUBLISH_EVENT, new=AsyncMock()) as mock_publish,
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _reap_stale_processing_updates_async(task)

        mock_update_repo.update_status.assert_awaited_once_with(stale, "failed")
        mock_publish.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_failed_event_payload_matches_normal_failure_path(self):
        stale = make_fake_update("update-1")
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append((event_type, workspace_id, payload))

        mock_update_repo = MagicMock()
        mock_update_repo.get_stale_processing = AsyncMock(return_value=[stale])
        mock_update_repo.update_status = AsyncMock(return_value=stale)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_PUBLISH_EVENT, side_effect=track_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _reap_stale_processing_updates_async(task)

        event_type, workspace_id, payload = publish_calls[0]
        assert event_type == "update.status_changed"
        assert workspace_id == WORKSPACE_ID
        assert payload == {
            "update_id": "update-1",
            "workspace_id": WORKSPACE_ID,
            "update_date": UPDATE_DATE,
            "status": "failed",
            "summary": None,
        }

    @pytest.mark.asyncio
    async def test_no_stale_updates_does_nothing(self):
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()

        mock_update_repo = MagicMock()
        mock_update_repo.get_stale_processing = AsyncMock(return_value=[])
        mock_update_repo.update_status = AsyncMock()

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_PUBLISH_EVENT, new=AsyncMock()) as mock_publish,
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _reap_stale_processing_updates_async(task)

        mock_update_repo.update_status.assert_not_awaited()
        mock_publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_threshold_constant_passed_to_repo_query(self):
        """Confirms the reaper uses STALE_PROCESSING_THRESHOLD_MINUTES, not a hardcoded value."""
        from app.workers.tasks import STALE_PROCESSING_THRESHOLD_MINUTES

        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()

        mock_update_repo = MagicMock()
        mock_update_repo.get_stale_processing = AsyncMock(return_value=[])

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_PUBLISH_EVENT, new=AsyncMock()),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _reap_stale_processing_updates_async(task)

        mock_update_repo.get_stale_processing.assert_awaited_once_with(STALE_PROCESSING_THRESHOLD_MINUTES)

    @pytest.mark.asyncio
    async def test_one_bad_row_does_not_block_the_rest_of_the_sweep(self):
        """update_status raising for one row must not stop the loop — same
        pattern as _check_and_send_digests_async's per-workspace try/except."""
        stale_1 = make_fake_update("update-1")
        stale_2 = make_fake_update("update-2")
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()

        mock_update_repo = MagicMock()
        mock_update_repo.get_stale_processing = AsyncMock(return_value=[stale_1, stale_2])
        mock_update_repo.update_status = AsyncMock(side_effect=[Exception("DB write failed"), stale_2])

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_PUBLISH_EVENT, new=AsyncMock()) as mock_publish,
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _reap_stale_processing_updates_async(task)

        assert mock_update_repo.update_status.await_count == 2
        mock_publish.assert_awaited_once()  # only update-2's event published
