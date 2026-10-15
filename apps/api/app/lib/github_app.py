"""
GitHub App auth utilities.

Provides:
  generate_app_jwt()        – RS256 JWT signed with the App private key
  get_installation_token()  – short-lived installation access token, Redis-cached
"""

from __future__ import annotations

import base64
import time

import httpx
import jwt  # PyJWT

from app.config import settings
from app.db.redis import get_redis_client

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

GITHUB_API_BASE = "https://api.github.com"
_TOKEN_TTL_SECONDS = 3000  # cache for 50 min; GitHub issues 60-min tokens


def _load_private_key() -> str:
    """Decode the base64-encoded PEM from settings and return the raw PEM string."""
    if settings.github_app_private_key_base64 is None:
        raise RuntimeError("GITHUB_APP_PRIVATE_KEY_BASE64 is not configured")
    raw = base64.b64decode(settings.github_app_private_key_base64.get_secret_value())
    return raw.decode("utf-8")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_app_jwt() -> str:
    """
    Generate a 10-minute App-level JWT signed with RS256.

    GitHub requires:
      - iat: now - 60 s  (clock-skew buffer)
      - exp: now + 600 s (10 min max)
      - iss: App ID (string)
    """
    if settings.github_app_id is None:
        raise RuntimeError("GITHUB_APP_ID is not configured")

    now = int(time.time())
    payload: dict[str, int | str] = {
        "iat": now - 60,
        "exp": now + 600,
        "iss": settings.github_app_id,
    }
    private_key = _load_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")


async def get_installation_token(installation_id: int) -> str:
    """
    Return a valid installation access token for *installation_id*.

    Tokens are cached in Redis under the key
    ``gh:install_token:<installation_id>`` for 50 minutes (GitHub issues
    60-minute tokens; the 10-minute buffer prevents using a token that is
    about to expire).

    Raises ``httpx.HTTPStatusError`` if GitHub returns a non-2xx response.
    """
    redis = get_redis_client()
    cache_key = f"gh:install_token:{installation_id}"

    cached = redis.get(cache_key)
    if isinstance(cached, str):
        return cached  # decode_responses=True → already str

    app_jwt = generate_app_jwt()
    url = f"{GITHUB_API_BASE}/app/installations/{installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {app_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers)
        response.raise_for_status()

    token: str = response.json()["token"]
    redis.setex(cache_key, _TOKEN_TTL_SECONDS, token)
    return token
