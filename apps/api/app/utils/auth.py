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

# Supabase local uses HS256 (symmetric, signed with SUPABASE_JWT_SECRET).
# Supabase cloud uses RS256 (asymmetric, verified via JWKS endpoint).
# We detect which to use based on environment.
_LOCAL_ENVS = {"local", "test"}


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


def _is_local() -> bool:
    return settings.environment in _LOCAL_ENVS


async def validate_supabase_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict[str, Any]:
    token = credentials.credentials

    try:
        if _is_local():
            # HS256 path — local and test environments.
            # Verify directly against the JWT secret; no JWKS network call needed.
            secret = settings.supabase_jwt_secret
            if secret is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired token",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            payload = jwt.decode(
                token,
                secret.get_secret_value(),
                algorithms=["HS256"],
                audience=getattr(settings, "supabase_jwt_aud", "authenticated"),
                options={
                    "verify_exp": True,
                    "verify_aud": True,
                    "verify_iss": False,  # always skip iss in local/test
                },
            )
        else:
            # RS256 path — staging and production.
            # Fetch signing key from JWKS with rotation retry.
            try:
                signing_key = get_jwks_client().get_signing_key_from_jwt(token)
            except PyJWKError:
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

            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=getattr(settings, "supabase_jwt_aud", "authenticated"),
                issuer=settings.supabase_url,
                options={"verify_exp": True, "verify_aud": True, "verify_iss": True},
            )

        return payload  # noqa: RET504

    except jwt.PyJWTError as e:
        logger.warning("jwt_decode_failed", reason=type(e).__name__, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
