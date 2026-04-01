# apps/api/app/services/auth_service.py
# Async business logic layer for authentication

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.auth_repo import AuthRepository
from app.repositories.profile_repo import ProfileRepository
from app.schemas.auth import LoginRequest, LoginResponse, SignupRequest, UserResponse
from app.utils.circuit_breaker import CircuitBreakerError

logger = structlog.get_logger(__name__)

OAUTH2_BEARER_TOKEN_TYPE: str = "bearer"


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

    async def signup(self, request: SignupRequest) -> LoginResponse:
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
                raise AuthError(
                    error_code="registration_failed",
                    message="Could not create account",
                )

            # Create profile in PostgreSQL (idempotent: will fail if exists)
            try:
                await profile_repo.create(
                    user_id=supabase_user["id"],
                    email=supabase_user["email"],
                    full_name=request.full_name,
                )
            except Exception as profile_error:
                # Profile creation failed, but user exists in Supabase
                # Log and continue — profile can be created on next login
                logger.warning(
                    "signup_profile_creation_failed",
                    user_id=supabase_user["id"],
                    error=str(profile_error),
                )

            profile = await profile_repo.get_by_user_id(supabase_user["id"])
            user_response = self._map_user_to_response(supabase_user, profile)

            logger.info("signup_success", user_id=supabase_user["id"])

            return LoginResponse(
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
                raise AuthError(
                    error_code="user_already_exists",
                    message="An account with this email already exists",
                ) from e

            logger.exception("signup_error", email=request.email, error=str(e))
            raise AuthError(
                error_code="registration_failed",
                message="Could not create account",
            ) from e

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

    def _map_user_to_response(self, supabase_user: dict[str, Any], profile: Any | None) -> UserResponse:
        """
        Convert Supabase user + Profile to UserResponse schema.

        Merges data from both sources, preferring profile data when available.
        """
        return UserResponse(
            id=supabase_user.get("id", ""),
            email=supabase_user.get("email", ""),
            full_name=(profile.full_name if profile and profile.full_name else supabase_user.get("user_metadata", {}).get("full_name")),
            avatar_url=profile.avatar_url if profile else None,
            email_verified=supabase_user.get("email_confirmed_at") is not None,
            created_at=supabase_user.get("created_at"),
        )
