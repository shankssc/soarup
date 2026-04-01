# apps/api/app/api/dependencies.py
# Reusable FastAPI dependencies — cross-cutting concerns

from typing import Annotated

import structlog
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.services.auth_service import AuthService
from app.utils.api_versioning import ApiVersionInfo
from app.utils.api_versioning import get_api_version as _get_api_version

logger = structlog.get_logger(__name__)

# === Type Aliases for Cleaner Signatures ===
DBSessionDep = Annotated[AsyncSession, Depends(get_db_session)]
ApiVersionDep = Annotated[ApiVersionInfo, Depends(_get_api_version)]


# === Authentication Dependencies ===


async def get_current_user_token(request: Request) -> str | None:
    """
    Extract Bearer token from Authorization header.

    Returns:
        access_token string if valid header, None otherwise.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header[7:]  # Remove "Bearer " prefix


async def require_auth(
    token: Annotated[str | None, Depends(get_current_user_token)],
    service: Annotated[AuthService, Depends(lambda db: AuthService(db))],  # Lazy init
) -> dict[str, str]:
    """
    Dependency to require valid JWT and return user context.

    Returns:
        Dict with user_id and email for service layer use.

    Raises:
        HTTPException 401 if token is missing or invalid.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "missing_token", "message": "Authorization header required"},
        )

    user = await service.get_current_user(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Token is invalid or expired"},
        )

    return {"user_id": user.id, "email": user.email, "access_token": token}


# === Convenience Aliases ===
# Usage in router: async def my_route(user_ctx: UserContextDep = Depends(require_auth)):
UserContextDep = Annotated[dict[str, str], Depends(require_auth)]
