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
    jwks_uri = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_uri)


def _get_token_algorithm(token: str) -> str | Any:
    """
    Peek at the JWT header to determine which algorithm was used.
    Returns the alg claim without verifying the signature.
    Falls back to 'RS256' if the header can't be decoded.
    """
    try:
        header = jwt.get_unverified_header(token)
        return header.get("alg", "RS256")
    except Exception:
        return "RS256"


async def validate_supabase_jwt(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict[str, Any]:
    """
    Validate a Supabase-issued JWT and return the decoded payload.

    Strategy:
    - Peek at the token header to determine the algorithm (alg claim).
    - ES256 / RS256: use JWKS endpoint for key lookup (works locally and in production).
    - HS256: use symmetric secret from settings (legacy local Supabase CLI < v1.50).
    - On JWKS key fetch failure, clear the cache and retry once (handles key rotation).

    Raises HTTP 401 for any validation failure.
    """
    token = credentials.credentials
    alg = _get_token_algorithm(token)

    try:
        if alg == "HS256":
            # Legacy path — old Supabase CLI versions used symmetric HS256.
            secret = settings.supabase_jwt_secret
            if secret is None:
                logger.error("supabase_jwt_secret_not_configured")
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
                    "verify_iss": False,
                },
            )
        else:
            # ES256 / RS256 path — current Supabase CLI and all production instances.
            # JWKS endpoint is available on both local and cloud Supabase.
            try:
                signing_key = get_jwks_client().get_signing_key_from_jwt(token)
            except PyJWKError:
                # Key may have rotated — clear cache and retry once
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

            # For local Supabase CLI, skip issuer verification because the
            # issuer in the token (http://127.0.0.1:54321/auth/v1) may not
            # match settings.supabase_url if Docker networking uses a
            # different hostname (e.g. http://supabase_auth:9999).
            verify_iss = settings.environment not in {"local", "test"}

            if verify_iss:
                # With issuer verification
                # Supabase's JWT `iss` claim includes the auth API version suffix
                # (e.g. "https://<project>.supabase.co/auth/v1"), while
                # settings.supabase_url is deliberately kept as the bare project URL
                # elsewhere (JWKS URI construction, REST calls) — see
                # app/lib/supabase.py and AuthRepository.update_password_with_recovery_token.
                # If Supabase ever ships /auth/v2, tokens will start failing issuer
                # verification here with InvalidIssuerError until this literal is
                # updated to match. Not derived from settings because the other
                # call sites append their own path segments and would double up
                # (e.g. /auth/v1/auth/v1/...) if the version were baked into the
                # base URL instead.
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    audience=getattr(settings, "supabase_jwt_aud", "authenticated"),
                    issuer=f"{settings.supabase_url}/auth/v1",
                    options={
                        "verify_exp": True,
                        "verify_aud": True,
                        "verify_iss": verify_iss,
                    },
                )
            else:
                # Without issuer verification (local/test environments)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    audience=getattr(settings, "supabase_jwt_aud", "authenticated"),
                    options={
                        "verify_exp": True,
                        "verify_aud": True,
                        "verify_iss": verify_iss,
                    },
                )

        return payload  # noqa: RET504

    except jwt.ExpiredSignatureError as e:
        logger.info("jwt_expired", token_prefix=token[:20])
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except jwt.PyJWTError as e:
        logger.warning("jwt_decode_failed", reason=type(e).__name__, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def validate_supabase_jwt_ws(token: str) -> dict[str, Any]:
    """
    Validate a JWT token passed as a query parameter (WebSocket auth).

    WebSocket connections cannot send Authorization headers in browsers,
    so the token is passed in the URL query string instead (?token=<jwt>).
    Wraps the token in HTTPAuthorizationCredentials and delegates to
    validate_supabase_jwt, reusing all existing validation logic including
    JWKS caching, algorithm detection, and environment-aware issuer checks.

    Args:
        token: Raw JWT string from the WebSocket query parameter.

    Returns:
        Decoded JWT payload dict. Caller should extract payload["sub"]
        for the authenticated user_id.

    Raises:
        HTTPException (401): Propagated from validate_supabase_jwt on
            invalid, expired, or malformed tokens. The WebSocket endpoint
            catches this and closes with code 4001 instead.
    """
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=token,
    )
    return await validate_supabase_jwt(credentials)
