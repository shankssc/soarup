# apps/api/tests/unit/test_auth_service.py
# Unit tests for AuthService
#
# Strategy:
#   AuthService has two repo dependencies — AuthRepository (async factory,
#   calls Supabase GoTrue) and ProfileRepository (sync factory, calls Postgres).
#   Both are patched at the instance level after construction so we're testing
#   the service's orchestration logic, error mapping, and branching — not the
#   repos themselves.
#
#   Pattern for every test:
#     1. Build an AuthService with a MagicMock db session
#     2. Inject mock repos via service._auth_repo / service._profile_repo
#     3. Configure mock return values / side effects
#     4. Assert LoginResponse shape OR AuthError code

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordResponse,
    SignupRequest,
)
from app.services.auth_service import AuthError, AuthService

# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def _make_service() -> tuple[AuthService, MagicMock, MagicMock]:
    """
    Return (service, mock_auth_repo, mock_profile_repo).
    Repos are pre-injected so _get_auth_repo / _get_profile_repo
    skip their lazy-init branches.
    """
    db = MagicMock()
    service = AuthService(db_session=db)

    auth_repo = MagicMock()
    profile_repo = MagicMock()

    # Inject directly — bypasses the async AuthRepository.create() factory
    service._auth_repo = auth_repo
    service._profile_repo = profile_repo

    return service, auth_repo, profile_repo


def _supabase_user(
    user_id: str = "user-abc",
    email: str = "test@example.com",
    confirmed: bool = True,
) -> dict[str, Any]:
    return {
        "id": user_id,
        "email": email,
        "email_confirmed_at": "2024-01-01T00:00:00Z" if confirmed else None,
        "user_metadata": {"full_name": "Test User"},
        "created_at": "2024-01-01T00:00:00Z",
    }


def _supabase_session(
    access_token: str = "access-token",  # Noqa: S107
    refresh_token: str = "refresh-token",  # Noqa: S107
    expires_in: int = 3600,
    user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
        "user": user or _supabase_user(),
    }


def _mock_profile(
    user_id: str = "user-abc",
    full_name: str | None = "Test User",
    is_onboarded: bool = False,
    avatar_url: str | None = None,
) -> MagicMock:
    p = MagicMock()
    p.id = user_id
    p.full_name = full_name
    p.is_onboarded = is_onboarded
    p.avatar_url = avatar_url
    p.created_at = None
    p.updated_at = None
    p.last_login_at = None
    return p


