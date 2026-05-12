# apps/api/tests/unit/test_jwt_validation.py
# Unit tests for validate_supabase_jwt and get_jwks_client
#
# Strategy:
#   - validate_supabase_jwt depends on get_jwks_client() which hits a network
#     endpoint. We patch get_jwks_client at the module level so no network
#     calls are made, then drive all branching through JWT payloads signed
#     with a known secret.
#   - The function uses RS256 in production (JWKS returns RSA public key),
#     but in ENVIRONMENT=local tests we control the signing key returned by
#     the mock, so we use HS256 for simplicity — the algorithm choice is
#     irrelevant to the logic under test (key fetch, decode, error mapping).

import time
from typing import Any
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import SecretStr

# Module path to patch — must match the import in utils/auth.py
JWKS_CLIENT_PATH = "app.utils.auth.get_jwks_client"

JWT_SECRET = "test-secret-for-unit-tests-32-ch"  # Noqa: S105 # pragma: allowlist secret
ALGORITHM = "HS256"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_token(payload: dict[str, Any]) -> str:
    """Sign a token with the test secret."""
    return pyjwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def _base_payload(exp_offset: int = 3600, user_id: str = "user-abc") -> dict[str, Any]:
    return {
        "sub": user_id,
        "email": "test@example.com",
        "exp": int(time.time()) + exp_offset,
        "aud": "authenticated",
        "role": "authenticated",
    }


def _mock_jwks_client(secret: str = JWT_SECRET) -> MagicMock:
    """
    Return a mock PyJWKClient whose get_signing_key_from_jwt returns
    a SigningKey-like object whose .key is our test secret.
    """
    signing_key = MagicMock()
    signing_key.key = secret

    client = MagicMock()
    client.get_signing_key_from_jwt.return_value = signing_key
    return client


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def patch_settings_local(monkeypatch):
    """Force local environment and set the JWT secret tests sign with."""
    monkeypatch.setattr("app.utils.auth.settings.environment", "local")
    monkeypatch.setattr("app.utils.auth.settings.supabase_url", "http://localhost:54321")
    monkeypatch.setattr("app.utils.auth.settings.supabase_jwt_secret", SecretStr(JWT_SECRET))


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_valid_token_returns_payload():
    """A correctly signed, unexpired token returns the full payload dict."""
    from app.utils.auth import validate_supabase_jwt

    token = _make_token(_base_payload())
    credentials = _credentials(token)

    with patch(JWKS_CLIENT_PATH, return_value=_mock_jwks_client()):
        result = await validate_supabase_jwt(credentials)

    assert result["sub"] == "user-abc"
    assert result["email"] == "test@example.com"
    assert result["aud"] == "authenticated"


@pytest.mark.asyncio
async def test_payload_fields_preserved():
    """Extra claims in the token are preserved in the returned payload."""
    from app.utils.auth import validate_supabase_jwt

    payload = _base_payload()
    payload["custom_claim"] = "hello"  # Noqa: S105
    token = _make_token(payload)

    with patch(JWKS_CLIENT_PATH, return_value=_mock_jwks_client()):
        result = await validate_supabase_jwt(_credentials(token))

    assert result["custom_claim"] == "hello"


# ---------------------------------------------------------------------------
# Expired tokens
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_expired_token_raises_401():
    """An expired token raises HTTP 401."""
    from app.utils.auth import validate_supabase_jwt

    token = _make_token(_base_payload(exp_offset=-60))  # expired 60s ago

    with patch(JWKS_CLIENT_PATH, return_value=_mock_jwks_client()):  # Noqa: SIM117
        with pytest.raises(HTTPException) as exc_info:
            await validate_supabase_jwt(_credentials(token))

    assert exc_info.value.status_code == 401
    assert exc_info.value.headers is not None
    assert "WWW-Authenticate" in exc_info.value.headers


