# apps/api/app/api/dependencies.py
# Reusable FastAPI dependencies — cross-cutting concerns

from collections.abc import Awaitable, Callable
from typing import Annotated, Any

import structlog
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.redis import get_redis_client
from app.db.session import get_db_session
from app.lib.rate_limit import RateLimitExceededError, check_rate_limit
from app.utils.api_versioning import ApiVersionInfo
from app.utils.api_versioning import get_api_version as _get_api_version
from app.utils.auth import security, validate_supabase_jwt

logger = structlog.get_logger(__name__)


# === Type Aliases for Cleaner Signatures ===
DBSessionDep = Annotated[AsyncSession, Depends(get_db_session)]
ApiVersionDep = Annotated[ApiVersionInfo, Depends(_get_api_version)]


# === Authentication Dependencies ===


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    payload: dict[str, Any] = Depends(validate_supabase_jwt),
) -> dict[str, str]:
    """
    Extract user context from validated Supabase JWT.
    Returns dict with user_id, email, and access_token.
    401 is raised upstream by validate_supabase_jwt if token is invalid.
    """
    return {
        "user_id": payload["sub"],
        "email": payload.get("email", ""),
        "access_token": credentials.credentials,
    }


async def require_auth(
    user_ctx: dict[str, str] = Depends(get_current_user),
) -> dict[str, str]:
    """
    Backward-compatible alias for get_current_user.
    Existing routers using UserContextDep keep working unchanged.
    """
    return user_ctx


async def require_onboarded(
    user_ctx: dict[str, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """
    Extends get_current_user — additionally checks that the user has
    completed onboarding before accessing app routes.

    Returns the same user_ctx dict as get_current_user so existing
    handler signatures don't need to change.

    Raises:
        HTTP 403 if the user's profile has is_onboarded = False,
        or if no profile exists yet.
    """
    from app.repositories.profile_repo import ProfileRepository

    profile_repo = ProfileRepository.from_session(db)
    profile = await profile_repo.get_by_user_id(user_ctx["user_id"])

    if not profile or not profile.is_onboarded:
        logger.info(
            "onboarding_required",
            user_id=user_ctx["user_id"],
            profile_exists=profile is not None,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Onboarding required before accessing this resource.",
        )

    return user_ctx


# === Rate-limiting Dependency Factory ===


def rate_limit(
    scope: str,
    requests_per_minute: int | None = None,
    burst: int | None = None,
) -> Callable[[Request, Redis], Awaitable[None]]:
    """
    Dependency factory — rate-limits requests per client IP, scoped by
    `scope` so different endpoints don't share the same bucket.

    Usage:
        @router.post(
            "/...",
            dependencies=[Depends(rate_limit("update_submit"))],
        )

    Defaults to settings.rate_limit_requests_per_minute /
    .rate_limit_burst unless overridden per-call. No-ops entirely if
    settings.rate_limit_enabled is False (e.g. for load testing).

    Keyed by client IP per the milestone's documented tradeoff — flat,
    not per-user or tier-based, since billing/plans don't exist yet.
    """

    async def _check(request: Request, redis: RedisDep) -> None:
        if not settings.rate_limit_enabled:
            return

        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:{scope}:{client_ip}"

        allowed, retry_after = await check_rate_limit(
            redis,
            key,
            requests_per_minute or settings.rate_limit_requests_per_minute,
            burst if burst is not None else settings.rate_limit_burst,
        )
        if not allowed:
            logger.info(
                "rate_limit_exceeded",
                scope=scope,
                client_ip=client_ip,
                retry_after=round(retry_after, 2),
            )
            raise RateLimitExceededError(retry_after)

    return _check


# === Convenience Aliases ===


# New canonical alias — use in all new routers
AuthDep = Annotated[dict[str, str], Depends(get_current_user)]

# Onboarding gate — use on all post-onboarding app routes
OnboardedDep = Annotated[dict[str, str], Depends(require_onboarded)]

RedisDep = Annotated[Redis, Depends(get_redis_client)]

# Legacy alias — existing routers keep working unchanged
UserContextDep = Annotated[dict[str, str], Depends(require_auth)]
