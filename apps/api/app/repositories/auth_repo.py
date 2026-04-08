# apps/api/app/repositories/auth_repo.py
# Repository pattern for Supabase Auth data access

from typing import Any

import structlog
from supabase import AsyncClient

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
