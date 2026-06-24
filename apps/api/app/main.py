# apps/api/app/main.py
# FastAPI application factory

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import analytics, audio, auth, digests, health, invites, members, updates, workspaces
from app.routers.websockets import router as websocket_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manage application lifespan events.

    """
    yield


def create_app() -> FastAPI:
    """Application factory pattern for clean testing + config."""
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

    return app


# Create app instance for Uvicorn
app = create_app()
