# apps/api/app/workers/tasks.py

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

from celery import Task
from celery.utils.log import get_task_logger

from app.config import settings
from app.workers.celery_app import celery_app

if TYPE_CHECKING:
    from redis.asyncio import Redis
    from sqlalchemy.ext.asyncio import AsyncEngine

logger = get_task_logger(__name__)


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

            self._db_engine = create_async_engine(settings.database_url)
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


async def _process_update_async(task: ProcessUpdateTask, update_id: str) -> None:
    """
    Async implementation of the update processing pipeline.

    Imports are deferred to function scope to avoid circular import issues
    at module load time — celery_app imports tasks, tasks would import
    from app modules that may not be fully initialised yet.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.lib.claude import summarise
    from app.lib.events import publish_event
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
        await publish_event(
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
            await publish_event(
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
                await publish_event(
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
