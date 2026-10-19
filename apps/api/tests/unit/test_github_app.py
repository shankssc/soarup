# apps/api/tests/unit/test_github_app.py
# Unit tests for app/lib/github_app.py
#
# Strategy:
#   - generate_app_jwt: generate a test RSA key pair on the fly; verify
#     claims without real GitHub creds
#   - get_installation_token: mock httpx; test happy path, failure, cache hit

from __future__ import annotations

import base64
import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt as pyjwt
import pytest
from pydantic import SecretStr

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _generate_rsa_pem() -> tuple[str, object]:
    """Returns (pem_private_key_str, public_key_object) for a fresh RSA key pair."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return pem, private_key.public_key()


def _mock_token_response(
    token: str = "ghs_test_token",  # Noqa: S107
    expires_at: str = "2099-01-01T00:00:00Z",
    status_code: int = 201,
) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = {"token": token, "expires_at": expires_at}
    resp.raise_for_status = MagicMock()
    return resp


def _mock_async_client(response: MagicMock) -> AsyncMock:
    client = AsyncMock()
    client.post = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


# ---------------------------------------------------------------------------
# generate_app_jwt
# ---------------------------------------------------------------------------


class TestGenerateAppJwt:
    def _patch_settings(self, pem: str, app_id: str = "12345"):
        """Context manager that patches the settings used by generate_app_jwt."""
        # NOTE: adjust attribute names if your Settings model uses different names,
        # e.g. github_private_key / github_app_id
        pem_b64 = base64.b64encode(pem.encode()).decode()
        return patch.multiple(
            "app.lib.github_app.settings",
            github_app_private_key_base64=SecretStr(pem_b64),  # ← wrap it
            github_app_id=app_id,
        )

    def test_returns_string(self):
        from app.lib.github_app import generate_app_jwt

        pem, _ = _generate_rsa_pem()
        with self._patch_settings(pem):
            token = generate_app_jwt()

        assert isinstance(token, str)
        assert len(token) > 0

    def test_signed_with_rs256(self):
        from app.lib.github_app import generate_app_jwt

        pem, _ = _generate_rsa_pem()
        with self._patch_settings(pem):
            token = generate_app_jwt()

        header = pyjwt.get_unverified_header(token)
        assert header["alg"] == "RS256"

    def test_iss_claim_is_app_id(self):
        from app.lib.github_app import generate_app_jwt

        pem, public_key = _generate_rsa_pem()
        with self._patch_settings(pem, app_id="99999"):
            token = generate_app_jwt()

        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_exp": False},
        )
        assert payload["iss"] == "99999"

    def test_exp_is_in_future(self):
        from app.lib.github_app import generate_app_jwt

        pem, public_key = _generate_rsa_pem()
        with self._patch_settings(pem):
            token = generate_app_jwt()

        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_exp": False},
        )
        assert payload["exp"] > int(time.time())

    def test_iat_is_not_in_future(self):
        from app.lib.github_app import generate_app_jwt

        pem, public_key = _generate_rsa_pem()
        with self._patch_settings(pem):
            token = generate_app_jwt()

        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_exp": False},
        )
        assert payload["iat"] <= int(time.time())


# ---------------------------------------------------------------------------
# get_installation_token
# ---------------------------------------------------------------------------


class TestGetInstallationToken:
    pytestmark = pytest.mark.asyncio

    async def test_returns_token_on_success(self):
        from app.lib.github_app import get_installation_token

        mock_resp = _mock_token_response("ghs_test")
        mock_client = _mock_async_client(mock_resp)
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.setex = AsyncMock(return_value=True)

        with (
            patch("app.lib.github_app.httpx.AsyncClient", return_value=mock_client),
            patch("app.lib.github_app.generate_app_jwt", return_value="fake-jwt"),
            patch("app.lib.github_app.get_redis_client", return_value=mock_redis),
        ):
            token = await get_installation_token(10001)

        assert token == "ghs_test"  # Noqa: S105
        assert mock_client.post.call_count == 1

    async def test_raises_on_http_exception(self):
        from app.lib.github_app import get_installation_token

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(side_effect=Exception("network error"))

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)

        with (
            patch("app.lib.github_app.httpx.AsyncClient", return_value=mock_client),
            patch("app.lib.github_app.generate_app_jwt", return_value="fake-jwt"),
            patch("app.lib.github_app.get_redis_client", return_value=mock_redis),
            pytest.raises(Exception, match="network error"),
        ):
            await get_installation_token(10002)

    async def test_caches_token_across_calls(self):
        """Two calls with the same installation_id → only one HTTP request."""
        from app.lib.github_app import get_installation_token

        mock_resp = _mock_token_response("ghs_cached")
        mock_client = _mock_async_client(mock_resp)
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(side_effect=[None, "ghs_cached"])
        mock_redis.setex = AsyncMock(return_value=True)

        with (
            patch("app.lib.github_app.httpx.AsyncClient", return_value=mock_client),
            patch("app.lib.github_app.generate_app_jwt", return_value="fake-jwt"),
            patch("app.lib.github_app.get_redis_client", return_value=mock_redis),
        ):
            t1 = await get_installation_token(10003)
            t2 = await get_installation_token(10003)

        assert t1 == t2 == "ghs_cached"
        # Only one POST despite two calls — second hit the cache
        assert mock_client.post.call_count == 1

    async def test_posts_to_correct_endpoint(self):
        from app.lib.github_app import GITHUB_API_BASE, get_installation_token

        mock_resp = _mock_token_response()
        mock_client = _mock_async_client(mock_resp)
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.setex = AsyncMock(return_value=True)

        with (
            patch("app.lib.github_app.httpx.AsyncClient", return_value=mock_client),
            patch("app.lib.github_app.generate_app_jwt", return_value="fake-jwt"),
            patch("app.lib.github_app.get_redis_client", return_value=mock_redis),
        ):
            await get_installation_token(10004)

        call_args = mock_client.post.call_args
        url = call_args.args[0] if call_args.args else call_args.kwargs.get("url", "")
        assert f"{GITHUB_API_BASE}/app/installations/10004/access_tokens" in url
