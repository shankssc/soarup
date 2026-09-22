# apps/api/app/services/auth_service.py
# Async business logic layer for authentication

import time
from typing import Any
from urllib.parse import urlparse

import httpx
import jwt as pyjwt
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.auth_repo import AuthRepository
from app.repositories.profile_repo import ProfileRepository
from app.schemas.auth import ForgotPasswordRequest, ForgotPasswordResponse, LoginRequest, LoginResponse, ResetPasswordResponse, SignupRequest, SignupResponse, UserResponse
from app.utils.circuit_breaker import CircuitBreakerError

logger = structlog.get_logger(__name__)

OAUTH2_BEARER_TOKEN_TYPE: str = "bearer"


def _expires_in_from_token(access_token: str) -> int:
    """Best-effort read of a token's remaining lifetime, for client-side
    expiry bookkeeping. Does not verify the signature — this token was
    already validated via Supabase's /auth/v1/user endpoint by the caller.
    """
    try:
        payload = pyjwt.decode(access_token, options={"verify_signature": False})
        exp = payload.get("exp")
        if exp:
            return max(int(exp - time.time()), 60)
    except Exception:  # Noqa: S110
        pass
    return 3600


class AuthError(Exception):
    """Base exception for auth service errors."""

    def __init__(self, error_code: str, message: str, details: dict[str, Any] | None = None):
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


