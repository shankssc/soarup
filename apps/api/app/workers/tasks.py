# apps/api/app/workers/tasks.py

from __future__ import annotations

import asyncio
from datetime import UTC
from typing import TYPE_CHECKING, Any

import structlog
from celery import Task
from celery.signals import worker_ready

from app.config import settings
from app.workers.celery_app import celery_app

if TYPE_CHECKING:
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

    @property
    def db_engine(self) -> AsyncEngine:
        if self._db_engine is None:
            from sqlalchemy.ext.asyncio import create_async_engine
            from sqlalchemy.pool import NullPool

            # NullPool is intentional — do not remove.
            # Celery tasks call asyncio.run() which creates a new event loop
            # per task invocation. SQLAlchemy connection pool state does not
            # survive across event loop boundaries, causing asyncpg
            # InterfaceError on reuse. NullPool disables pooling so each
            # operation gets a fresh connection that is closed immediately.
            self._db_engine = create_async_engine(
                settings.database_url,
                poolclass=NullPool,
            )
        return self._db_engine


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
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.events import append_event
    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_summarisation_prompt

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    # Created fresh per task invocation, scoped to THIS event loop only —
    # see the comment on ProcessUpdateTask for why this can't be cached
    # on the Task instance. Closed in finally regardless of how this
    # function exits (success, terminal failure, or re-raise for retry).
    redis = Redis.from_url(settings.redis_url)

    try:
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
                redis,
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
                    redis,
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

                # 6. Post update notification to Slack (non-fatal)
                if settings.slack_integration_enabled and workspace and workspace.slack_updates_enabled and workspace.slack_webhook_url_encrypted:
                    try:
                        from app.services.slack_service import SlackService

                        author_name = (profile.full_name if profile is not None else None) or "A team member"

                        slack_service = SlackService(db)
                        await slack_service.post_update_notification(
                            workspace_id=update.workspace_id,
                            author_name=author_name,
                            workspace_name=workspace.name,
                            update_date=update.update_date,
                            content=update.content,
                            summary=summary,
                            mode=update.mode,
                        )
                    except Exception as slack_exc:
                        logger.warning(
                            "slack_update_notification_failed",
                            update_id=update_id,
                            error=str(slack_exc),
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
                        redis,
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
    finally:
        await redis.aclose()


async def _process_audio_update_async(task: ProcessUpdateTask, update_id: str) -> None:
    """
    Async implementation of the voice update processing pipeline.
    Imports deferred to function scope to avoid circular imports at module load time.
    """
    import io
    import os
    import tempfile

    import aioboto3
    from pydub import AudioSegment
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.events import append_event
    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_summarisation_prompt
    from app.workers.whisper_setup import get_whisper_model

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    # Same reasoning as _process_update_async — created fresh per task
    # invocation, scoped to THIS event loop only, closed in finally.
    redis = Redis.from_url(settings.redis_url)

    try:
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

            # 3. Download audio from R2 via aioboto3
            session = aioboto3.Session()
            audio_buffer = io.BytesIO()
            async with session.client(
                "s3",
                endpoint_url=settings.r2_endpoint_url,
                aws_access_key_id=(settings.r2_access_key_id.get_secret_value() if settings.r2_access_key_id else ""),
                aws_secret_access_key=(settings.r2_secret_access_key.get_secret_value() if settings.r2_secret_access_key else ""),
                region_name="auto",
            ) as s3:
                await s3.download_fileobj(settings.r2_bucket_name, update.audio_key, audio_buffer)
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
                redis,
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
                    redis,
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
                redis,
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
                    redis,
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

                # 10. Post update notification to Slack (non-fatal)
                if settings.slack_integration_enabled and workspace and workspace.slack_updates_enabled and workspace.slack_webhook_url_encrypted:
                    try:
                        from app.services.slack_service import SlackService

                        author_name = (profile.full_name if profile is not None else None) or "A team member"

                        slack_service = SlackService(db)
                        await slack_service.post_update_notification(
                            workspace_id=update.workspace_id,
                            author_name=author_name,
                            workspace_name=workspace.name,
                            update_date=update.update_date,
                            content=update.content,
                            summary=summary,
                            mode=update.mode,
                        )
                    except Exception as slack_exc:
                        logger.warning(
                            "slack_audio_update_notification_failed",
                            update_id=update_id,
                            error=str(slack_exc),
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
                        redis,
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
    finally:
        await redis.aclose()


@worker_ready.connect  # type: ignore[misc]
def preload_whisper_model(**kwargs: Any) -> None:
    from app.workers.whisper_setup import get_whisper_model

    logger.info("preloading_whisper_model")
    get_whisper_model()
    logger.info("whisper_model_ready")


# ---------------------------------------------------------------------------
# Digest tasks
# ---------------------------------------------------------------------------


@celery_app.task(  # type: ignore[misc]
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.check_and_send_digests",
    max_retries=0,  # Polling task — no retries, next tick will re-check
    acks_late=True,
)
def check_and_send_digests(self: ProcessUpdateTask) -> None:
    """
    Polling task run every 5 minutes by Celery Beat.
    Checks all digest-enabled workspaces and enqueues send_workspace_digest
    for any workspace whose send_time + digest_days conditions are met.
    """
    asyncio.run(_check_and_send_digests_async(self))


@celery_app.task(  # type: ignore[misc]
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.send_workspace_digest",
    max_retries=2,
    default_retry_delay=60,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    acks_late=True,
)
def send_workspace_digest(self: ProcessUpdateTask, workspace_id: str, digest_date: str) -> None:
    """
    Generate and send the daily digest for a single workspace.

    Flow:
        1. Idempotency check — skip if digest already sent today
        2. Create Digest record (status=pending)
        3. Fetch all processed updates for workspace + date
        4. Skip + mark failed if no updates exist
        5. Set status → processing
        6. Build prompt from update summaries
        7. Call Claude Sonnet (Haiku fallback on retry)
        8. Store DigestItems + update Digest (status=processing→sent pending email)
        9. Fetch member emails (email_notifications=True only)
        10. Render digest email HTML via Jinja2
        11. Send via Resend, set status → sent | failed
    """
    asyncio.run(_send_workspace_digest_async(self, workspace_id, digest_date))


async def _check_and_send_digests_async(task: ProcessUpdateTask) -> None:
    """
    Async implementation of the digest polling task.
    Timezone-aware: converts workspace send_time to UTC before comparing
    against current UTC time, accurate to the nearest 5-minute window.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.repositories.profile_repo import ProfileRepository
    from app.repositories.workspace_repo import WorkspaceRepository

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        workspaces = await workspace_repo.get_digest_enabled_workspaces()
        now_utc = datetime.now(UTC)

        logger.info(
            "check_digests_tick",
            workspace_count=len(workspaces),
            utc_time=now_utc.isoformat(),
        )

        for workspace in workspaces:
            try:
                # 1. Resolve timezone — workspace override or owner profile fallback
                tz_str = workspace.digest_timezone
                if not tz_str:
                    owner = await profile_repo.get_by_user_id(workspace.owner_id)
                    tz_str = owner.timezone if owner and owner.timezone else "UTC"

                try:
                    tz = ZoneInfo(tz_str)
                except ZoneInfoNotFoundError:
                    logger.warning(
                        "unknown_digest_timezone",
                        workspace_id=workspace.id,
                        tz_str=tz_str,
                    )
                    tz = ZoneInfo("UTC")

                # 2. Current time in workspace timezone
                now_local = now_utc.astimezone(tz)
                today_str = now_local.strftime("%Y-%m-%d")

                # 3. Check digest_days — comma-separated ISO weekday (1=Mon, 7=Sun)
                enabled_days = [d.strip() for d in workspace.digest_days.split(",")]
                current_iso_weekday = str(now_local.isoweekday())
                if current_iso_weekday not in enabled_days:
                    continue

                # 4. Check send_time — HH:MM match within 5-minute window
                send_h, send_m = map(int, workspace.digest_send_time.split(":"))
                current_h = now_local.hour
                current_m = now_local.minute

                # Window: [send_time, send_time + 5min)
                send_total = send_h * 60 + send_m
                current_total = current_h * 60 + current_m
                if not (send_total <= current_total < send_total + 5):
                    continue

                # 5. All conditions met — enqueue per-workspace digest task
                logger.info(
                    "enqueuing_workspace_digest",
                    workspace_id=workspace.id,
                    digest_date=today_str,
                )
                send_workspace_digest.delay(workspace.id, today_str)

            except Exception as e:
                # Never let one workspace failure block the others
                logger.error(
                    "check_digest_workspace_error",
                    workspace_id=workspace.id,
                    error=str(e),
                )
                continue


async def _send_workspace_digest_async(
    task: ProcessUpdateTask,
    workspace_id: str,
    digest_date: str,
) -> None:
    """
    Async implementation of the per-workspace digest send pipeline.
    """
    from datetime import datetime

    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.email import render_digest_email, send_digest_email
    from app.lib.unsubscribe import generate_unsubscribe_token
    from app.repositories.digest_repo import DigestRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.workers.prompts import build_digest_prompt

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        digest_repo = DigestRepository.from_session(db)
        update_repo = UpdateRepository.from_session(db)
        workspace_repo = WorkspaceRepository.from_session(db)

        workspace = await workspace_repo.get_by_id(workspace_id)
        if not workspace:
            logger.warning(
                "send_digest_workspace_not_found",
                workspace_id=workspace_id,
            )
            return

        # 1. Idempotency — skip if a sent digest already exists for this date
        existing = await digest_repo.get_for_workspace_date(workspace_id, digest_date)
        if existing and existing.status == "sent":
            logger.info(
                "digest_already_sent",
                workspace_id=workspace_id,
                digest_date=digest_date,
            )
            return

        # 2. Create digest record (or reuse existing failed/pending one)
        if existing:
            digest = existing
        else:
            digest = await digest_repo.create(
                workspace_id=workspace_id,
                digest_date=digest_date,
            )

        # 3. Fetch all processed updates for this workspace + date
        all_updates = await update_repo.get_workspace_updates_for_date(
            workspace_id=workspace_id,
            update_date=digest_date,
        )
        updates = [u for u in all_updates if u.status == "processed"]

        # 4. No processed updates — mark failed and exit
        if not updates:
            await digest_repo.update_status(digest.id, status="failed")
            await db.commit()
            logger.info(
                "digest_skipped_no_updates",
                workspace_id=workspace_id,
                digest_date=digest_date,
            )
            return

        # 5. Set status → processing
        await digest_repo.update_status(digest.id, status="processing")

        # 6. Build prompt from individual summaries
        summaries_text = "\n\n".join(f"- {u.summary or u.content}" for u in updates)
        prompt = build_digest_prompt(
            workspace_name=workspace.name,
            digest_date=digest_date,
            summaries=summaries_text,
            custom_prompt=getattr(workspace, "digest_prompt", None),
        )

        # 7. Call Claude — Sonnet primary, Haiku fallback on retry
        use_fallback = task.request.retries > 0
        try:
            team_summary = await summarise(prompt, use_fallback=use_fallback)
        except Exception as exc:
            logger.warning(
                "digest_summarise_failed",
                workspace_id=workspace_id,
                attempt=task.request.retries + 1,
                error=str(exc),
            )
            if task.request.retries >= task.max_retries:
                await digest_repo.update_status(digest.id, status="failed")
            raise exc

        # 8. Persist DigestItems + update count on digest record
        user_ids = [u.user_id for u in updates]
        profiles_by_id = await workspace_repo.get_profiles_for_updates(user_ids)

        items_payload = []
        for u in updates:
            profile = profiles_by_id.get(u.user_id)
            items_payload.append(
                {
                    "update_id": u.id,
                    "author_name": profile.full_name if profile else None,
                    "summary_snapshot": u.summary,
                }
            )

        await digest_repo.add_items(digest.id, items_payload)
        await digest_repo.update_status(
            digest.id,
            status="processing",  # still processing — email not sent yet
            summary=team_summary,
            update_count=len(updates),
        )

        # 9. Fetch recipients — members with per-workspace email_notifications=True
        rows = await workspace_repo.get_workspace_members_with_profiles(workspace_id)
        recipients = [(member, profile) for member, profile in rows if profile and member.email_notifications and profile.email]
        to_emails = [profile.email for _, profile in recipients]

        if not to_emails:
            logger.warning(
                "digest_no_recipients",
                workspace_id=workspace_id,
                digest_date=digest_date,
            )
            # Still mark sent — digest was generated, delivery is best-effort
            await digest_repo.update_status(
                digest.id,
                status="sent",
                email_sent_at=datetime.now(UTC),
            )
            await db.commit()
            return

        # 10. Build the shared items_for_template once — identical across
        # every recipient, only the unsubscribe link differs per-person.
        items_for_template = [
            {
                "author_name": item["author_name"],
                "summary_snapshot": item["summary_snapshot"],
            }
            for item in items_payload
        ]

        # 11. Render + send per-recipient — each email needs its own
        # unsubscribe link, so batched sending (previously up to 50
        # recipients/call) is no longer possible. See Known Tradeoff #3.

        sent_count = 0
        for member, profile in recipients:
            assert profile.email is not None

            token = generate_unsubscribe_token(workspace_id, member.user_id)
            unsubscribe_url = f"{settings.app_base_url}/api/v1/digests/unsubscribe/{token}"

            html = render_digest_email(
                workspace_name=workspace.name,
                digest_date=digest_date,
                team_summary=team_summary,
                items=items_for_template,
                unsubscribe_url=unsubscribe_url,
            )
            ok = await send_digest_email(
                to_emails=[profile.email],
                workspace_name=workspace.name,
                digest_date=digest_date,
                html=html,
            )
            if ok:
                sent_count += 1

        sent = sent_count > 0
        final_status = "sent" if sent else "failed"

        # 12. Post digest to Slack after email delivery (non-fatal)
        if final_status == "sent" and settings.slack_integration_enabled and workspace.slack_digest_enabled and workspace.slack_webhook_url_encrypted:
            try:
                from app.services.slack_service import SlackService

                slack_service = SlackService(db)
                slack_delivered = await slack_service.post_digest_to_slack(
                    workspace_id=workspace_id,
                    workspace_name=workspace.name,
                    digest_date=digest_date,
                    team_summary=team_summary,
                    items=items_for_template,
                )
                if slack_delivered:
                    await digest_repo.update_status(
                        digest.id,
                        status=final_status,
                        delivered_to_slack=True,
                        slack_delivered_at=datetime.now(UTC),
                    )
                    await db.commit()
                    logger.info("digest_slack_delivered", workspace_id=workspace_id)
            except Exception as slack_exc:
                logger.warning(
                    "slack_digest_delivery_failed",
                    workspace_id=workspace_id,
                    error=str(slack_exc),
                )

        logger.info(
            "digest_complete",
            workspace_id=workspace_id,
            digest_date=digest_date,
            status=final_status,
            recipient_count=len(to_emails),
        )
