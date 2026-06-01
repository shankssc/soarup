# apps/api/tests/workers/test_process_audio_task.py
# Tests for the voice update processing pipeline (_process_audio_update_async).
#
# Strategy:
#   - Test _process_audio_update_async directly — no Celery worker needed
#   - All external dependencies deferred-imported inside the function, so
#     patch at source module level (same pattern as test_process_update_task.py)
#   - boto3 (sync), pydub AudioSegment, faster-whisper, tempfile all mocked
#   - mock_audio_pipeline context manager centralises the happy-path setup
#     so individual tests only override what they need

from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.tasks import _process_audio_update_async

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-123"
USER_ID = "user-123"
UPDATE_ID = "update-voice-abc"
UPDATE_DATE = "2026-05-21"
AUDIO_KEY = "audio/workspace-123/user-123/abc123.webm"
MOCK_TRANSCRIPT = "Today I finished the audio upload pipeline and wired up the voice recorder."
MOCK_SUMMARY = "They completed the audio upload pipeline and voice recorder integration."
MOCK_WAV_PATH = "/tmp/test_audio.wav"  # noqa: S108


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_fake_update(
    update_id: str = UPDATE_ID,
    workspace_id: str = WORKSPACE_ID,
    user_id: str = USER_ID,
    content: str = "",
    status: str = "pending",
    update_date: str = UPDATE_DATE,
    mode: str = "voice",
    audio_key: str | None = AUDIO_KEY,
    audio_duration_seconds: int | None = 47,
    summary: str | None = None,
    transcript: str | None = None,
) -> MagicMock:
    update = MagicMock()
    update.id = update_id
    update.workspace_id = workspace_id
    update.user_id = user_id
    update.content = content
    update.status = status
    update.update_date = update_date
    update.mode = mode
    update.audio_key = audio_key
    update.audio_duration_seconds = audio_duration_seconds
    update.summary = summary
    update.transcript = transcript
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
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_factory = MagicMock()
    mock_factory.return_value = mock_session
    return mock_factory, mock_session


def _make_mock_update_repo(
    update: MagicMock | None = None,
) -> MagicMock:
    repo = MagicMock()
    repo.get_by_id = AsyncMock(return_value=update or make_fake_update())
    repo.update_status = AsyncMock(side_effect=lambda u, _s, **_kwargs: u)
    repo.update_transcript = AsyncMock(side_effect=lambda u, _t: u)
    return repo


def _make_mock_whisper(
    transcript: str = MOCK_TRANSCRIPT,
    raises: Exception | None = None,
) -> MagicMock:
    model = MagicMock()
    mock_segment = MagicMock()
    mock_segment.text = transcript
    mock_info = MagicMock()
    mock_info.duration = 47.0
    mock_info.language = "en"
    mock_info.language_probability = 0.99

    if raises:
        model.transcribe.side_effect = raises
    else:
        model.transcribe.return_value = ([mock_segment], mock_info)
    return model


def _make_mock_audio_segment() -> MagicMock:
    mock_audio = MagicMock()
    mock_audio.set_frame_rate.return_value = mock_audio
    mock_audio.set_channels.return_value = mock_audio
    mock_audio.export = MagicMock()
    return mock_audio


def _make_mock_tempfile() -> MagicMock:
    mock_tmp_file = MagicMock()
    mock_tmp_file.name = MOCK_WAV_PATH
    mock_tmp_file.__enter__ = MagicMock(return_value=mock_tmp_file)
    mock_tmp_file.__exit__ = MagicMock(return_value=False)
    return mock_tmp_file


# ---------------------------------------------------------------------------
# Patch targets — all deferred imports patched at source module level
# ---------------------------------------------------------------------------

_ASYNC_SESSIONMAKER = "sqlalchemy.ext.asyncio.async_sessionmaker"
_UPDATE_REPO = "app.repositories.update_repo.UpdateRepository"
_WORKSPACE_REPO = "app.repositories.workspace_repo.WorkspaceRepository"
_PROFILE_REPO = "app.repositories.profile_repo.ProfileRepository"
_SUMMARISE = "app.lib.claude.summarise"
_PUBLISH_EVENT = "app.lib.events.publish_event"
_BUILD_PROMPT = "app.workers.prompts.build_summarisation_prompt"
_BOTO3_CLIENT = "boto3.client"
_AUDIO_SEGMENT = "pydub.AudioSegment"
_WHISPER_MODEL = "app.workers.whisper_setup.get_whisper_model"
_TEMPFILE = "tempfile.NamedTemporaryFile"
_OS_UNLINK = "os.unlink"


