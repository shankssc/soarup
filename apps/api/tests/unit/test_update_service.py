# apps/api/tests/unit/test_update_service.py
# Unit tests for UpdateService.submit_update and _enqueue_processing.
#
# Covers:
#   - submit_update happy path for text and voice modes (enqueue succeeds)
#   - _enqueue_processing failure (task.delay() raises, e.g. broker down)
#     for both modes:
#       - update marked "failed" via update_repo.update_status
#       - update.status_changed event published with the right payload
#       - UpdateError("service_unavailable", ...) raised, details carry update_id
#   - failure short-circuits before member.update_submitted / _to_response
#
# These are additive to test_update_service_batch.py (which covers the M5
# batch profile fetch in get_workspace_updates) — this file covers
# submit_update itself, which previously had no dedicated unit tests.

from datetime import UTC, date, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.update_service import UpdateError, UpdateService

TODAY = date.today().isoformat()
WORKSPACE_ID = "workspace-123"
USER_ID = "user-abc"
UPDATE_ID = "update-1"


# ---------------------------------------------------------------------------
# Factories — match the pattern established in test_update_service_batch.py
# ---------------------------------------------------------------------------


def _make_service() -> tuple[UpdateService, MagicMock, MagicMock, MagicMock, AsyncMock]:
    """Return (service, update_repo, profile_repo, workspace_repo, redis)."""
    db = MagicMock()
    db.commit = AsyncMock()
    redis = AsyncMock()

    service = UpdateService(db=db, redis=redis)

    update_repo = MagicMock()
    profile_repo = MagicMock()
    workspace_repo = MagicMock()

    service._update_repo = update_repo
    service._profile_repo = profile_repo
    service._workspace_repo = workspace_repo

    # Defaults common to every submit_update call: no profile (falls back
    # to UTC timezone), no existing update for today.
    profile_repo.get_by_user_id = AsyncMock(return_value=None)
    update_repo.get_for_user_on_date = AsyncMock(return_value=None)
    update_repo.update_status = AsyncMock()

    return service, update_repo, profile_repo, workspace_repo, redis


def _fake_update(update_id: str = UPDATE_ID, mode: str = "text") -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=update_id,
        workspace_id=WORKSPACE_ID,
        user_id=USER_ID,
        content="Worked on tests" if mode == "text" else "",
        mode=mode,
        status="pending",
        update_date=TODAY,
        summary=None,
        transcript=None,
        audio_duration_seconds=None,
        created_at=now,
        updated_at=now,
    )


def _text_request() -> SimpleNamespace:
    return SimpleNamespace(
        mode="text",
        content="Worked on tests",
        update_date=TODAY,
        audio_key=None,
        audio_duration_seconds=None,
    )


def _voice_request() -> SimpleNamespace:
    return SimpleNamespace(
        mode="voice",
        content="",
        update_date=TODAY,
        audio_key="audio/key.webm",
        audio_duration_seconds=42,
    )


# ---------------------------------------------------------------------------
# submit_update — happy path (enqueue succeeds)
# ---------------------------------------------------------------------------


class TestSubmitUpdateHappyPath:
    async def test_text_mode_enqueues_process_update(self):
        service, update_repo, *_ = _make_service()
        update_repo.create = AsyncMock(return_value=_fake_update(mode="text"))

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        mock_task.delay.assert_called_once_with(UPDATE_ID)

    async def test_voice_mode_enqueues_process_audio_update(self):
        service, update_repo, *_ = _make_service()
        update_repo.create = AsyncMock(return_value=_fake_update(mode="voice"))

        with patch("app.services.update_service.process_audio_update") as mock_task:
            mock_task.delay = MagicMock()
            await service.submit_update(WORKSPACE_ID, USER_ID, _voice_request())

        mock_task.delay.assert_called_once_with(UPDATE_ID)

    async def test_happy_path_does_not_mark_failed(self):
        service, update_repo, *_ = _make_service()
        update_repo.create = AsyncMock(return_value=_fake_update(mode="text"))

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        update_repo.update_status.assert_not_awaited()

    async def test_happy_path_publishes_member_update_submitted(self):
        service, update_repo, _, _, redis = _make_service()
        update_repo.create = AsyncMock(return_value=_fake_update(mode="text"))

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        redis.xadd.assert_awaited_once()

    async def test_happy_path_returns_update_response(self):
        service, update_repo, *_ = _make_service()
        update_repo.create = AsyncMock(return_value=_fake_update(mode="text"))

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            result = await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        assert result.id == UPDATE_ID
        assert result.status == "pending"


# ---------------------------------------------------------------------------
# _enqueue_processing — failure path (task.delay() raises, e.g. broker down)
# ---------------------------------------------------------------------------


