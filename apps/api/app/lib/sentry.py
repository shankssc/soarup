# apps/api/app/lib/sentry.py
# Initializes Sentry error tracking for the FastAPI app and Celery workers.
#
# Both processes call init_sentry() independently — FastAPI's app.py at
# import time (before the app is constructed), and the Celery worker's
# entrypoint at startup. They share this one init function so the config
# (PII scrubbing, environment tag, integrations) can't drift between the
# two processes.
#
# send_default_pii is hardcoded False, not settings-driven — this is a
# safety default, not something that should be flippable per-environment.
#
# No-ops if SENTRY_DSN is unset (local dev), so nothing breaks when the
# var is absent from .env.

import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.config import settings

# 0.1 = 10% of transactions traced for performance monitoring.
# Set to 0 to disable perf tracing entirely and keep only error capture.
TRACES_SAMPLE_RATE = 0.1


def init_sentry() -> None:
    """
    Initialize Sentry for the current process (FastAPI or Celery).

    Safe to call from both apps/api's app.py and the Celery worker
    entrypoint — each process needs its own init call since they're
    separate Python processes, not shared state.

    No-ops if settings.sentry_dsn is unset, so local dev environments
    without a DSN configured don't error out or send anything.
    """
    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            CeleryIntegration(),
        ],
        traces_sample_rate=TRACES_SAMPLE_RATE,
        send_default_pii=False,
    )