# ---------------------------------------------------------------------------
# login()
# ---------------------------------------------------------------------------


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success_returns_login_response(self):
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()
        session = _supabase_session(user=user)

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": session, "user": user})
        profile_repo.update_last_login = AsyncMock()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        result = await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        assert result.access_token == "access-token"  # Noqa: S105
        assert result.refresh_token == "refresh-token"  # Noqa: S105
        assert result.token_type == "bearer"  # Noqa: S105
        assert result.expires_in == 3600
        assert result.user.id == "user-abc"
        assert result.user.email == "test@example.com"

    @pytest.mark.asyncio
    async def test_login_updates_last_login(self):
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": _supabase_session(), "user": user})
        profile_repo.update_last_login = AsyncMock()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        profile_repo.update_last_login.assert_awaited_once_with("user-abc")

    @pytest.mark.asyncio
    async def test_login_empty_session_raises_authentication_failed(self):
        """If Supabase returns empty session, raise authentication_failed."""
        service, auth_repo, profile_repo = _make_service()

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": {}, "user": _supabase_user()})  # pragma: allowlist secret

        with pytest.raises(AuthError) as exc_info:
            await service.login(LoginRequest(email="test@example.com", password="wrongpassword"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "authentication_failed"

    @pytest.mark.asyncio
    async def test_login_empty_user_raises_authentication_failed(self):
        service, auth_repo, profile_repo = _make_service()

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": _supabase_session(), "user": {}})

        with pytest.raises(AuthError) as exc_info:
            await service.login(LoginRequest(email="test@example.com", password="wrongpassword"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "authentication_failed"

    @pytest.mark.asyncio
    async def test_login_circuit_breaker_raises_service_unavailable(self):
        from app.utils.circuit_breaker import CircuitBreakerError

        service, auth_repo, _ = _make_service()
        auth_repo.sign_in_with_password = AsyncMock(
            side_effect=CircuitBreakerError(message="service_unavailable"))

        with pytest.raises(AuthError) as exc_info:
            await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "service_unavailable"

    @pytest.mark.asyncio
    async def test_login_unexpected_exception_raises_authentication_failed(self):
        """Unexpected errors are swallowed and mapped to authentication_failed — no leakage."""
        service, auth_repo, _ = _make_service()
        auth_repo.sign_in_with_password = AsyncMock(
            side_effect=RuntimeError("db connection lost"))

        with pytest.raises(AuthError) as exc_info:
            await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "authentication_failed"

    @pytest.mark.asyncio
    async def test_login_user_response_uses_profile_full_name(self):
        """full_name from profile takes precedence over user_metadata."""
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()
        user["user_metadata"]["full_name"] = "Metadata Name"

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": _supabase_session(), "user": user})
        profile_repo.update_last_login = AsyncMock()
        profile = _mock_profile(full_name="Profile Name")
        profile_repo.get_by_user_id = AsyncMock(return_value=profile)

        result = await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        assert result.user.full_name == "Profile Name"

    @pytest.mark.asyncio
    async def test_login_user_response_falls_back_to_metadata_when_no_profile(self):
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()
        user["user_metadata"]["full_name"] = "Metadata Name"

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": _supabase_session(), "user": user})
        profile_repo.update_last_login = AsyncMock()
        profile_repo.get_by_user_id = AsyncMock(return_value=None)

        result = await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        assert result.user.full_name == "Metadata Name"

    @pytest.mark.asyncio
    async def test_login_is_onboarded_from_profile(self):
        service, auth_repo, profile_repo = _make_service()

        auth_repo.sign_in_with_password = AsyncMock(
            return_value={"session": _supabase_session(), "user": _supabase_user()})
        profile_repo.update_last_login = AsyncMock()
        profile_repo.get_by_user_id = AsyncMock(
            return_value=_mock_profile(is_onboarded=True))

        result = await service.login(LoginRequest(email="test@example.com", password="password"))  # Noqa: S106 # pragma: allowlist secret

        assert result.user.is_onboarded is True


# ---------------------------------------------------------------------------
# signup()
# ---------------------------------------------------------------------------


class TestSignup:
    @pytest.mark.asyncio
    async def test_signup_success_returns_login_response(self):
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()

        auth_repo.sign_up = AsyncMock(
            return_value={"session": _supabase_session(), "user": user})
        profile_repo.create = AsyncMock()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        result = await service.signup(
            SignupRequest(email="new@example.com", password="Password1", full_name="Test User")  # Noqa: S106 # pragma: allowlist secret
        )

        assert result.access_token == "access-token"  # Noqa: S105
        assert result.user.email == "test@example.com"

    @pytest.mark.asyncio
    async def test_signup_creates_profile(self):
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()

        auth_repo.sign_up = AsyncMock(
            return_value={"session": _supabase_session(), "user": user})
        profile_repo.create = AsyncMock()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        await service.signup(
            SignupRequest(email="new@example.com", password="Password1", full_name="Test User")  # Noqa: S106 # pragma: allowlist secret
        )

        profile_repo.create.assert_awaited_once_with(
            user_id="user-abc",
            email="test@example.com",
            full_name="Test User",
        )

    @pytest.mark.asyncio
    async def test_signup_profile_creation_failure_does_not_raise(self):
        """Profile creation failure is logged and swallowed — user still gets a session."""
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()

        auth_repo.sign_up = AsyncMock(
            return_value={"session": _supabase_session(), "user": user})
        profile_repo.create = AsyncMock(
            side_effect=Exception("DB constraint violation"))
        profile_repo.get_by_user_id = AsyncMock(return_value=None)

        # Should not raise
        result = await service.signup(
            SignupRequest(email="new@example.com", password="Password1")  # Noqa: S106 # pragma: allowlist secret
        )
        assert result.access_token == "access-token"  # Noqa: S105

    @pytest.mark.asyncio
    async def test_signup_no_user_returned_raises_registration_failed(self):
        service, auth_repo, _ = _make_service()
        auth_repo.sign_up = AsyncMock(return_value={"session": {}, "user": {}})

        with pytest.raises(AuthError) as exc_info:
            await service.signup(SignupRequest(email="new@example.com", password="Password1"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "registration_failed"

    @pytest.mark.asyncio
    async def test_signup_duplicate_email_raises_user_already_exists(self):
        service, auth_repo, _ = _make_service()
        auth_repo.sign_up = AsyncMock(
            side_effect=Exception("User already registered"))

        with pytest.raises(AuthError) as exc_info:
            await service.signup(SignupRequest(email="existing@example.com", password="Password1"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "user_already_exists"

    @pytest.mark.asyncio
    async def test_signup_duplicate_detection_case_insensitive(self):
        """'user already exists' in error message also triggers the right error code."""
        service, auth_repo, _ = _make_service()
        auth_repo.sign_up = AsyncMock(side_effect=Exception(
            "User already exists in the system"))

        with pytest.raises(AuthError) as exc_info:
            await service.signup(SignupRequest(email="dupe@example.com", password="Password1"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "user_already_exists"

    @pytest.mark.asyncio
    async def test_signup_circuit_breaker_raises_service_unavailable(self):
        from app.utils.circuit_breaker import CircuitBreakerError

        service, auth_repo, _ = _make_service()
        auth_repo.sign_up = AsyncMock(
            side_effect=CircuitBreakerError(message="service_unavailable"))

        with pytest.raises(AuthError) as exc_info:
            await service.signup(SignupRequest(email="new@example.com", password="Password1"))  # Noqa: S106 # pragma: allowlist secret

        assert exc_info.value.error_code == "service_unavailable"


# ---------------------------------------------------------------------------
# refresh_tokens()
# ---------------------------------------------------------------------------


class TestRefreshTokens:
    @pytest.mark.asyncio
    async def test_refresh_success_returns_new_tokens(self):
        service, auth_repo, profile_repo = _make_service()
        user = _supabase_user()
        new_session = _supabase_session(
            access_token="new-access-token",  # Noqa: S106 # pragma: allowlist secret
            refresh_token="new-refresh-token",  # Noqa: S106 # pragma: allowlist secret
            user=user,
        )

        auth_repo.refresh_session = AsyncMock(return_value=new_session)
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        result = await service.refresh_tokens("old-refresh-token")

        assert result.access_token == "new-access-token"  # Noqa: S105
        assert result.refresh_token == "new-refresh-token"  # Noqa: S105

    @pytest.mark.asyncio
    async def test_refresh_empty_session_raises_invalid_refresh_token(self):
        service, auth_repo, _ = _make_service()
        auth_repo.refresh_session = AsyncMock(return_value=None)

        with pytest.raises(AuthError) as exc_info:
            await service.refresh_tokens("bad-token")

        assert exc_info.value.error_code == "invalid_refresh_token"

    @pytest.mark.asyncio
    async def test_refresh_missing_access_token_raises_invalid_refresh_token(self):
        service, auth_repo, _ = _make_service()
        auth_repo.refresh_session = AsyncMock(
            return_value={"refresh_token": "r"})  # no access_token

        with pytest.raises(AuthError) as exc_info:
            await service.refresh_tokens("bad-token")

        assert exc_info.value.error_code == "invalid_refresh_token"

    @pytest.mark.asyncio
    async def test_refresh_missing_user_id_raises_invalid_refresh_token(self):
        """Session has access_token but user dict lacks 'id'."""
        service, auth_repo, _ = _make_service()
        auth_repo.refresh_session = AsyncMock(
            return_value={"access_token": "t",
                          "user": {"email": "x@y.com"}}  # no id
        )

        with pytest.raises(AuthError) as exc_info:
            await service.refresh_tokens("bad-token")

        assert exc_info.value.error_code == "invalid_refresh_token"

    @pytest.mark.asyncio
    async def test_refresh_circuit_breaker_raises_service_unavailable(self):
        from app.utils.circuit_breaker import CircuitBreakerError

        service, auth_repo, _ = _make_service()
        auth_repo.refresh_session = AsyncMock(
            side_effect=CircuitBreakerError(message="service_unavailable"))

        with pytest.raises(AuthError) as exc_info:
            await service.refresh_tokens("any-token")

        assert exc_info.value.error_code == "service_unavailable"


# ---------------------------------------------------------------------------
# logout()
# ---------------------------------------------------------------------------


class TestLogout:
    @pytest.mark.asyncio
    async def test_logout_success_returns_true(self):
        service, auth_repo, _ = _make_service()
        auth_repo.sign_out = AsyncMock(return_value=True)

        result = await service.logout("access-token")

        assert result is True
        auth_repo.sign_out.assert_awaited_once_with("access-token")

    @pytest.mark.asyncio
    async def test_logout_already_invalid_returns_false(self):
        service, auth_repo, _ = _make_service()
        auth_repo.sign_out = AsyncMock(return_value=False)

        result = await service.logout("stale-token")

        assert result is False

    @pytest.mark.asyncio
    async def test_logout_exception_returns_false_not_raises(self):
        """Logout must be idempotent — exceptions do not propagate."""
        service, auth_repo, _ = _make_service()
        auth_repo.sign_out = AsyncMock(side_effect=Exception("network error"))

        result = await service.logout("any-token")

        assert result is False


# ---------------------------------------------------------------------------
# request_password_reset()
# ---------------------------------------------------------------------------


class TestRequestPasswordReset:
    @pytest.mark.asyncio
    async def test_reset_request_always_returns_generic_message(self):
        """Response is generic regardless of whether the email exists — no enumeration."""
        service, auth_repo, _ = _make_service()
        auth_repo.send_password_reset_email = AsyncMock(return_value=True)

        result = await service.request_password_reset(ForgotPasswordRequest(email="anyone@example.com"))

        assert "if account exists" in result.message.lower()

    @pytest.mark.asyncio
    async def test_reset_request_nonexistent_email_still_returns_200(self):
        service, auth_repo, _ = _make_service()
        auth_repo.send_password_reset_email = AsyncMock(return_value=False)

        result = await service.request_password_reset(ForgotPasswordRequest(email="ghost@example.com"))

        assert result.email_sent is False
        assert result.message  # non-empty generic message

    @pytest.mark.asyncio
    async def test_reset_request_internal_error_does_not_raise(self):
        """Exceptions are swallowed — still returns generic response."""
        service, auth_repo, _ = _make_service()
        auth_repo.send_password_reset_email = AsyncMock(
            side_effect=Exception("supabase down"))

        # Should not raise
        result = await service.request_password_reset(ForgotPasswordRequest(email="anyone@example.com"))

        assert result.email_sent is False

    @pytest.mark.asyncio
    async def test_reset_request_invalid_redirect_is_stripped(self):
        """redirect_to pointing at untrusted domain is nulled out before repo call."""
        service, auth_repo, _ = _make_service()
        auth_repo.send_password_reset_email = AsyncMock(return_value=True)

        await service.request_password_reset(
            ForgotPasswordRequest(
                email="user@example.com",
                redirect_to="https://evil.attacker.com/steal",
            )
        )

        # redirect_to should have been stripped — repo called with None
        _, kwargs = auth_repo.send_password_reset_email.call_args
        assert kwargs.get("redirect_to") is None

    @pytest.mark.asyncio
    async def test_reset_request_localhost_redirect_is_allowed(self):
        service, auth_repo, _ = _make_service()
        auth_repo.send_password_reset_email = AsyncMock(return_value=True)

        await service.request_password_reset(
            ForgotPasswordRequest(
                email="user@example.com",
                redirect_to="http://localhost:3000/reset-password",
            )
        )

        _, kwargs = auth_repo.send_password_reset_email.call_args
        assert kwargs.get(
            "redirect_to") == "http://localhost:3000/reset-password"


# ---------------------------------------------------------------------------
# complete_password_reset()
# ---------------------------------------------------------------------------


class TestCompletePasswordReset:
    @pytest.mark.asyncio
    async def test_reset_completion_success(self):
        service, auth_repo, _ = _make_service()
        auth_repo.update_password_with_recovery_token = AsyncMock(
            return_value={"id": "user-abc"})

        result = await service.complete_password_reset(
            recovery_access_token="valid-recovery-token",  # Noqa: S106 # pragma: allowlist secret
            new_password="NewPassword1",  # Noqa: S106 # pragma: allowlist secret
        )

        assert isinstance(result, ResetPasswordResponse)
        assert result.requires_login is True

    @pytest.mark.asyncio
    async def test_reset_completion_missing_id_raises_invalid_recovery_session(self):
        service, auth_repo, _ = _make_service()
        auth_repo.update_password_with_recovery_token = AsyncMock(
            return_value={}  # no id field
        )

        with pytest.raises(AuthError) as exc_info:
            await service.complete_password_reset("token", "NewPassword1")

        assert exc_info.value.error_code == "invalid_recovery_session"

    @pytest.mark.asyncio
    async def test_reset_completion_401_http_error_raises_invalid_recovery_token(self):
        import httpx

        service, auth_repo, _ = _make_service()
        response = MagicMock()
        response.status_code = 401
        auth_repo.update_password_with_recovery_token = AsyncMock(
            side_effect=httpx.HTTPStatusError("401", request=MagicMock(), response=response))

        with pytest.raises(AuthError) as exc_info:
            await service.complete_password_reset("expired-token", "NewPassword1")

        assert exc_info.value.error_code == "invalid_recovery_token"

    @pytest.mark.asyncio
    async def test_reset_completion_400_http_error_raises_invalid_password(self):
        import httpx

        service, auth_repo, _ = _make_service()
        response = MagicMock()
        response.status_code = 400
        auth_repo.update_password_with_recovery_token = AsyncMock(
            side_effect=httpx.HTTPStatusError("400", request=MagicMock(), response=response))

        with pytest.raises(AuthError) as exc_info:
            await service.complete_password_reset("token", "weak")

        assert exc_info.value.error_code == "invalid_password"


# ---------------------------------------------------------------------------
# _map_user_to_response() — internal helper
# ---------------------------------------------------------------------------


class TestMapUserToResponse:
    def test_email_verified_true_when_confirmed_at_present(self):
        service, _, _ = _make_service()
        user = _supabase_user(confirmed=True)

        result = service._map_user_to_response(user, None)

        assert result.email_verified is True

    def test_email_verified_false_when_confirmed_at_none(self):
        service, _, _ = _make_service()
        user = _supabase_user(confirmed=False)

        result = service._map_user_to_response(user, None)

        assert result.email_verified is False

    def test_is_onboarded_false_when_no_profile(self):
        service, _, _ = _make_service()

        result = service._map_user_to_response(_supabase_user(), None)

        assert result.is_onboarded is False

    def test_avatar_url_from_profile(self):
        service, _, _ = _make_service()
        profile = _mock_profile(
            avatar_url="https://cdn.example.com/avatar.jpg")
        profile.timezone = "UTC"

        result = service._map_user_to_response(_supabase_user(), profile)

        assert result.avatar_url == "https://cdn.example.com/avatar.jpg"

    def test_avatar_url_none_when_no_profile(self):
        service, _, _ = _make_service()

        result = service._map_user_to_response(_supabase_user(), None)

        assert result.avatar_url is None