class TestEnqueueProcessingFailure:
    async def test_text_mode_delay_failure_marks_update_failed(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update_repo.create = AsyncMock(return_value=update)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with pytest.raises(UpdateError) as exc_info:
                await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        assert exc_info.value.error_code == "service_unavailable"
        update_repo.update_status.assert_awaited_once_with(update, "failed")

    async def test_voice_mode_delay_failure_marks_update_failed(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="voice")
        update_repo.create = AsyncMock(return_value=update)

        with patch("app.services.update_service.process_audio_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with pytest.raises(UpdateError) as exc_info:
                await service.submit_update(WORKSPACE_ID, USER_ID, _voice_request())

        assert exc_info.value.error_code == "service_unavailable"
        update_repo.update_status.assert_awaited_once_with(update, "failed")

    async def test_failure_publishes_status_changed_event_with_correct_payload(self):
        service, update_repo, _, _, redis = _make_service()
        update = _fake_update(mode="text")
        update_repo.create = AsyncMock(return_value=update)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with patch("app.services.update_service.append_event", new=AsyncMock()) as mock_append:  # Noqa: SIM117
                with pytest.raises(UpdateError):
                    await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        mock_append.assert_awaited_once()
        _, event_type, workspace_id, payload = mock_append.call_args.args
        assert event_type == "update.status_changed"
        assert workspace_id == WORKSPACE_ID
        assert payload["update_id"] == UPDATE_ID
        assert payload["workspace_id"] == WORKSPACE_ID
        assert payload["status"] == "failed"
        assert payload["summary"] is None

    async def test_failure_does_not_publish_member_update_submitted(self):
        """
        Only the status_changed("failed") event from _enqueue_processing
        should go out — not a second member.update_submitted event, since
        submit_update never reaches that line when enqueueing fails.
        """
        service, update_repo, _, _, redis = _make_service()
        update = _fake_update(mode="text")
        update_repo.create = AsyncMock(return_value=update)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with pytest.raises(UpdateError):
                await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        assert redis.xadd.await_count == 1

    async def test_failure_error_details_include_update_id(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update_repo.create = AsyncMock(return_value=update)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with pytest.raises(UpdateError) as exc_info:
                await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        assert exc_info.value.details == {"update_id": UPDATE_ID}

    async def test_failure_does_not_reach_to_response(self):
        """
        profile_repo.get_by_user_id is called once for timezone resolution
        at the top of submit_update. On the failure path, _to_response
        (which would call it again for the author field) must never run.
        """
        service, update_repo, profile_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update_repo.create = AsyncMock(return_value=update)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with pytest.raises(UpdateError):
                await service.submit_update(WORKSPACE_ID, USER_ID, _text_request())

        assert profile_repo.get_by_user_id.await_count == 1


# ---------------------------------------------------------------------------
# retry_update
# ---------------------------------------------------------------------------


class TestRetryUpdate:
    async def test_not_found_raises_update_not_found(self):
        service, update_repo, *_ = _make_service()
        update_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(UpdateError) as exc_info:
            await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "update_not_found"

    async def test_wrong_workspace_raises_update_not_found(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update.status = "failed"
        update.workspace_id = "other-workspace"
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "update_not_found"

    async def test_not_owner_raises_unauthorized(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update.status = "failed"
        update.user_id = "someone-else"
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "unauthorized"

    async def test_non_failed_status_raises_update_not_failed(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update.status = "processing"
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "update_not_failed"
        assert exc_info.value.details == {"status": "processing"}

    async def test_lost_race_returns_current_row_without_enqueueing(self):
        """
        flip_status returning None means another request already flipped
        this row — idempotent no-op, no second enqueue.
        """
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update.status = "failed"
        update_repo.get_by_id = AsyncMock(side_effect=[update, _fake_update(mode="text")])
        update_repo.flip_status = AsyncMock(return_value=None)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            result = await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        mock_task.delay.assert_not_called()
        assert result.id == UPDATE_ID

    async def test_success_flips_publishes_pending_then_enqueues(self):
        service, update_repo, _, _, redis = _make_service()
        update = _fake_update(mode="text")
        update.status = "failed"
        flipped = _fake_update(mode="text")
        flipped.status = "pending"
        update_repo.get_by_id = AsyncMock(return_value=update)
        update_repo.flip_status = AsyncMock(return_value=flipped)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            result = await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        update_repo.flip_status.assert_awaited_once_with(UPDATE_ID, from_status="failed", to_status="pending", summary=None)
        mock_task.delay.assert_called_once_with(UPDATE_ID)
        redis.xadd.assert_awaited_once()
        assert result.status == "pending"

    async def test_success_does_not_publish_member_update_submitted(self):
        """
        Exactly one event goes out — status_changed(pending) — never
        member.update_submitted, which marks a brand-new submission.
        """
        service, update_repo, _, _, redis = _make_service()
        update = _fake_update(mode="text")
        update.status = "failed"
        flipped = _fake_update(mode="text")
        flipped.status = "pending"
        update_repo.get_by_id = AsyncMock(return_value=update)
        update_repo.flip_status = AsyncMock(return_value=flipped)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock()
            await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert redis.xadd.await_count == 1

    async def test_voice_mode_retry_enqueues_process_audio_update(self):
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="voice")
        update.status = "failed"
        flipped = _fake_update(mode="voice")
        flipped.status = "pending"
        update_repo.get_by_id = AsyncMock(return_value=update)
        update_repo.flip_status = AsyncMock(return_value=flipped)

        with patch("app.services.update_service.process_audio_update") as mock_task:
            mock_task.delay = MagicMock()
            await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        mock_task.delay.assert_called_once_with(UPDATE_ID)

    async def test_enqueue_failure_propagates_service_unavailable(self):
        """
        _enqueue_processing's own failure path (#161) already flips the
        row back to failed, publishes the failed event, and raises — this
        confirms retry_update doesn't swallow or alter that.
        """
        service, update_repo, *_ = _make_service()
        update = _fake_update(mode="text")
        update.status = "failed"
        flipped = _fake_update(mode="text")
        flipped.status = "pending"
        update_repo.get_by_id = AsyncMock(return_value=update)
        update_repo.flip_status = AsyncMock(return_value=flipped)

        with patch("app.services.update_service.process_update") as mock_task:
            mock_task.delay = MagicMock(side_effect=Exception("broker down"))

            with pytest.raises(UpdateError) as exc_info:
                await service.retry_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "service_unavailable"
        update_repo.update_status.assert_awaited_once_with(flipped, "failed")
