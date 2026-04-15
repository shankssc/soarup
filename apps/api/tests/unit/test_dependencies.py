# apps/api/tests/unit/test_dependencies.py
# Unit tests for get_current_user and require_auth
#
# Strategy:
#   These functions sit between JWT validation (already tested in
#   test_jwt_validation.py) and the service layer. We test them by calling
#   them directly with controlled inputs rather than going through the
#   full FastAPI dependency chain.
#
#   get_current_user takes:
#     - credentials: HTTPAuthorizationCredentials  (the raw Bearer token)
#     - payload: dict  (the already-decoded JWT payload from validate_supabase_jwt)
#   Both are injected directly here — no mocking of validate_supabase_jwt needed.

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from app.api.dependencies import get_current_user, require_auth


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _credentials(token: str = "some-access-token") -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _payload(
    user_id: str = "user-abc",
    email: str = "test@example.com",
    extra: dict | None = None,
) -> dict:
    base = {"sub": user_id, "email": email, "aud": "authenticated"}
    if extra:
        base.update(extra)
    return base


# ---------------------------------------------------------------------------
# get_current_user()
# ---------------------------------------------------------------------------

class TestGetCurrentUser:
    @pytest.mark.asyncio
    async def test_returns_user_context_dict(self):
        result = await get_current_user(
            credentials=_credentials("my-token"),
            payload=_payload(),
        )

        assert result == {
            "user_id": "user-abc",
            "email": "test@example.com",
            "access_token": "my-token",
        }

    @pytest.mark.asyncio
    async def test_user_id_extracted_from_sub(self):
        result = await get_current_user(
            credentials=_credentials(),
            payload=_payload(user_id="specific-user-id"),
        )

        assert result["user_id"] == "specific-user-id"

    @pytest.mark.asyncio
    async def test_email_extracted_from_payload(self):
        result = await get_current_user(
            credentials=_credentials(),
            payload=_payload(email="specific@example.com"),
        )

        assert result["email"] == "specific@example.com"

    @pytest.mark.asyncio
    async def test_access_token_comes_from_credentials(self):
        """The raw token from the Authorization header is passed through unchanged."""
        result = await get_current_user(
            credentials=_credentials("raw-bearer-token"),
            payload=_payload(),
        )

        assert result["access_token"] == "raw-bearer-token"

    @pytest.mark.asyncio
    async def test_missing_email_in_payload_defaults_to_empty_string(self):
        """email is extracted with .get() — missing key returns empty string, not KeyError."""
        payload_without_email = {"sub": "user-abc", "aud": "authenticated"}

        result = await get_current_user(
            credentials=_credentials(),
            payload=payload_without_email,
        )

        assert result["email"] == ""

    @pytest.mark.asyncio
    async def test_returns_exactly_three_keys(self):
        """Context dict has exactly user_id, email, access_token — no extra fields."""
        result = await get_current_user(
            credentials=_credentials(),
            payload=_payload(extra={"role": "admin", "custom": "claim"}),
        )

        assert set(result.keys()) == {"user_id", "email", "access_token"}

    @pytest.mark.asyncio
    async def test_different_users_produce_different_contexts(self):
        result_a = await get_current_user(
            credentials=_credentials("token-a"),
            payload=_payload(user_id="user-1", email="a@example.com"),
        )
        result_b = await get_current_user(
            credentials=_credentials("token-b"),
            payload=_payload(user_id="user-2", email="b@example.com"),
        )

        assert result_a["user_id"] != result_b["user_id"]
        assert result_a["access_token"] != result_b["access_token"]


# ---------------------------------------------------------------------------
# require_auth()
# ---------------------------------------------------------------------------

class TestRequireAuth:
    @pytest.mark.asyncio
    async def test_require_auth_passes_through_user_context(self):
        """require_auth is a transparent alias — output matches get_current_user."""
        user_ctx = {
            "user_id": "user-abc",
            "email": "test@example.com",
            "access_token": "tok",
        }

        result = await require_auth(user_ctx=user_ctx)

        assert result == user_ctx

    @pytest.mark.asyncio
    async def test_require_auth_output_identical_to_get_current_user(self):
        """
        Both functions with the same inputs must produce identical output.
        This guards against require_auth accidentally transforming the context.
        """
        credentials = _credentials("shared-token")
        payload = _payload()

        from_get = await get_current_user(credentials=credentials, payload=payload)
        from_require = await require_auth(user_ctx=from_get)

        assert from_get == from_require

    @pytest.mark.asyncio
    async def test_require_auth_preserves_all_context_fields(self):
        user_ctx = {
            "user_id": "user-xyz",
            "email": "xyz@example.com",
            "access_token": "xyz-token",
        }

        result = await require_auth(user_ctx=user_ctx)

        assert result["user_id"] == "user-xyz"
        assert result["email"] == "xyz@example.com"
        assert result["access_token"] == "xyz-token"


# ---------------------------------------------------------------------------
# Type alias sanity checks (AuthDep / UserContextDep)
# ---------------------------------------------------------------------------

def test_auth_dep_alias_points_to_get_current_user():
    """AuthDep annotation wraps get_current_user."""
    from app.api.dependencies import AuthDep
    import typing

    args = typing.get_args(AuthDep)
    # args[1] is the Depends(...) instance
    assert args[1].dependency is get_current_user


def test_user_context_dep_alias_points_to_require_auth():
    """UserContextDep annotation wraps require_auth (legacy alias)."""
    from app.api.dependencies import UserContextDep
    import typing

    args = typing.get_args(UserContextDep)
    assert args[1].dependency is require_auth
