# apps/api/app/api/dependencies.py
# Reusable FastAPI dependencies — cross-cutting concerns

from typing import Annotated, Any

import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
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


# === Convenience Aliases ===

# New canonical alias — use in all new routers
AuthDep = Annotated[dict[str, str], Depends(get_current_user)]

# Onboarding gate — use on all post-onboarding app routes
OnboardedDep = Annotated[dict[str, str], Depends(require_onboarded)]

# Legacy alias — existing routers keep working unchanged
UserContextDep = Annotated[dict[str, str], Depends(require_auth)]
