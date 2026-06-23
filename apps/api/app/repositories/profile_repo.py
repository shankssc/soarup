# apps/api/app/repositories/profile_repo.py
# Repository pattern for PostgreSQL profile data access.

from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Profile

logger = structlog.get_logger(__name__)


class ProfileRepository:
    """repository for app-level user profile operations."""

    def __init__(self, db_session: AsyncSession):
        """
        Initialize ProfileRepository.

        Args:
            db_session: Async SQLAlchemy session instance.
        """
        self.db = db_session

    @classmethod
    def from_session(cls, db_session: AsyncSession) -> "ProfileRepository":
        """
        Factory method to create repository with injected session.

        Args:
            db_session: Async SQLAlchemy session.

        Returns:
            ProfileRepository instance.
        """
        return cls(db_session)

    async def get_by_user_id(self, user_id: str) -> Profile | None:
        """
        Get profile by Supabase user ID.

        Args:
            user_id: The Supabase auth user ID (UUID string).

        Returns:
            Profile instance if found, None otherwise.
        """
        result = await self.db.execute(select(Profile).where(Profile.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_user_ids(self, user_ids: list[str]) -> dict[str, Profile]:
        """
        Batch fetch profiles by user IDs.
        Returns a dict of user_id → Profile for efficient N+1 avoidance.
        Missing user_ids are simply absent from the result dict.
        """
        if not user_ids:
            return {}
        result = await self.db.execute(select(Profile).where(Profile.id.in_(user_ids)))
        profiles = result.scalars().all()
        return {p.id: p for p in profiles}

    async def create(
        self,
        user_id: str,
        email: str,
        full_name: str | None = None,
    ) -> Profile:
        """
        Create new profile after signup.

        Args:
            user_id: The Supabase auth user ID (UUID string).
            email: User's email (stored in Supabase Auth, not profiles table).
            full_name: Optional user's full name.

        Returns:
            Created Profile instance.

        Raises:
            IntegrityError: If profile with user_id already exists.
        """
        profile = Profile(
            id=user_id,
            full_name=full_name,
            email_notifications=True,
            timezone="UTC",
            email=email,
        )
        self.db.add(profile)
        try:
            await self.db.commit()
            await self.db.refresh(profile)
            return profile
        except IntegrityError:
            await self.db.rollback()
            logger.error("Profile creation failed: user already exists", user_id=user_id)
            raise

    # ← Fixed: added "data:" parameter name
    async def update(self, user_id: str, data: dict[str, Any]) -> Profile | None:
        """
        Update profile fields.

        Args:
            user_id: The Supabase auth user ID to update.
            data: Dict of field names and new values.

        Returns:
            Updated Profile instance if found, None otherwise.

        Raises:
            Exception: If database operation fails (caller should handle).
        """
        if not data:  # ← Fixed: added colon
            # Nothing to update, just return current profile
            return await self.get_by_user_id(user_id)

        try:
            # Add updated_at timestamp with timezone awareness
            data_with_timestamp = {**data, "updated_at": datetime.now(UTC)}

            await self.db.execute(update(Profile).where(Profile.id == user_id).values(**data_with_timestamp))
            await self.db.commit()
            return await self.get_by_user_id(user_id)
        except Exception as e:
            await self.db.rollback()
            logger.error("Profile update failed", user_id=user_id, error=str(e), data_keys=list(data.keys()))
            raise

    async def update_avatar(self, user_id: str, avatar_url: str, avatar_key: str) -> Profile | None:
        """
        Update avatar URL and object key.

        Args:
            user_id: The Supabase auth user ID.
            avatar_url: Public URL for the avatar image.
            avatar_key: Minio object key for deletion.

        Returns:
            Updated Profile instance if found, None otherwise.
        """
        return await self.update(user_id, {"avatar_url": avatar_url, "avatar_key": avatar_key})

    async def update_last_login(self, user_id: str) -> Profile | None:
        """
        Update last login timestamp.

        Args:
            user_id: The Supabase auth user ID.

        Returns:
            Updated Profile instance if found, None otherwise.
        """
        return await self.update(user_id, {"last_login_at": datetime.now(UTC)})

    async def delete_avatar_reference(self, user_id: str) -> Profile | None:
        """
        Clear avatar URL and key (e.g., when user deletes avatar).

        Args:
            user_id: The Supabase auth user ID.

        Returns:
            Updated Profile instance if found, None otherwise.
        """
        return await self.update(user_id, {"avatar_url": None, "avatar_key": None})