# ---------------------------------------------------------------------------
# Central happy-path context manager
# ---------------------------------------------------------------------------


@contextmanager
def mock_audio_pipeline(
    update: MagicMock | None = None,
    workspace: MagicMock | None = None,
    profile: MagicMock | None = None,
    transcript: str = MOCK_TRANSCRIPT,
    transcription_raises: Exception | None = None,
    summarisation_raises: Exception | None = None,
):
    """
    Sets up all external dependencies for _process_audio_update_async.
    Yields a dict of the key mock objects for per-test assertion use.
    """
    _update = update or make_fake_update()
    _workspace = workspace or make_fake_workspace()
    _profile = profile or make_fake_profile()

    mock_factory, _ = _make_mock_session_factory()
    mock_update_repo = _make_mock_update_repo(_update)
    mock_audio = _make_mock_audio_segment()
    mock_whisper = _make_mock_whisper(transcript=transcript, raises=transcription_raises)
    mock_tmp_file = _make_mock_tempfile()

    mock_s3 = MagicMock()
    mock_s3.download_fileobj = MagicMock()

    mock_summarise = AsyncMock(
        return_value=MOCK_SUMMARY,
        side_effect=summarisation_raises,
    )

    with (
        patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
        patch(_UPDATE_REPO) as mock_update_repo_cls,
        patch(_WORKSPACE_REPO) as mock_workspace_repo_cls,
        patch(_PROFILE_REPO) as mock_profile_repo_cls,
        patch(_BOTO3_CLIENT, return_value=mock_s3),
        patch(_AUDIO_SEGMENT) as mock_audio_cls,
        patch(_WHISPER_MODEL, return_value=mock_whisper),
        patch(_TEMPFILE, return_value=mock_tmp_file),
        patch(_SUMMARISE, new=mock_summarise),
        patch(_PUBLISH_EVENT, new=AsyncMock()),
        patch(_OS_UNLINK),
        patch("app.workers.tasks.logger"),
    ):
        mock_audio_cls.from_file.return_value = mock_audio
        mock_update_repo_cls.from_session.return_value = mock_update_repo
        mock_workspace_repo_cls.from_session.return_value.get_by_id = AsyncMock(return_value=_workspace)
        mock_profile_repo_cls.from_session.return_value.get_by_user_id = AsyncMock(return_value=_profile)

        yield {
            "update": _update,
            "workspace": _workspace,
            "profile": _profile,
            "update_repo": mock_update_repo,
            "whisper": mock_whisper,
            "summarise": mock_summarise,
            "s3": mock_s3,
            "audio": mock_audio,
        }


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_pending_to_processed(self):
        """Full pipeline: audio downloaded → transcribed → summarised → processed."""
        task = make_mock_task(retries=0)
        status_calls = []

        async def track_status(u, status, summary=None):
            status_calls.append(status)
            return u

        with mock_audio_pipeline() as mocks:
            mocks["update_repo"].update_status = AsyncMock(side_effect=track_status)
            await _process_audio_update_async(task, UPDATE_ID)

        assert "processing" in status_calls
        assert "processed" in status_calls

    @pytest.mark.asyncio
    async def test_transcript_stored_via_update_transcript(self):
        """update_transcript called with the whisper output."""
        task = make_mock_task()

        with mock_audio_pipeline(transcript=MOCK_TRANSCRIPT) as mocks:
            await _process_audio_update_async(task, UPDATE_ID)

        mocks["update_repo"].update_transcript.assert_awaited_once()
        _, args, _ = mocks["update_repo"].update_transcript.mock_calls[0]
        assert args[1] == MOCK_TRANSCRIPT

    @pytest.mark.asyncio
    async def test_status_transitions_processing_then_processed(self):
        """update_status called with 'processing' before 'processed'."""
        task = make_mock_task()
        status_calls = []

        async def track_status(u, status, summary=None):
            status_calls.append(status)
            return u

        with mock_audio_pipeline() as mocks:
            mocks["update_repo"].update_status = AsyncMock(side_effect=track_status)
            await _process_audio_update_async(task, UPDATE_ID)

        assert status_calls.index("processing") < status_calls.index("processed")

    @pytest.mark.asyncio
    async def test_haiku_used_on_first_attempt(self):
        """retries=0 → use_fallback=False → Haiku."""
        task = make_mock_task(retries=0)

        with mock_audio_pipeline() as mocks:
            await _process_audio_update_async(task, UPDATE_ID)

        _, kwargs = mocks["summarise"].call_args
        assert kwargs.get("use_fallback") is False

    @pytest.mark.asyncio
    async def test_sonnet_used_on_retry(self):
        """retries>0 → use_fallback=True → Sonnet."""
        task = make_mock_task(retries=1)

        with mock_audio_pipeline() as mocks:
            await _process_audio_update_async(task, UPDATE_ID)

        _, kwargs = mocks["summarise"].call_args
        assert kwargs.get("use_fallback") is True

    @pytest.mark.asyncio
    async def test_transcription_started_event_published(self):
        """audio.transcription_started published before transcription."""
        task = make_mock_task()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append(event_type)

        with (
            mock_audio_pipeline(),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        assert "audio.transcription_started" in publish_calls

    @pytest.mark.asyncio
    async def test_transcription_started_published_before_complete(self):
        """audio.transcription_started event precedes audio.transcription_complete."""
        task = make_mock_task()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append(event_type)

        with (
            mock_audio_pipeline(),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        assert publish_calls.index("audio.transcription_started") < publish_calls.index("audio.transcription_complete")

    @pytest.mark.asyncio
    async def test_transcription_complete_published_with_transcript(self):
        """audio.transcription_complete payload contains the transcript."""
        task = make_mock_task()
        publish_payloads = {}

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_payloads[event_type] = payload

        with (
            mock_audio_pipeline(transcript=MOCK_TRANSCRIPT),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        assert "audio.transcription_complete" in publish_payloads
        assert publish_payloads["audio.transcription_complete"]["transcript"] == MOCK_TRANSCRIPT

    @pytest.mark.asyncio
    async def test_processed_event_published_with_summary(self):
        """update.status_changed published with status='processed' and summary."""
        task = make_mock_task()
        publish_payloads = []

        async def track_publish(redis, event_type, workspace_id, payload):
            if event_type == "update.status_changed":
                publish_payloads.append(payload)

        with (
            mock_audio_pipeline(),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        processed_payloads = [p for p in publish_payloads if p.get("status") == "processed"]
        assert len(processed_payloads) == 1
        assert processed_payloads[0]["summary"] == MOCK_SUMMARY

    @pytest.mark.asyncio
    async def test_custom_workspace_prompt_passed_to_build_prompt(self):
        """workspace.summarisation_prompt forwarded as custom_prompt."""
        task = make_mock_task()
        workspace = make_fake_workspace(summarisation_prompt="Summarise as bullet points.")
        mock_build = MagicMock(return_value="built-prompt")

        with (
            mock_audio_pipeline(workspace=workspace),
            patch(_BUILD_PROMPT, mock_build),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        mock_build.assert_called_once()
        _, kwargs = mock_build.call_args
        assert kwargs.get("custom_prompt") == "Summarise as bullet points."

    @pytest.mark.asyncio
    async def test_none_workspace_prompt_passes_none(self):
        """workspace.summarisation_prompt=None → custom_prompt=None."""
        task = make_mock_task()
        workspace = make_fake_workspace(summarisation_prompt=None)
        mock_build = MagicMock(return_value="built-prompt")

        with (
            mock_audio_pipeline(workspace=workspace),
            patch(_BUILD_PROMPT, mock_build),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        _, kwargs = mock_build.call_args
        assert kwargs.get("custom_prompt") is None

    @pytest.mark.asyncio
    async def test_temp_wav_file_cleaned_up_on_success(self):
        """os.unlink called with wav_path after successful transcription."""
        task = make_mock_task()

        with (
            mock_audio_pipeline(),
            patch(_OS_UNLINK) as mock_unlink,
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        mock_unlink.assert_called_once_with(MOCK_WAV_PATH)


# ---------------------------------------------------------------------------
# Early return cases
# ---------------------------------------------------------------------------


class TestEarlyReturn:
    @pytest.mark.asyncio
    async def test_update_not_found_returns_early(self):
        """get_by_id returns None → no status update, no events."""
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        mock_publish = AsyncMock()

        mock_update_repo = _make_mock_update_repo(update=None)
        mock_update_repo.get_by_id = AsyncMock(return_value=None)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO),
            patch(_PROFILE_REPO),
            patch(_BOTO3_CLIENT, return_value=MagicMock()),
            patch(_PUBLISH_EVENT, new=mock_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _process_audio_update_async(task, "nonexistent-id")

        mock_update_repo.update_status.assert_not_awaited()
        mock_publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_missing_audio_key_returns_early(self):
        """update.audio_key is None → early return, no status update, no events."""
        task = make_mock_task()
        mock_factory, _ = _make_mock_session_factory()
        mock_publish = AsyncMock()

        update_no_audio = make_fake_update(audio_key=None)
        mock_update_repo = _make_mock_update_repo(update=update_no_audio)

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_UPDATE_REPO) as mock_update_repo_cls,
            patch(_WORKSPACE_REPO),
            patch(_PROFILE_REPO),
            patch(_BOTO3_CLIENT, return_value=MagicMock()),
            patch(_PUBLISH_EVENT, new=mock_publish),
            patch("app.workers.tasks.logger"),
        ):
            mock_update_repo_cls.from_session.return_value = mock_update_repo
            await _process_audio_update_async(task, UPDATE_ID)

        mock_update_repo.update_status.assert_not_awaited()
        mock_publish.assert_not_awaited()


# ---------------------------------------------------------------------------
# Transcription failures
# ---------------------------------------------------------------------------


class TestTranscriptionFailure:
    @pytest.mark.asyncio
    async def test_transcription_failure_publishes_failed_event(self):
        """If whisper raises, audio.transcription_failed is published."""
        task = make_mock_task()
        publish_calls = []

        async def track_publish(redis, event_type, workspace_id, payload):
            publish_calls.append(event_type)

        with (  # Noqa: SIM117
            mock_audio_pipeline(transcription_raises=RuntimeError("OOM")),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
        ):
            with pytest.raises(RuntimeError):
                await _process_audio_update_async(task, UPDATE_ID)

        assert "audio.transcription_failed" in publish_calls

    @pytest.mark.asyncio
    async def test_transcription_failure_reraises_exception(self):
        """Transcription failure re-raises so Celery retry mechanism picks it up."""
        task = make_mock_task(retries=0, max_retries=3)

        with mock_audio_pipeline(  # Noqa: SIM117
            transcription_raises=RuntimeError("GPU OOM")
        ):
            with pytest.raises(RuntimeError, match="GPU OOM"):
                await _process_audio_update_async(task, UPDATE_ID)

    @pytest.mark.asyncio
    async def test_temp_wav_cleaned_up_on_transcription_failure(self):
        """finally block cleans up WAV even when transcription fails."""
        task = make_mock_task()

        with (  # Noqa: SIM117
            mock_audio_pipeline(transcription_raises=RuntimeError("OOM")),
            patch(_OS_UNLINK) as mock_unlink,
        ):
            with pytest.raises(RuntimeError):
                await _process_audio_update_async(task, UPDATE_ID)

        mock_unlink.assert_called_once()


# ---------------------------------------------------------------------------
# Max retries / summarisation failures
# ---------------------------------------------------------------------------


class TestMaxRetries:
    @pytest.mark.asyncio
    async def test_max_retries_exceeded_sets_failed_status(self):
        """When summarisation fails on the last retry, status → failed."""
        task = make_mock_task(retries=3, max_retries=3)
        status_calls = []

        async def track_status(u, status, summary=None):
            status_calls.append(status)
            return u

        with mock_audio_pipeline(summarisation_raises=Exception("Claude timeout")) as mocks:
            mocks["update_repo"].update_status = AsyncMock(side_effect=track_status)
            await _process_audio_update_async(task, UPDATE_ID)

        assert "failed" in status_calls

    @pytest.mark.asyncio
    async def test_max_retries_publishes_failed_status_changed_event(self):
        """update.status_changed with status='failed' published on terminal failure."""
        task = make_mock_task(retries=3, max_retries=3)
        publish_payloads = []

        async def track_publish(redis, event_type, workspace_id, payload):
            if event_type == "update.status_changed":
                publish_payloads.append(payload)

        with (
            mock_audio_pipeline(summarisation_raises=Exception("Claude down")),
            patch(_PUBLISH_EVENT, side_effect=track_publish),
        ):
            await _process_audio_update_async(task, UPDATE_ID)

        failed_payloads = [p for p in publish_payloads if p.get("status") == "failed"]
        assert len(failed_payloads) == 1

    @pytest.mark.asyncio
    async def test_non_final_retry_reraises_exception(self):
        """On non-final retry, summarisation exception re-raised for Celery autoretry."""
        task = make_mock_task(retries=1, max_retries=3)

        with mock_audio_pipeline(  # Noqa: SIM117
            summarisation_raises=Exception("Timeout")
        ):
            with pytest.raises(Exception, match="Timeout"):
                await _process_audio_update_async(task, UPDATE_ID)
