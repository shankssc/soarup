# apps/api/app/workers/tasks.py

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import structlog
from celery import Task
from celery.signals import worker_ready

from app.config import settings
from app.workers.celery_app import celery_app

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncEngine

logger = structlog.get_logger(__name__)


class ProcessUpdateTask(Task):  # type: ignore[misc]
    """
    Custom Task base class with async support and shared resources.
    Initialises DB engine and Redis connection once per worker process
    via lazy properties — avoids the cost of reconnecting on every task.
    """

    abstract = True
    _db_engine = None
    _redis = None

    @property
    def db_engine(self) -> AsyncEngine:
        if self._db_engine is None:
            from sqlalchemy.ext.asyncio import create_async_engine
            from sqlalchemy.pool import NullPool

            self._db_engine = create_async_engine(
                settings.database_url,
                poolclass=NullPool,
            )
        return self._db_engine

    @property
    def redis(self) -> Redis | Any:
        if self._redis is None:
            from redis.asyncio import Redis

            self._redis = Redis.from_url(settings.redis_url)
        return self._redis


# Decorator arg to configure this specific task retry behavior
# The configs are per-task overrides that only apply to process_update
@celery_app.task(  # type: ignore[misc]
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.process_update",
    max_retries=3,
    # 30s → 60s → 120s (Celery doubles by default)
    default_retry_delay=30,
    autoretry_for=(Exception,),  # Retry on any exception
    retry_backoff=True,  # Exponential backoff
    retry_backoff_max=120,  # Cap at 120s
    retry_jitter=True,  # Add jitter to avoid thundering herd
    acks_late=True,
)
def process_update(self: ProcessUpdateTask, update_id: str) -> None:
    """
    Process a submitted update through the Claude summarisation pipeline.

    Runs synchronously in the Celery worker — delegates all async work to
    _process_update_async via asyncio.run(), which creates a fresh event
    loop per invocation. This is correct for Celery's sync task context.

    Flow:
        1. Fetch update + workspace prompt config from DB
        2. Set status → "processing", publish WS event
        3. Build prompt (workspace custom or default)
        4. Call Claude Haiku (Sonnet fallback on first retry)
        5. Store summary, set status → "processed", publish WS event

    On max retries exceeded:
        6. Set status → "failed", publish WS event

    Args:
        update_id: UUID string of the Update record to process.
    """
    asyncio.run(_process_update_async(self, update_id))


@celery_app.task(  # type: ignore[misc]
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.process_audio_update",
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    acks_late=True,
)
def process_audio_update(self: ProcessUpdateTask, update_id: str) -> None:
    """
    Process a voice update through the transcription + summarisation pipeline.

    Flow:
        1. Fetch update + workspace from DB
        2. Set status → "processing"
        3. Download audio from Minio/R2
        4. Transcode to WAV/16kHz mono via ffmpeg + pydub
        5. Publish audio.transcription_started
        6. Transcribe with faster-whisper
        7. Store transcript, publish audio.transcription_complete
        8. Summarise transcript with Claude (Haiku → Sonnet fallback)
        9. Store summary, set status → "processed"
        10. Publish update.status_changed (processed)

    On max retries exceeded:
        11. Set status → "failed", publish update.status_changed (failed)
    """
    asyncio.run(_process_audio_update_async(self, update_id))


