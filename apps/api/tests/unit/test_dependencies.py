# apps/api/tests/unit/test_dependencies.py
# Unit tests for get_current_user, require_auth, and require_onboarded
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
#
#   require_onboarded takes:
#     - user_ctx: dict  (from get_current_user)
#     - db: AsyncSession  (real session from db_session fixture)
#   These tests require a real DB session since the dependency calls
#   ProfileRepository.get_by_user_id against soarup_test.

from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.dependencies import get_current_user, require_auth, require_onboarded

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _credentials(token: str = "some-access-token") -> HTTPAuthorizationCredentials:  # Noqa: S107
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _payload(
    user_id: str = "user-abc",
    email: str = "test@example.com",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base = {"sub": user_id, "email": email, "aud": "authenticated"}
    if extra:
        base.update(extra)
    return base


def _user_ctx(
    user_id: str = "user-abc",
    email: str = "test@example.com",
) -> dict[str, str]:
    return {"user_id": user_id, "email": email, "access_token": "tok"}


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

        assert result["access_token"] == "raw-bearer-token"  # Noqa: S105

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
        assert result["access_token"] == "xyz-token"  # Noqa: S105


# ---------------------------------------------------------------------------
# Type alias sanity checks (AuthDep / UserContextDep)
# ---------------------------------------------------------------------------


def test_auth_dep_alias_points_to_get_current_user():
    """AuthDep annotation wraps get_current_user."""
    import typing

    from app.api.dependencies import AuthDep

    args = typing.get_args(AuthDep)
    # args[1] is the Depends(...) instance
    assert args[1].dependency is get_current_user


def test_user_context_dep_alias_points_to_require_auth():
    """UserContextDep annotation wraps require_auth (legacy alias)."""
    import typing

    from app.api.dependencies import UserContextDep

    args = typing.get_args(UserContextDep)
    assert args[1].dependency is require_auth


def test_onboarded_dep_alias_points_to_require_onboarded():
    """OnboardedDep annotation wraps require_onboarded."""
    import typing

    from app.api.dependencies import OnboardedDep

    args = typing.get_args(OnboardedDep)
    assert args[1].dependency is require_onboarded


# ---------------------------------------------------------------------------
# require_onboarded()
#
# These tests use a real DB session — they need seeded_profile and
# test_user_id from conftest since require_onboarded calls ProfileRepository.
# ---------------------------------------------------------------------------


@pytest.mark.db
class TestRequireOnboarded:
    @pytest.mark.asyncio
    async def test_passes_when_profile_is_onboarded(self, db_session, test_user_id, seeded_profile):
        """
        Returns user_ctx unchanged when profile.is_onboarded is True.
        seeded_profile inserts a Profile row; we update is_onboarded before calling.
        """
        # Set is_onboarded directly on the already-seeded profile object
        # Avoids calling repo.update() which commits and closes the transaction
        seeded_profile.is_onboarded = True
        await db_session.flush()

        user_ctx = _user_ctx(user_id=test_user_id)
        result = await require_onboarded(user_ctx=user_ctx, db=db_session)

        assert result == user_ctx

    @pytest.mark.asyncio
    async def test_returns_same_user_ctx_dict(self, db_session, test_user_id, seeded_profile):
        """Return value is the exact same user_ctx — no transformation."""
        seeded_profile.is_onboarded = True
        await db_session.flush()

        user_ctx = _user_ctx(user_id=test_user_id)
        result = await require_onboarded(user_ctx=user_ctx, db=db_session)

        assert result["user_id"] == test_user_id
        assert result["email"] == "test@example.com"
        assert result["access_token"] == "tok"  # Noqa: S105 # pragma-allowlist

    @pytest.mark.asyncio
    async def test_raises_403_when_not_onboarded(self, db_session, test_user_id, seeded_profile):
        """
        Raises HTTP 403 when profile exists but is_onboarded is False.
        seeded_profile creates the row with is_onboarded defaulting to False.
        """
        user_ctx = _user_ctx(user_id=test_user_id)

        with pytest.raises(HTTPException) as exc_info:
            await require_onboarded(user_ctx=user_ctx, db=db_session)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_403_detail_mentions_onboarding(self, db_session, test_user_id, seeded_profile):
        """Error detail should communicate onboarding is required."""
        user_ctx = _user_ctx(user_id=test_user_id)

        with pytest.raises(HTTPException) as exc_info:
            await require_onboarded(user_ctx=user_ctx, db=db_session)

        assert "onboarding" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_403_when_no_profile_exists(self, db_session, test_user_id):
        """
        Raises HTTP 403 when no profile row exists for the user.
        Does NOT use seeded_profile — user_id has no profile in DB.
        """
        user_ctx = _user_ctx(user_id=test_user_id)

        with pytest.raises(HTTPException) as exc_info:
            await require_onboarded(user_ctx=user_ctx, db=db_session)

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_no_profile_and_not_onboarded_both_return_403(self, db_session, test_user_id, seeded_profile):
        """
        Both missing profile and is_onboarded=False result in the same 403.
        The client should not be able to distinguish which case triggered it.
        """
        # Case 1: profile exists, not onboarded
        user_ctx = _user_ctx(user_id=test_user_id)
        with pytest.raises(HTTPException) as exc_not_onboarded:
            await require_onboarded(user_ctx=user_ctx, db=db_session)

        # Case 2: no profile at all (use a different user_id)
        import uuid

        ghost_ctx = _user_ctx(user_id=str(uuid.uuid4()))
        with pytest.raises(HTTPException) as exc_no_profile:
            await require_onboarded(user_ctx=ghost_ctx, db=db_session)

        assert exc_not_onboarded.value.status_code == exc_no_profile.value.status_code == 403

    @pytest.mark.asyncio
    async def test_onboarded_false_after_being_true_raises_403(self, db_session, test_user_id, seeded_profile):
        """
        If is_onboarded is set back to False (edge case — shouldn't happen in
        normal flow but worth guarding), dependency raises 403.
        """
        # Set True then back to False — all within the same flush, no commit
        seeded_profile.is_onboarded = True
        await db_session.flush()

        seeded_profile.is_onboarded = False
        await db_session.flush()

        user_ctx = _user_ctx(user_id=test_user_id)

        with pytest.raises(HTTPException) as exc_info:
            await require_onboarded(user_ctx=user_ctx, db=db_session)

        assert exc_info.value.status_code == 403