class AuthService:
    """
    Async service layer for authentication business logic.

    Responsibilities:
    - Validate business rules (beyond Pydantic schema validation)
    - Orchestrate repository calls (all async)
    - Apply resilience patterns (circuit breaker in repos)
    - Map domain errors to API errors

    This layer should NOT contain:
    - HTTP-specific logic (status codes, headers)
    - Direct Supabase/DB client calls (use repositories)
    - Request/response parsing (handled by routers + schemas)
    """

    def __init__(self, db_session: AsyncSession):
        """
        Initialize AuthService.

        Args:
            db_session: Async SQLAlchemy session for profile operations.
        """
        self.db = db_session
        # Repositories will be created async via factory methods
        self._auth_repo: AuthRepository | None = None
        self._profile_repo: ProfileRepository | None = None

    async def _get_auth_repo(self) -> AuthRepository:
        """Lazy-load async AuthRepository."""
        if self._auth_repo is None:
            self._auth_repo = await AuthRepository.create()
        return self._auth_repo

    def _get_profile_repo(self) -> ProfileRepository:
        """Get ProfileRepository with injected session."""
        if self._profile_repo is None:
            self._profile_repo = ProfileRepository.from_session(self.db)
        return self._profile_repo

    async def login(self, request: LoginRequest) -> LoginResponse:
        """
        Authenticate user and return tokens + profile.

        Business rules:
        - Email must be verified (configurable)
        - Account must not be banned/suspended
        - Rate limiting applied at router layer (not here)
        """
        try:
            logger.info("login_attempt", email=request.email)

            auth_repo = await self._get_auth_repo()
            profile_repo = self._get_profile_repo()

            # Call repository (wrapped in circuit breaker)
            auth_result = await auth_repo.sign_in_with_password(
                email=request.email,
                password=request.password,
            )

            session = auth_result.get("session") or {}
            supabase_user = auth_result.get("user") or {}

            if not session or not supabase_user:
                logger.warning("login_failed", email=request.email, reason="invalid_credentials")
                raise AuthError(
                    error_code="authentication_failed",
                    message="Invalid email or password",
                )

            # Update last login timestamp in profile
            await profile_repo.update_last_login(supabase_user["id"])

            # Get profile data for response
            profile = await profile_repo.get_by_user_id(supabase_user["id"])

            user_response = self._map_user_to_response(supabase_user, profile)

            logger.info("login_success", user_id=supabase_user["id"])

            return LoginResponse(
                access_token=session.get("access_token", ""),
                token_type=OAUTH2_BEARER_TOKEN_TYPE,
                expires_in=session.get("expires_in", 3600),
                refresh_token=session.get("refresh_token"),
                user=user_response,
            )

        except CircuitBreakerError as e:
            logger.error("auth_service_unavailable", email=request.email, retry_after=getattr(e, "retry_after", None))
            raise AuthError(
                error_code="service_unavailable",
                message="Authentication service temporarily unavailable",
                details={"retry_after": getattr(e, "retry_after", 30)},
            ) from e
        except AuthError:
            raise
        except Exception as e:
            logger.exception("login_error", email=request.email, error=str(e))
            # Don't leak internal errors to client
            raise AuthError(
                error_code="authentication_failed",
                message="Invalid email or password",
            ) from e

    async def signup(self, request: SignupRequest) -> SignupResponse:
        """
        Register new user and return authenticated session.

        Business rules:
        - Email must not already exist
        - Password meets complexity requirements (already validated by schema)
        - Welcome email sent (future: integrate with notifications service)
        """
        try:
            logger.info("signup_attempt", email=request.email)

            auth_repo = await self._get_auth_repo()
            profile_repo = self._get_profile_repo()

            auth_result = await auth_repo.sign_up(
                email=request.email,
                password=request.password,
                full_name=request.full_name,
            )

            session = auth_result.get("session") or {}
            supabase_user = auth_result.get("user") or {}

            if not supabase_user:
                logger.warning("signup_failed", email=request.email, reason="no_user_returned")
                raise AuthError(error_code="registration_failed", message="Could not create account")

            # supabase_user exists (and has id/email) even when confirmation is
            # pending, so profile creation runs regardless of session state.
            try:
                await profile_repo.create(
                    user_id=supabase_user["id"],
                    email=supabase_user["email"],
                    full_name=request.full_name,
                )
            except Exception as profile_error:
                logger.warning(
                    "signup_profile_creation_failed",
                    user_id=supabase_user["id"],
                    error=str(profile_error),
                )

            if not session.get("access_token"):
                logger.info("signup_confirmation_required", user_id=supabase_user["id"])
                return SignupResponse(
                    status="confirmation_required",
                    email=supabase_user.get("email", request.email),
                    message="Check your email to confirm your account before signing in.",
                )

            profile = await profile_repo.get_by_user_id(supabase_user["id"])
            user_response = self._map_user_to_response(supabase_user, profile)

            logger.info("signup_success", user_id=supabase_user["id"])

            return SignupResponse(
                status="authenticated",
                access_token=session.get("access_token", ""),
                token_type=OAUTH2_BEARER_TOKEN_TYPE,
                expires_in=session.get("expires_in", 3600),
                refresh_token=session.get("refresh_token"),
                user=user_response,
            )

        except CircuitBreakerError as e:
            logger.error("auth_service_unavailable", email=request.email)
            raise AuthError(
                error_code="service_unavailable",
                message="Registration service temporarily unavailable",
                details={"retry_after": getattr(e, "retry_after", 30)},
            ) from e
        except AuthError:
            raise
        except Exception as e:
            error_msg = str(e).lower()
            if "already registered" in error_msg or "duplicate" in error_msg or "user already exists" in error_msg:
                logger.warning("signup_failed", email=request.email, reason="user_exists")
                raise AuthError(error_code="user_already_exists", message="An account with this email already exists") from e
            logger.exception("signup_error", email=request.email, error=str(e))
            raise AuthError(error_code="registration_failed", message="Could not create account") from e

    async def get_current_user(self, access_token: str) -> UserResponse | None:
        """
        Validate JWT and return user profile.

        Used by protected routes via middleware.
        """
        try:
            auth_repo = await self._get_auth_repo()
            profile_repo = self._get_profile_repo()

            # Validate token with Supabase
            user_data = await auth_repo.get_user_by_token(access_token)
            if not user_data:
                return None

            # Get profile data from PostgreSQL
            profile = await profile_repo.get_by_user_id(user_data["id"])

            return self._map_user_to_response(user_data, profile)

        except Exception as e:
            logger.warning("get_current_user_failed", error=str(e))
            return None

    async def refresh_tokens(self, refresh_token: str) -> LoginResponse:
        """
        Issue new access token using valid refresh token.

        Business rules:
        - Refresh token must be valid and not expired
        - User account must still be active
        - Rate limiting applied at router layer (not here)

        Returns:
            LoginResponse with new access_token, expires_in, etc.

        Raises:
            AuthError: If refresh token is invalid or expired
        """
        try:
            logger.info("token_refresh_attempt", refresh_token_prefix=refresh_token[:10] + "...")

            auth_repo = await self._get_auth_repo()
            profile_repo = self._get_profile_repo()

            # Call repository (wrapped in circuit breaker)
            session = await auth_repo.refresh_session(refresh_token)

            if not session or not session.get("access_token"):
                logger.warning("token_refresh_failed", reason="invalid_refresh_token")
                raise AuthError(
                    error_code="invalid_refresh_token",
                    message="Refresh token is invalid or expired",
                )

            # Get user info for response
            supabase_user = session.get("user") or {}
            user_id = supabase_user.get("id")

            if not user_id or not isinstance(user_id, str):
                logger.warning("token_refresh_failed", reason="missing_user_id")
                raise AuthError(
                    error_code="invalid_refresh_token",
                    message="Refresh token is invalid or expired",
                )

            profile = await profile_repo.get_by_user_id(user_id)

            user_response = self._map_user_to_response(supabase_user, profile)

            logger.info("token_refresh_success", user_id=user_id)

            return LoginResponse(
                access_token=session["access_token"],
                token_type=OAUTH2_BEARER_TOKEN_TYPE,
                expires_in=session.get("expires_in", 3600),
                # May rotate refresh tokens
                refresh_token=session.get("refresh_token"),
                user=user_response,
            )

        except CircuitBreakerError as e:
            logger.error("auth_service_unavailable", operation="refresh_tokens")
            raise AuthError(
                error_code="service_unavailable",
                message="Token refresh service temporarily unavailable",
                details={"retry_after": getattr(e, "retry_after", 30)},
            ) from e
        except AuthError:
            raise
        except Exception as e:
            logger.exception("token_refresh_error", error=str(e))
            # Don't leak internal errors — generic message for security
            raise AuthError(
                error_code="invalid_refresh_token",
                message="Refresh token is invalid or expired",
            ) from e

    async def logout(self, access_token: str) -> bool:
        """
        Invalidate session by revoking refresh token.

        Note: JWT access tokens cannot be revoked (stateless by design),
        but we can blacklist the refresh token to prevent token renewal.

        Business rules:
        - Refresh token is revoked in Supabase
        - Client should discard access token
        - Idempotent: returns True even if already logged out

        Returns:
            True if successful, False if token was already invalid.
        """
        try:
            logger.info("logout_attempt", token_prefix=access_token[:10] + "...")

            auth_repo = await self._get_auth_repo()
            success = await auth_repo.sign_out(access_token)

            if success:
                logger.info("logout_success", token_prefix=access_token[:10] + "...")
            else:
                logger.warning("logout_noop", reason="token_already_invalid")

            return success

        except Exception as e:
            logger.exception("logout_error", error=str(e))
            # Make logout idempotent — don't raise, just return False
            return False

    async def request_password_reset(self, request: ForgotPasswordRequest) -> ForgotPasswordResponse:
        """
        Initiate password reset flow by sending recovery email.

        Business rules:
        - Always return generic success message (prevent email enumeration)
        - Validate redirect_to against allowed domains if provided
        - Log attempts for security monitoring

        Returns:
            Confirmation of request being sent if email exists
        """
        try:
            logger.info("password_reset_requested", email=request.email)

            auth_repo = await self._get_auth_repo()

            # Validate redirect_to if provided (prevent open redirect)
            if request.redirect_to:
                allowed_domains = ["soarup.app", "localhost", "127.0.0.1"]
                parsed = urlparse(request.redirect_to)
                if parsed.netloc and not any(domain in parsed.netloc for domain in allowed_domains):
                    logger.warning("password_reset_invalid_redirect", email=request.email, redirect=request.redirect_to)
                    request.redirect_to = None  # Fallback to default

            email_sent = await auth_repo.send_password_reset_email(email=request.email, redirect_to=request.redirect_to)

            # Always return generic response for security
            return ForgotPasswordResponse(message="Password reset email sent if account exists", email_sent=email_sent)

        except Exception as e:
            logger.exception("password_reset_request_error", email=request.email, error=str(e))
            # Never leak internal errors
            return ForgotPasswordResponse(message="Password reset email sent if account exists", email_sent=False)

    async def complete_password_reset(self, recovery_access_token: str, new_password: str) -> ResetPasswordResponse:
        """
        Complete password reset after user clicks recovery link.

        Key pattern: Create a NEW AuthRepository with a Supabase client
        that's pre-authenticated with the recovery token.

        Args:
            recovery_access_token: Valid token from recovery session (extracted from URL after email click)
            new_password: New password validated by schema

        Returns:
            Confirmation response

        Raises:
            AuthError: If token is invalid or password update fails
        """
        try:
            logger.info("password_reset_completion_attempt", token_prefix=recovery_access_token[:10] + "...")

            # Use existing lazy-loaded repo (no new client needed)
            auth_repo = await self._get_auth_repo()

            # Delegate to repository's recovery-aware method
            result = await auth_repo.update_password_with_recovery_token(
                recovery_access_token=recovery_access_token,
                new_password=new_password,
            )

            if not result.get("id"):
                raise AuthError(error_code="invalid_recovery_session", message="Recovery link expired or invalid. Please request a new one.")

            logger.info("password_reset_completed", user_id=result["id"])

            return ResetPasswordResponse(
                message="Password updated successfully",
                requires_login=True,  # Force re-auth for security
            )

        except httpx.HTTPStatusError as e:
            # Map HTTP status codes to user-friendly AuthError
            if e.response.status_code == 401:
                raise AuthError(error_code="invalid_recovery_token", message="Recovery link expired or invalid. Please request a new one.") from e
            elif e.response.status_code == 400:  # noqa: RET506
                raise AuthError(error_code="invalid_password", message="New password does not meet requirements.") from e
            else:
                logger.warning("password_reset_http_error", status=e.response.status_code)
                raise AuthError(error_code="password_update_failed", message="Could not update password. Please try again.") from e

        except RuntimeError as e:
            # Configuration errors
            if "SUPABASE_ANON_KEY" in str(e):
                logger.error("password_reset_config_error", error=str(e))
                raise AuthError(error_code="configuration_error", message="Service configuration error. Please contact support.") from e
            raise

        except AuthError:
            # Re-raise AuthError as-is (already properly formatted)
            raise
        except Exception as e:
            logger.exception("password_reset_completion_error", error=str(e))
            raise AuthError(error_code="password_update_failed", message="Could not update password. Please try again.") from e

    async def session_from_supabase(self, access_token: str, refresh_token: str) -> LoginResponse:
        """
        Establish an app session from a Supabase-issued token pair.

        Used after any flow where Supabase sets its own session directly
        (email confirmation, OAuth) rather than going through login()/signup().
        Ensures those paths still produce a profile row and the same
        LoginResponse shape the rest of the app expects.
        """
        try:
            auth_repo = await self._get_auth_repo()
            profile_repo = self._get_profile_repo()

            supabase_user = await auth_repo.get_user_by_token(access_token)
            if not supabase_user:
                raise AuthError(error_code="invalid_token", message="Session is invalid or expired")

            profile = await profile_repo.get_by_user_id(supabase_user["id"])
            if not profile:
                # First time this user's session is being established app-side —
                # e.g. OAuth signup, which never goes through AuthService.signup().
                try:
                    await profile_repo.create(
                        user_id=supabase_user["id"],
                        email=supabase_user["email"],
                        full_name=(supabase_user.get("user_metadata", {}).get("full_name") or supabase_user.get("user_metadata", {}).get("name")),
                    )
                    profile = await profile_repo.get_by_user_id(supabase_user["id"])
                except Exception as profile_error:
                    logger.warning(
                        "session_profile_creation_failed",
                        user_id=supabase_user["id"],
                        error=str(profile_error),
                    )

            user_response = self._map_user_to_response(supabase_user, profile)

            logger.info("session_exchange_success", user_id=supabase_user["id"])

            return LoginResponse(
                access_token=access_token,
                token_type=OAUTH2_BEARER_TOKEN_TYPE,
                expires_in=_expires_in_from_token(access_token),
                refresh_token=refresh_token,
                user=user_response,
            )

        except AuthError:
            raise
        except Exception as e:
            logger.exception("session_exchange_error", error=str(e))
            raise AuthError(error_code="invalid_token", message="Could not establish session") from e

    def _map_user_to_response(self, supabase_user: dict[str, Any], profile: Any | None) -> UserResponse:
        """
        Convert Supabase user + Profile to UserResponse schema.
        Merges data from both sources, preferring profile data when available.
        """
        return UserResponse(
            id=supabase_user.get("id", ""),
            email=supabase_user.get("email", ""),
            full_name=(profile.full_name if profile and profile.full_name else (supabase_user.get("user_metadata", {}).get("full_name") or supabase_user.get("user_metadata", {}).get("name"))),
            avatar_url=profile.avatar_url if profile else None,
            timezone=profile.timezone if profile else "UTC",
            email_verified=supabase_user.get("email_confirmed_at") is not None,
            is_onboarded=profile.is_onboarded if profile else False,
            created_at=supabase_user.get("created_at"),
            username=profile.username if profile else None,
            bio=profile.bio if profile else None,
            tagline=profile.tagline if profile else None,
            profile_public=profile.profile_public if profile else False,
        )
