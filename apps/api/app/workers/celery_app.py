from celery import Celery

from app.config import settings

# Create Celery app
celery_app = Celery(
    "soarup",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[],  # No tasks yet - added in Milestone 3
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max per task
    worker_prefetch_multiplier=1,
)


# Milestone 0: Dummy task to verify worker starts
@celery_app.task(bind=True)  # type: ignore[misc]
def health_check() -> dict[str, str]:
    """Dummy task to verify Celery worker is running."""
    return {"status": "ok", "worker": "healthy"}
