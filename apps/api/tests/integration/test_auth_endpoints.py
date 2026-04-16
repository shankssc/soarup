# apps/api/tests/integration/test_auth_endpoints.py
# Integration tests for apps/api/app/routers/auth.py
#
# Strategy:
#   - Use client_with_mocks fixture: FastAPI app runs in-process via
#     ASGITransport, AuthService and ProfileService are fully mocked.
#   - JWT validation runs for real — protected endpoints need valid tokens
#     from the make_jwt / auth_headers fixtures.
#   - We test: HTTP status codes, response body shape, error mapping,
#     auth header handling, and request validation (Pydantic rejection).
#   - We do NOT test: service logic (covered in unit tests), DB queries,
#     or Supabase network calls.

import pytest

from app.services.auth_service import AuthError
from app.services.profile_service import ProfileError

# Re-use response builders from integration conftest
from tests.conftest import login_response, profile_response

USER_ID = "user-abc"
EMAIL = "test@example.com"

# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success_returns_200(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.login.return_value = login_response()

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL,
                  "password": "password123"},  # pragma: allowlist secret
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_login_returns_access_token(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.login.return_value = login_response()

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL,
                  "password": "password123"},  # pragma: allowlist secret
        )

        body = response.json()
        assert body["access_token"] == "access-token"  # Noqa: S105
        assert body["token_type"] == "bearer"  # Noqa: S105
        assert body["user"]["email"] == EMAIL

    @pytest.mark.asyncio
    async def test_login_calls_service_with_request(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.login.return_value = login_response()

        await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL,
                  "password": "mypassword"},  # pragma: allowlist secret
        )

        auth_svc.login.assert_awaited_once()
        call_arg = auth_svc.login.call_args[0][0]
        assert call_arg.email == EMAIL
        assert call_arg.password == "mypassword"  # Noqa: S105 # pragma: allowlist secret

    @pytest.mark.asyncio
    async def test_login_authentication_failed_returns_401(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.login.side_effect = AuthError(
            error_code="authentication_failed",
            message="Invalid email or password",
        )

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL,
                  "password": "wrongpassword"},  # pragma: allowlist secret
        )

        assert response.status_code == 401
        assert response.json()["error"] == "authentication_failed"

    @pytest.mark.asyncio
    async def test_login_service_unavailable_returns_503(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.login.side_effect = AuthError(
            error_code="service_unavailable",
            message="Try again later",
        )

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL,
                  "password": "Password123"},  # pragma: allowlist secret
        )

        assert response.status_code == 503

    @pytest.mark.asyncio
    async def test_login_missing_email_returns_422(self, client_with_mocks):
        """Pydantic validation rejects missing required fields before hitting service."""
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/login",
            json={"password": "password"},  # pragma: allowlist secret
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_login_missing_password_returns_422(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL},
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_login_unexpected_error_returns_error_response(self, client_with_mocks):
        """Unhandled exceptions are caught and return a structured error, not a 500 crash."""
        client, auth_svc, _ = client_with_mocks
        auth_svc.login.side_effect = RuntimeError("db exploded")

        response = await client.post(
            "/api/v1/auth/login",
            json={"email": EMAIL, "password": "password"},  # pragma: allowlist secret
        )

        # Router catches Exception and wraps it — should not be a raw 500
        body = response.json()
        assert "error" in body


# ---------------------------------------------------------------------------
# POST /api/v1/auth/signup
# ---------------------------------------------------------------------------


