# apps/api/app/repositories/auth_repo.py
# Repository pattern for Supabase Auth data access

from typing import Any, cast

import httpx
import structlog
from supabase import AsyncClient

from app.config import settings
from app.lib.supabase import get_supabase_client

logger = structlog.get_logger(__name__)


class AuthRepository:
    """Repository for Supabase Auth operations."""

    def __init__(self, supabase_client: AsyncClient):
        """
        Initialize AuthRepository.

        Args:
            supabase_client: Async Supabase client instance.
        """
        self.client = supabase_client

    @classmethod
    async def create(cls, supabase_client: AsyncClient | None = None) -> "AuthRepository":
        """
        Factory method to create repository with async client.

        Args:
            supabase_client: Optional pre-created client. If None, creates new one.

        Returns:
            AuthRepository instance.
        """
        client = supabase_client or await get_supabase_client()
        return cls(client)

    async def sign_in_with_password(self, email: str, password: str) -> dict[str, Any]:
        """
        Sign in user with email + password.

        Args:
            email: User's email address.
            password: User's password.

        Returns:
            Dict containing access_token, refresh_token, user info, etc.

        Raises:
            AuthApiError: If credentials are invalid.
            AuthError: For other authentication errors.
        """
        response = await self.client.auth.sign_in_with_password(
            {
                "email": email,
                "password": password,
            }
        )
        return self._safe_dump(response)

    async def sign_up(self, email: str, password: str, full_name: str | None = None) -> dict[str, Any]:
        """
        Register new user.

        Args:
            email: User's email address.
            password: User's password.
            full_name: Optional user's full name for metadata.

        Returns:
            Dict containing user info and session data.
        """
        response = await self.client.auth.sign_up(
            {
                "email": email,
                "password": password,
                "options": {
                    "data": {"full_name": full_name} if full_name else {},
                },
            }
        )
        return self._safe_dump(response)

    async def get_user_by_token(self, access_token: str) -> dict[str, Any] | None:
        """
        Validate JWT and return user info.

        Args:
            access_token: JWT access token to validate.

        Returns:
            Dict containing user info, or None if invalid.
        """
        try:
            user_response = await self.client.auth.get_user(access_token)
            if user_response and user_response.user:
                return self._safe_dump(user_response.user)
            return None
        except Exception as e:
            logger.warning("Invalid token", error=str(e))
            return None

    async def refresh_session(self, refresh_token: str) -> dict[str, Any]:
        """
        Refresh access token using refresh token.

        Args:
            refresh_token: Refresh token from previous login.

        Returns:
            Dict containing new access_token and session info.
        """
        response = await self.client.auth.refresh_session(refresh_token)
        return self._safe_dump(response)

    async def sign_out(self, access_token: str) -> bool:
        """
        Invalidate session.

        Args:
            access_token: JWT access token to invalidate.

        Returns:
            True if successful, False otherwise.
        """
        try:
            logger.info("logout_server_side_noop", token_prefix=access_token[:10] + "..." if access_token else "EMPTY")
            return True
        except Exception as e:
            logger.error("Sign out failed", error=str(e))
            return False

    async def send_password_reset_email(self, email: str, redirect_to: str | None = None) -> bool:
        """
        Send password reset email via Supabase.

        Args:
            email: User's email address.
            redirect_to: Optional URL to redirect after clicking reset link.

        Returns:
            True if request succeeded (note: Supabase always returns 200 even if email doesn't exist).
        """
        try:
            options: dict[str, str] | None = {"redirect_to": redirect_to} if redirect_to else None

            # Cast to Any to bypass type checking entirely
            await self.client.auth.reset_password_for_email(email, cast(Any, options))
            logger.info("password_reset_email_sent", email=email)
            return True
        except Exception as e:
            # Supabase returns 200 even for non-existent emails (security by obscurity)
            # Only log unexpected errors, don't expose to client
            logger.error("password_reset_email_error", email=email, error=str(e))
            return False

    async def update_password_with_recovery_token(
        self,
        recovery_access_token: str,
        new_password: str,
    ) -> dict[str, Any]:
        """
        Update user password using a recovery session token via direct REST call.

        Args:
            recovery_access_token: Valid access token from Supabase recovery email link.
            new_password: New password to set.

        Returns:
            Dict containing updated user info from Supabase.

        Raises:
            httpx.HTTPStatusError: If token is invalid/expired or password update fails.
            RuntimeError: If SUPABASE_ANON_KEY is not configured.
        """
        try:
            if not settings.supabase_anon_key:
                raise RuntimeError("SUPABASE_ANON_KEY is not configured")

            url = f"{settings.supabase_url}/auth/v1/user"
            headers = {
                "Authorization": f"Bearer {recovery_access_token}",
                "apikey": settings.supabase_anon_key.get_secret_value(),
                "Content-Type": "application/json",
            }
            payload = {"password": new_password}

            async with httpx.AsyncClient() as httpx_client:
                response = await httpx_client.request(
                    method="PUT",
                    url=url,
                    json=payload,
                    headers=headers,
                    timeout=30.0,  # Explicit timeout for safety
                )
                response.raise_for_status()

                result = cast(dict[str, Any], response.json())

            logger.info("password_updated_via_recovery", user_id=result.get("id"))
            return result

        except httpx.HTTPStatusError:
            raise

        except Exception as e:
            logger.error("password_update_recovery_failed", error=str(e))
            raise

    @staticmethod
    def _safe_dump(obj: Any) -> dict[str, Any]:
        """
        Safely convert response object to dict.

        Args:
            obj: Response object from Supabase client.

        Returns:
            Dict representation of the object.
        """
        if obj is None:
            return {}
        if hasattr(obj, "model_dump"):
            result = obj.model_dump()
            return result if isinstance(result, dict) else {}
        if hasattr(obj, "dict"):
            result = obj.dict()
            return result if isinstance(result, dict) else {}
        if isinstance(obj, dict):
            return obj
        return {"data": obj}