@pytest.mark.asyncio
async def test_expired_token_error_detail():
    """Expired token returns generic 'Invalid or expired token' — no info leakage."""
    from app.utils.auth import validate_supabase_jwt

    token = _make_token(_base_payload(exp_offset=-1))

    with patch(JWKS_CLIENT_PATH, return_value=_mock_jwks_client()):  # Noqa: SIM117
        with pytest.raises(HTTPException) as exc_info:
            await validate_supabase_jwt(_credentials(token))

    assert exc_info.value.detail == "Invalid or expired token"


# ---------------------------------------------------------------------------
# Signature failures
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_wrong_signature_hs256_raises_401(monkeypatch):
    """
    Local path: token signed with a different HS256 secret fails validation.
    This is what 'wrong signature' looks like in local/test environments.
    """
    from app.utils.auth import validate_supabase_jwt

    # Sign with a different secret than what settings has
    wrong_secret = "wrong-secret-that-is-32-bytes-xx"  # Noqa: S105 # pragma: allowlist secret
    token = pyjwt.encode(_base_payload(), wrong_secret, algorithm="HS256")

    with pytest.raises(HTTPException) as exc_info:
        await validate_supabase_jwt(_credentials(token))

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_wrong_signature_rs256_raises_401(monkeypatch):
    """
    Production path: JWKS returns a key that doesn't match the token's signature.
    """
    from pydantic import SecretStr

    from app.utils.auth import validate_supabase_jwt

    with patch("app.utils.auth.settings.environment", "production"), patch("app.utils.auth.settings.supabase_jwt_secret", SecretStr("super-secret-jwt-token-with-at-least-32-characters-long")):
        token = _make_token(_base_payload())
        wrong_key_mock = _mock_jwks_client(secret="completely-wrong-secret-32-bytes")  # Noqa: S106 # pragma-allowlist

        with patch(JWKS_CLIENT_PATH, return_value=wrong_key_mock):  # Noqa: SIM117
            with pytest.raises(HTTPException) as exc_info:
                await validate_supabase_jwt(_credentials(token))

        assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_malformed_token_raises_401():
    """A token that is not valid JWT structure raises 401."""
    from app.utils.auth import validate_supabase_jwt

    with pytest.raises(HTTPException) as exc_info:
        await validate_supabase_jwt(_credentials("not.a.valid.jwt"))

    assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# JWKS key rotation retry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_jwks_retry_on_first_failure_succeeds():
    """
    If the first JWKS fetch raises PyJWKError, the cache is cleared and
    retried. If the retry succeeds, the token is validated normally.
    """
    from jwt import PyJWKError

    from app.utils.auth import validate_supabase_jwt

    token = _make_token(_base_payload())

    # First call raises, second call returns a valid key
    good_key = MagicMock()
    good_key.key = JWT_SECRET

    fail_client = MagicMock()
    fail_client.get_signing_key_from_jwt.side_effect = PyJWKError("stale key")

    good_client = MagicMock()
    good_client.get_signing_key_from_jwt.return_value = good_key

    # get_jwks_client is called twice — first returns fail_client, then good_client
    with patch(JWKS_CLIENT_PATH, side_effect=[fail_client, good_client]):  # Noqa: SIM117
        with patch("app.utils.auth.get_jwks_client.cache_clear"):
            result = await validate_supabase_jwt(_credentials(token))

    assert result["sub"] == "user-abc"