class TestSignup:
    @pytest.mark.asyncio
    async def test_signup_success_returns_201(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.signup.return_value = login_response()

        response = await client.post(
            "/api/v1/auth/signup",
            json={"email": EMAIL, "password": "Password1"},  # pragma: allowlist secret
        )

        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_signup_returns_login_response_shape(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.signup.return_value = login_response()

        response = await client.post(
            "/api/v1/auth/signup",
            json={"email": EMAIL, "password": "Password1"},  # pragma: allowlist secret
        )

        body = response.json()
        assert "access_token" in body
        assert "user" in body
        assert body["user"]["email"] == EMAIL

    @pytest.mark.asyncio
    async def test_signup_user_already_exists_returns_409(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.signup.side_effect = AuthError(
            error_code="user_already_exists",
            message="Email already registered",
        )

        response = await client.post(
            "/api/v1/auth/signup",
            json={"email": EMAIL, "password": "Password1"},  # pragma: allowlist secret
        )

        assert response.status_code == 409
        assert response.json()["error"] == "user_already_exists"

    @pytest.mark.asyncio
    async def test_signup_weak_password_returns_422(self, client_with_mocks):
        """SignupRequest validates password strength — short password rejected by Pydantic."""
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/signup",
            json={"email": EMAIL, "password": "short"},  # pragma: allowlist secret
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_signup_with_full_name(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.signup.return_value = login_response()

        await client.post(
            "/api/v1/auth/signup",
            json={"email": EMAIL, "password": "Password1",  # pragma: allowlist secret
                  "full_name": "Test User"},
        )

        call_arg = auth_svc.signup.call_args[0][0]
        assert call_arg.full_name == "Test User"

    @pytest.mark.asyncio
    async def test_signup_registration_failed_returns_400(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.signup.side_effect = AuthError(
            error_code="registration_failed",
            message="Could not create account",
        )

        response = await client.post(
            "/api/v1/auth/signup",
            json={"email": EMAIL, "password": "Password1"},  # pragma: allowlist secret
        )

        assert response.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------


class TestRefreshToken:
    @pytest.mark.asyncio
    async def test_refresh_success_returns_200(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.refresh_tokens.return_value = login_response()

        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "valid-refresh-token"},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_refresh_returns_new_tokens(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.refresh_tokens.return_value = login_response()

        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "valid-refresh-token"},
        )

        body = response.json()
        assert "access_token" in body

    @pytest.mark.asyncio
    async def test_refresh_invalid_token_returns_401(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.refresh_tokens.side_effect = AuthError(
            error_code="invalid_refresh_token",
            message="Token expired",
        )

        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "expired-token"},
        )

        assert response.status_code == 401
        assert response.json()["error"] == "invalid_refresh_token"

    @pytest.mark.asyncio
    async def test_refresh_missing_token_returns_422(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.post("/api/v1/auth/refresh", json={})

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_refresh_calls_service_with_token(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.refresh_tokens.return_value = login_response()

        await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "my-refresh-token"},
        )

        auth_svc.refresh_tokens.assert_awaited_once_with("my-refresh-token")


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------


class TestLogout:
    @pytest.mark.asyncio
    async def test_logout_success_returns_204(self, client_with_mocks, make_jwt):
        client, auth_svc, _ = client_with_mocks
        token = make_jwt(USER_ID)

        response = await client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_logout_no_auth_header_returns_401(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.post("/api/v1/auth/logout")

        assert response.status_code == 401
        assert response.json()["error"] == "missing_token"

    @pytest.mark.asyncio
    async def test_logout_non_bearer_header_returns_401(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_logout_calls_service_with_token(self, client_with_mocks, make_jwt):
        client, auth_svc, _ = client_with_mocks
        token = make_jwt(USER_ID)

        await client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )

        auth_svc.logout.assert_awaited_once_with(token)

    @pytest.mark.asyncio
    async def test_logout_is_idempotent_even_on_service_error(self, client_with_mocks, make_jwt):
        """Logout always returns 204 even if service raises — idempotent by design."""
        client, auth_svc, _ = client_with_mocks
        auth_svc.logout.side_effect = Exception("something broke")
        token = make_jwt(USER_ID)

        response = await client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 204


# ---------------------------------------------------------------------------
# POST /api/v1/auth/forgot-password
# ---------------------------------------------------------------------------


class TestForgotPassword:
    @pytest.mark.asyncio
    async def test_forgot_password_returns_200(self, client_with_mocks):
        from app.schemas.auth import ForgotPasswordResponse

        client, auth_svc, _ = client_with_mocks
        auth_svc.request_password_reset.return_value = ForgotPasswordResponse(
            message="Password reset email sent if account exists",
            email_sent=True,
        )

        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": EMAIL},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_forgot_password_returns_generic_message(self, client_with_mocks):
        """Response is always generic — no email enumeration."""
        from app.schemas.auth import ForgotPasswordResponse

        client, auth_svc, _ = client_with_mocks
        auth_svc.request_password_reset.return_value = ForgotPasswordResponse(
            message="Password reset email sent if account exists",
            email_sent=False,
        )

        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nonexistent@example.com"},
        )

        assert response.status_code == 200
        assert "if account exists" in response.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_forgot_password_missing_email_returns_422(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.post("/api/v1/auth/forgot-password", json={})

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_forgot_password_service_error_still_returns_200(self, client_with_mocks):
        """Even on service exception, router returns 200 — never leaks error state."""
        client, auth_svc, _ = client_with_mocks
        auth_svc.request_password_reset.side_effect = Exception(
            "supabase down")

        response = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": EMAIL},
        )

        assert response.status_code == 200


# ---------------------------------------------------------------------------
# POST /api/v1/auth/reset-password
# ---------------------------------------------------------------------------


class TestResetPassword:
    @pytest.mark.asyncio
    async def test_reset_password_success_returns_200(self, client_with_mocks):
        from app.schemas.auth import ResetPasswordResponse

        client, auth_svc, _ = client_with_mocks
        auth_svc.complete_password_reset.return_value = ResetPasswordResponse(
            message="Password updated successfully",
            requires_login=True,
        )
        # Recovery token must be ≥ 32 chars (router validates length)
        recovery_token = "a" * 32

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "NewPassword1",  # pragma: allowlist secret
                  "token": recovery_token},  # pragma: allowlist secret
            headers={"Authorization": f"Bearer {recovery_token}"},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_reset_password_missing_auth_header_returns_401(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "NewPassword1",  # pragma: allowlist secret
                  "token": "a" * 32},  # pragma: allowlist secret
        )

        assert response.status_code == 401
        assert response.json()["error"] == "missing_token"

    @pytest.mark.asyncio
    async def test_reset_password_short_token_returns_401(self, client_with_mocks):
        """Tokens under 32 chars are rejected before hitting the service."""
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "NewPassword1",  # pragma: allowlist secret
                  "token": "a" * 32},  # pragma: allowlist secret
            headers={"Authorization": "Bearer short"},
        )

        assert response.status_code == 401
        assert response.json()["error"] == "invalid_token"

    @pytest.mark.asyncio
    async def test_reset_password_invalid_recovery_token_returns_401(self, client_with_mocks):
        client, auth_svc, _ = client_with_mocks
        auth_svc.complete_password_reset.side_effect = AuthError(
            error_code="invalid_recovery_token",
            message="Token expired",
        )

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "NewPassword1",  # pragma: allowlist secret
                  "token": "a" * 32},  # pragma: allowlist secret
            headers={"Authorization": f"Bearer {'a' * 32}"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_reset_password_weak_password_returns_422(self, client_with_mocks):
        """ResetPasswordRequest validates password strength."""
        client, _, _ = client_with_mocks

        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"new_password": "weak"},  # pragma: allowlist secret
            headers={"Authorization": f"Bearer {'a' * 32}"},
        )

        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me  (protected)
