# app/utils/auth.py

from functools import lru_cache
from typing import Any

import jwt
import structlog
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWKError

from app.config import settings

security = HTTPBearer()
logger = structlog.get_logger(__name__)


@lru_cache(maxsize=1)
def get_jwks_client() -> PyJWKClient:
    """
    Get cached JWKS client for JWT signature verification.

    Returns:
        PyJWKClient instance configured with Supabase JWKS URI.

    Note:
        Results are cached using @lru_cache to avoid repeated network calls.
        Call get_jwks_client.cache_clear() to refresh the cache (e.g., on key rotation).
    """
    jwks_uri = f"{settings.supabase_url}/auth/v1/jwks"
    return PyJWKClient(jwks_uri)


async def validate_supabase_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict[str, Any]:
    token = credentials.credentials

    # 1. Fetch signing key (with rotation retry)
    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(token)
    except PyJWKError:
        # Key rotation or transient network issue — clear cache and retry once
        get_jwks_client.cache_clear()
        try:
            signing_key = get_jwks_client().get_signing_key_from_jwt(token)
        except PyJWKError as e:
            logger.warning("jwks_fetch_failed_after_retry", error=str(e))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e

    # 2. Decode & validate JWT
    try:
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=getattr(settings, "supabase_jwt_aud", "authenticated"),
            issuer=settings.supabase_url,
            options={"verify_exp": True, "verify_aud": True, "verify_iss": settings.environment != "local"},
        )
        return payload  # noqa: RET504
    except jwt.PyJWTError as e:
        logger.warning(
            "jwt_decode_failed",
            reason=type(e).__name__,
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