@pytest.mark.asyncio
async def test_jwks_retry_fails_raises_401():
    """
    If both the initial and retry JWKS fetch fail, a 401 is raised.
    """
    from jwt import PyJWKError

    from app.utils.auth import validate_supabase_jwt

    fail_client = MagicMock()
    fail_client.get_signing_key_from_jwt.side_effect = PyJWKError("still failing")

    with patch(JWKS_CLIENT_PATH, return_value=fail_client):  # Noqa: SIM117
        with patch("app.utils.auth.get_jwks_client.cache_clear"):
            with pytest.raises(HTTPException) as exc_info:
                await validate_supabase_jwt(_credentials("any.token.here"))

    assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# Issuer validation (non-local environments)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_issuer_validation_skipped_in_local(monkeypatch):
    """In ENVIRONMENT=local, issuer mismatch does NOT raise — iss check is skipped."""
    from app.utils.auth import validate_supabase_jwt

    monkeypatch.setattr("app.utils.auth.settings.environment", "local")

    payload = _base_payload()
    # wrong, but should be ignored
    payload["iss"] = "https://wrong-issuer.example.com"
    token = _make_token(payload)

    with patch(JWKS_CLIENT_PATH, return_value=_mock_jwks_client()):
        result = await validate_supabase_jwt(_credentials(token))

    assert result["sub"] == "user-abc"


@pytest.mark.asyncio
async def test_issuer_validation_enforced_in_production(monkeypatch):
    """In ENVIRONMENT=production, issuer mismatch raises 401."""
    from pydantic import SecretStr

    from app.utils.auth import validate_supabase_jwt

    with patch("app.utils.auth.settings.environment", "production"), patch("app.utils.auth.settings.supabase_jwt_secret", SecretStr("super-secret-jwt-token-with-at-least-32-characters-long")):
        payload = _base_payload()
        payload["iss"] = "https://wrong-issuer.example.com"
        token = _make_token(payload)

        with patch(JWKS_CLIENT_PATH, return_value=_mock_jwks_client()):  # Noqa: SIM117
            with pytest.raises(HTTPException) as exc_info:
                await validate_supabase_jwt(_credentials(token))

        assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_missing_jwt_secret_raises_401(monkeypatch):
    """HS256 path raises 401 when supabase_jwt_secret is None."""
    from app.utils.auth import validate_supabase_jwt

    monkeypatch.setattr("app.utils.auth.settings.environment", "local")
    monkeypatch.setattr("app.utils.auth.settings.supabase_jwt_secret", None)

    with pytest.raises(HTTPException) as exc_info:
        await validate_supabase_jwt(_credentials("any.token.here"))

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_rs256_path_invalid_token_raises_401(monkeypatch):
    """RS256 path (production) raises 401 on decode failure."""
    from app.utils.auth import validate_supabase_jwt

    with patch("app.utils.auth.settings.environment", "production"), patch("app.utils.auth.settings.supabase_jwt_secret", SecretStr("super-secret-jwt-token-with-at-least-32-characters-long")):
        good_key = MagicMock()
        good_key.key = "wrong-key"

        client_mock = MagicMock()
        client_mock.get_signing_key_from_jwt.return_value = good_key

        with patch(JWKS_CLIENT_PATH, return_value=client_mock):  # Noqa: SIM117
            with pytest.raises(HTTPException) as exc_info:
                await validate_supabase_jwt(_credentials(_make_token(_base_payload())))

        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# get_jwks_client caching
# ---------------------------------------------------------------------------


def test_get_jwks_client_is_cached():
    """get_jwks_client returns the same instance on repeated calls (lru_cache)."""
    from app.utils.auth import get_jwks_client

    get_jwks_client.cache_clear()
    with patch("app.utils.auth.PyJWKClient") as mock_cls:
        mock_cls.return_value = MagicMock()
        first = get_jwks_client()
        second = get_jwks_client()

    assert first is second
    assert mock_cls.call_count == 1  # constructed once only


def test_get_jwks_client_uses_supabase_url(monkeypatch):
    from app.utils.auth import get_jwks_client

    monkeypatch.setattr("app.utils.auth.settings.supabase_url", "http://localhost:54321")
    get_jwks_client.cache_clear()

    with patch("app.utils.auth.PyJWKClient") as mock_cls:
        mock_cls.return_value = MagicMock()
        get_jwks_client()

    mock_cls.assert_called_once_with(
        "http://localhost:54321/auth/v1/.well-known/jwks.json"  # ← corrected
    )