# ---------------------------------------------------------------------------


class TestGetMe:
    @pytest.mark.asyncio
    async def test_get_me_success_returns_200(self, client_with_mocks, auth_headers):
        client, _, profile_svc = client_with_mocks
        profile_svc.get_profile.return_value = profile_response()

        response = await client.get(
            "/api/v1/auth/me",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_me_returns_profile_shape(self, client_with_mocks, auth_headers):
        client, _, profile_svc = client_with_mocks
        profile_svc.get_profile.return_value = profile_response()

        response = await client.get(
            "/api/v1/auth/me",
            headers=auth_headers(USER_ID),
        )

        body = response.json()
        assert body["user_id"] == USER_ID
        assert body["email"] == EMAIL
        assert "is_onboarded" in body

    @pytest.mark.asyncio
    async def test_get_me_no_token_returns_403(self, client_with_mocks):
        """HTTPBearer returns 403 when Authorization header is absent."""
        client, _, _ = client_with_mocks

        response = await client.get("/api/v1/auth/me")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_get_me_invalid_token_returns_401(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_expired_token_returns_401(self, client_with_mocks, make_expired_jwt):
        client, _, _ = client_with_mocks
        token = make_expired_jwt(USER_ID)

        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_calls_service_with_jwt_context(self, client_with_mocks, make_jwt):
        """User ID and email from JWT are passed to ProfileService.get_profile."""
        client, _, profile_svc = client_with_mocks
        profile_svc.get_profile.return_value = profile_response()
        token = make_jwt(USER_ID, EMAIL)

        await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        profile_svc.get_profile.assert_awaited_once_with(
            user_id=USER_ID,
            email=EMAIL,
        )


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/profile  (protected)
# ---------------------------------------------------------------------------


class TestUpdateProfile:
    @pytest.mark.asyncio
    async def test_update_profile_success_returns_200(self, client_with_mocks, auth_headers):
        client, _, profile_svc = client_with_mocks
        profile_svc.update_profile.return_value = profile_response()

        response = await client.patch(
            "/api/v1/auth/profile",
            json={"full_name": "New Name"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_update_profile_no_fields_returns_400(self, client_with_mocks, auth_headers):
        client, _, profile_svc = client_with_mocks
        profile_svc.update_profile.side_effect = ProfileError(
            error_code="no_fields_to_update",
            message="No fields provided",
        )

        response = await client.patch(
            "/api/v1/auth/profile",
            json={},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 400
        assert response.json()["error"] == "no_fields_to_update"

    @pytest.mark.asyncio
    async def test_update_profile_not_found_returns_404(self, client_with_mocks, auth_headers):
        client, _, profile_svc = client_with_mocks
        profile_svc.update_profile.side_effect = ProfileError(
            error_code="profile_not_found",
            message="Profile not found",
        )

        response = await client.patch(
            "/api/v1/auth/profile",
            json={"full_name": "Ghost"},
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_profile_no_token_returns_403(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.patch(
            "/api/v1/auth/profile",
            json={"full_name": "Name"},
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/profile/avatar  (protected)
# ---------------------------------------------------------------------------


class TestDeleteAvatar:
    @pytest.mark.asyncio
    async def test_delete_avatar_success_returns_204(self, client_with_mocks, auth_headers):
        client, _, profile_svc = client_with_mocks
        profile_svc.delete_avatar.return_value = True

        response = await client.delete(
            "/api/v1/auth/profile/avatar",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_avatar_no_token_returns_403(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.delete("/api/v1/auth/profile/avatar")

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_avatar_is_idempotent(self, client_with_mocks, auth_headers):
        """Even if no avatar exists, returns 204 — idempotent."""
        client, _, profile_svc = client_with_mocks
        profile_svc.delete_avatar.return_value = False

        response = await client.delete(
            "/api/v1/auth/profile/avatar",
            headers=auth_headers(USER_ID),
        )

        assert response.status_code == 204


# ---------------------------------------------------------------------------
# GET /api/v1/auth/versions  (public)
# ---------------------------------------------------------------------------


class TestVersions:
    @pytest.mark.asyncio
    async def test_versions_returns_200(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.get("/api/v1/auth/versions")

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_versions_returns_current_version(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.get("/api/v1/auth/versions")

        body = response.json()
        assert "current_version" in body
        assert body["current_version"] == "v1"

    @pytest.mark.asyncio
    async def test_versions_has_deprecated_versions_key(self, client_with_mocks):
        client, _, _ = client_with_mocks

        response = await client.get("/api/v1/auth/versions")

        assert "deprecated_versions" in response.json()
