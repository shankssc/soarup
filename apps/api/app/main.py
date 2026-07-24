# apps/api/app/main.py
# FastAPI application factory

import math
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import create_error_response
from app.config import settings
from app.lib.rate_limit import RateLimitExceededError
from app.lib.sentry import init_sentry
from app.routers import analytics, audio, auth, digests, health, invites, members, public_profiles, slack, unsubscribe, updates, workspaces
from app.routers.websockets import router as websocket_router

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manage application lifespan events.

    """
    yield


def create_app() -> FastAPI:
    """Application factory pattern for clean testing + config."""
    logger.info("sentry_dsn_check", configured=bool(settings.sentry_dsn))
    init_sentry()

    app = FastAPI(
        title="SoarUp API",
        version="0.1.0",
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url="/redoc" if settings.environment != "production" else None,
        lifespan=lifespan,
    )

    # CORS middleware (tighten in production)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routers
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(workspaces.router, prefix="/api/v1")
    app.include_router(updates.router, prefix="/api/v1")
    app.include_router(websocket_router, prefix="/api/v1")
    app.include_router(audio.router, prefix="/api/v1")
    app.include_router(members.router, prefix="/api/v1")
    app.include_router(invites.router, prefix="/api/v1")
    app.include_router(digests.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(slack.router, prefix="/api/v1")
    app.include_router(public_profiles.router, prefix="/api/v1")
    app.include_router(unsubscribe.router, prefix="/api/v1")

    """
    Rate Limiting - RateLimitExceededError is raised by the rate_limit
    dependency factory (app/api/dependencies.py), not by a service, so
    it doesn't go through the usual *Error / handle_*_error pattern.
    A dependency-level exception has to be caught here, at the app
    level — by the time a route's own try/except runs, dependencies
    have already been resolved, so a route body can never catch this.
    """

    @app.exception_handler(RateLimitExceededError)
    async def rate_limit_exception_handler(request: Request, exc: RateLimitExceededError) -> JSONResponse:
        response = create_error_response(
            error_code="rate_limited",
            message="Too many requests. Please slow down and try again shortly.",
            status_code=429,
        )
        response.headers["Retry-After"] = str(math.ceil(exc.retry_after))
        return response

    return app
