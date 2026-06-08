# apps/api/app/workers/celery_app.py

from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "soarup",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_time_limit=300,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
)

celery_app.conf.beat_schedule = {
    "check-workspace-digests": {
        "task": "app.workers.tasks.check_and_send_digests",
        "schedule": crontab(minute="*/5"),
    },
}


@celery_app.task(bind=True)  # type: ignore[misc]
def health_check() -> dict[str, str]:
    """Dummy task to verify Celery worker is running."""
    return {"status": "ok", "worker": "healthy"}
