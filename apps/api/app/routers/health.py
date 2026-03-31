# apps/api/app/routers/health.py
# Health check endpoint

from fastapi import APIRouter, status
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Response schema for /health endpoint."""

    status: str = Field(..., description="Overall health status", examples=["ok"])
    version: str = Field(..., description="API version", examples=["0.1.0"])
    database: str = Field(..., description="Database connection status", examples=["ok"])
    redis: str = Field(..., description="Redis connection status", examples=["ok"])
    worker: str = Field(..., description="Celery worker status", examples=["ok"])


router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Health check",
    description="Returns API and dependency health status. No authentication required.",
    tags=["health"],
)
async def health_check() -> HealthResponse:
    """
    Basic health check endpoint.

    Milestone 0: Returns static "ok" values.
    Milestone 1+: Will perform actual connectivity checks.
    """
    return HealthResponse(
        status="ok",
        version="0.1.0",
        database="ok",
        redis="ok",
        worker="ok",
    )