async def _process_update_async(task: ProcessUpdateTask, update_id: str) -> None:
    """
    Async implementation of the update processing pipeline.

    Imports are deferred to function scope to avoid circular import issues
    at module load time — celery_app imports tasks, tasks would import
    from app modules that may not be fully initialised yet.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.events import append_event
    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_summarisation_prompt

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        update_repo = UpdateRepository.from_session(db)
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        # 1. Fetch records — bail early if update no longer exists
        update = await update_repo.get_by_id(update_id)
        if not update:
            logger.warning(
                "process_update_skipped",
                update_id=update_id,
                reason="not_found",
            )
            return

        workspace = await workspace_repo.get_by_id(update.workspace_id)
        profile = await profile_repo.get_by_user_id(update.user_id)

        # 2. Set status → processing and notify connected clients
        await update_repo.update_status(update, "processing")
        await append_event(
            task.redis,
            "update.status_changed",
            update.workspace_id,
            {
                "update_id": update_id,
                "workspace_id": update.workspace_id,
                "update_date": update.update_date,
                "status": "processing",
                "summary": None,
            },
        )

        # 3. Build prompt — use Sonnet on retries, Haiku on first attempt
        use_fallback = task.request.retries > 0
        prompt = build_summarisation_prompt(
            content=update.content,
            author_name=profile.full_name if profile is not None else "the user",
            update_date=update.update_date,
            custom_prompt=workspace.summarisation_prompt if workspace else None,
        )

        try:
            # 4. Call Claude
            summary = await summarise(prompt, use_fallback=use_fallback)

            # 5. Store summary and notify connected clients of success
            await update_repo.update_status(update, "processed", summary=summary)
            await append_event(
                task.redis,
                "update.status_changed",
                update.workspace_id,
                {
                    "update_id": update_id,
                    "workspace_id": update.workspace_id,
                    "update_date": update.update_date,
                    "status": "processed",
                    "summary": summary,
                },
            )
            logger.info(
                "process_update_complete",
                update_id=update_id,
                retries=task.request.retries,
            )

        except Exception as exc:
            logger.warning(
                "process_update_failed",
                update_id=update_id,
                attempt=task.request.retries + 1,
                error=str(exc),
            )

            if task.request.retries >= task.max_retries:
                # Terminal failure — all retries exhausted
                await update_repo.update_status(update, "failed")
                await append_event(
                    task.redis,
                    "update.status_changed",
                    update.workspace_id,
                    {
                        "update_id": update_id,
                        "workspace_id": update.workspace_id,
                        "update_date": update.update_date,
                        "status": "failed",
                        "summary": None,
                    },
                )
                logger.error(
                    "process_update_exhausted",
                    update_id=update_id,
                    max_retries=task.max_retries,
                )
                return

            # Re-raise so Celery's autoretry_for picks it up
            raise exc


async def _process_audio_update_async(task: ProcessUpdateTask, update_id: str) -> None:
    """
    Async implementation of the voice update processing pipeline.
    Imports deferred to function scope to avoid circular imports at module load time.
    """
    import io
    import os
    import tempfile

    import boto3
    from pydub import AudioSegment
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.events import append_event
    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_summarisation_prompt
    from app.workers.whisper_setup import get_whisper_model

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        update_repo = UpdateRepository.from_session(db)
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        # 1. Fetch records — bail early if update missing or has no audio
        update = await update_repo.get_by_id(update_id)
        if not update or not update.audio_key:
            logger.warning(
                "process_audio_skipped",
                update_id=update_id,
                reason="not_found_or_no_audio_key",
            )
            return

        workspace = await workspace_repo.get_by_id(update.workspace_id)
        profile = await profile_repo.get_by_user_id(update.user_id)

        # 2. Set status → processing
        await update_repo.update_status(update, "processing")

        # 3. Download audio from Minio/R2
        # Sync boto3 used here — this runs inside asyncio.run() in a dedicated
        # Celery process, not in the FastAPI event loop, so blocking is acceptable.
        # Replace with aioboto3 when moving to a proper async task runner.
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=(settings.r2_access_key_id.get_secret_value() if settings.r2_access_key_id else ""),
            aws_secret_access_key=(settings.r2_secret_access_key.get_secret_value() if settings.r2_secret_access_key else ""),
            region_name="auto",
        )
        audio_buffer = io.BytesIO()
        s3.download_fileobj(settings.r2_bucket_name, update.audio_key, audio_buffer)
        audio_buffer.seek(0)

        # 4. Transcode to WAV/16kHz mono via pydub + ffmpeg
        # Normalises format differences between Chrome (WebM/Opus) and Safari (MP4/AAC)
        wav_path: str | None = None
        try:
            audio = AudioSegment.from_file(audio_buffer)
            audio = audio.set_frame_rate(16000).set_channels(1)

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                audio.export(tmp.name, format="wav")
                wav_path = tmp.name
        except Exception as e:
            logger.error(
                "audio_transcode_failed",
                update_id=update_id,
                error=str(e),
            )
            raise

        # 5. Publish transcription started
        await append_event(
            task.redis,
            "audio.transcription_started",
            update.workspace_id,
            {
                "update_id": update_id,
                "workspace_id": update.workspace_id,
                "update_date": update.update_date,
            },
        )

        # 6. Transcribe with faster-whisper
        try:
            model = get_whisper_model()
            segments, info = model.transcribe(
                wav_path,
                language=None,  # auto-detect language
                beam_size=5,
                vad_filter=True,  # skip silence segments
                vad_parameters={"min_silence_duration_ms": 500},
            )
            transcript = " ".join(seg.text.strip() for seg in segments).strip()

            logger.info(
                "transcription_complete",
                update_id=update_id,
                duration=info.duration,
                language=info.language,
                language_probability=info.language_probability,
                transcript_length=len(transcript),
            )
        except Exception as e:
            logger.error(
                "transcription_failed",
                update_id=update_id,
                error=str(e),
            )
            await append_event(
                task.redis,
                "audio.transcription_failed",
                update.workspace_id,
                {
                    "update_id": update_id,
                    "workspace_id": update.workspace_id,
                    "update_date": update.update_date,
                },
            )
            raise
        finally:
            # Always clean up the temp WAV file
            if wav_path:
                try:  # Noqa: SIM105
                    os.unlink(wav_path)  # Noqa: PTH108
                except Exception:  # Noqa: S110
                    pass

        # 7. Store transcript, publish transcription complete
        await update_repo.update_transcript(update, transcript)
        await append_event(
            task.redis,
            "audio.transcription_complete",
            update.workspace_id,
            {
                "update_id": update_id,
                "workspace_id": update.workspace_id,
                "update_date": update.update_date,
                "transcript": transcript,
            },
        )

        # 8. Summarise transcript with Claude (same pipeline as text updates)
        use_fallback = task.request.retries > 0
        prompt = build_summarisation_prompt(
            content=transcript,
            author_name=profile.full_name if profile else "the user",
            update_date=update.update_date,
            custom_prompt=workspace.summarisation_prompt if workspace else None,
        )

        try:
            summary = await summarise(prompt, use_fallback=use_fallback)

            # 9. Store summary, set status → processed
            await update_repo.update_status(update, "processed", summary=summary)
            await append_event(
                task.redis,
                "update.status_changed",
                update.workspace_id,
                {
                    "update_id": update_id,
                    "workspace_id": update.workspace_id,
                    "update_date": update.update_date,
                    "status": "processed",
                    "summary": summary,
                },
            )
            logger.info(
                "process_audio_update_complete",
                update_id=update_id,
                retries=task.request.retries,
            )

        except Exception as exc:
            logger.warning(
                "process_audio_update_failed",
                update_id=update_id,
                attempt=task.request.retries + 1,
                error=str(exc),
            )
            if task.request.retries >= task.max_retries:
                await update_repo.update_status(update, "failed")
                await append_event(
                    task.redis,
                    "update.status_changed",
                    update.workspace_id,
                    {
                        "update_id": update_id,
                        "workspace_id": update.workspace_id,
                        "update_date": update.update_date,
                        "status": "failed",
                        "summary": None,
                    },
                )
                logger.error(
                    "process_audio_exhausted",
                    update_id=update_id,
                    max_retries=task.max_retries,
                )
                return
            raise exc


@worker_ready.connect  # type: ignore[misc]
def preload_whisper_model(**kwargs: Any) -> None:
    from app.workers.whisper_setup import get_whisper_model

    logger.info("preloading_whisper_model")
    get_whisper_model()
    logger.info("whisper_model_ready")
