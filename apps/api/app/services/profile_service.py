# apps/api/app/services/profile_service.py
# Async business logic layer for profile management + file uploads


from typing import Any

import structlog
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.profile_repo import ProfileRepository
from app.repositories.storage_repo import StorageError, StorageRepository
from app.schemas.profile import FileValidationConfig, ProfileResponse, UpdateProfileRequest, UploadResponse
from app.utils.circuit_breaker import CircuitBreakerError

logger = structlog.get_logger(__name__)


class ProfileError(Exception):
    """Base exception for profile service errors."""

    def __init__(self, error_code: str, message: str, details: dict[str, Any] | None = None):
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


class ProfileService:
    """
    Async service layer for profile management.

    Responsibilities:
    - Validate business rules for profile updates
    - Orchestrate profile + storage repository calls
    - Handle file upload validation and processing
    - Map domain errors to API errors
    """

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self._profile_repo: ProfileRepository | None = None
        self._storage_repo: StorageRepository | None = None

    def _get_profile_repo(self) -> ProfileRepository:
        """Get ProfileRepository with injected session."""
        if self._profile_repo is None:
            self._profile_repo = ProfileRepository.from_session(self.db)
        return self._profile_repo

    def _get_storage_repo(self) -> StorageRepository:
        """Lazy-load StorageRepository."""
        if self._storage_repo is None:
            self._storage_repo = StorageRepository()
        return self._storage_repo

    async def get_profile(self, user_id: str, email: str) -> ProfileResponse:
        """Get user profile by ID."""
        profile_repo = self._get_profile_repo()
        profile = await profile_repo.get_by_user_id(user_id)

        if not profile:
            # Profile doesn't exist yet — return minimal response
            # (will be created on first update or login)
            return ProfileResponse(
                user_id=user_id,
                email=email,
                full_name=None,
                avatar_url=None,
                timezone="UTC",
                email_notifications=True,
                email_verified=True,  # Assume verified if coming from Supabase
                created_at=None,  # Will be set on creation
                updated_at=None,
                last_login_at=None,
            )

        return ProfileResponse(
            user_id=profile.id,
            email=email,
            full_name=profile.full_name,
            avatar_url=profile.avatar_url,
            timezone=profile.timezone,
            email_notifications=profile.email_notifications,
            email_verified=True,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
            last_login_at=profile.last_login_at,
        )

    async def update_profile(self, user_id: str, request: UpdateProfileRequest) -> ProfileResponse:
        """Update user profile fields."""
        data = request.to_update_dict() if hasattr(request, "to_update_dict") else request.model_dump(exclude_unset=True)

        if not data:
            raise ProfileError(
                error_code="no_fields_to_update",
                message="No fields provided for update",
            )

        profile_repo = self._get_profile_repo()
        profile = await profile_repo.update(user_id, data)

        if not profile:
            raise ProfileError(
                error_code="profile_not_found",
                message="Profile not found for this user",
            )

        logger.info("profile_updated", user_id=user_id, fields=list(data.keys()))

        # Return full profile (email should be passed from auth context)
        return await self.get_profile(user_id, "")  # Email placeholder — should come from JWT

    async def upload_avatar(
        self,
        user_id: str,
        file: UploadFile,
    ) -> UploadResponse:
        """Upload profile avatar to Minio/R2."""
        try:
            # Validate file
            await self._validate_file(file)

            # Read file bytes
            file_bytes = await file.read()

            # Upload to storage (async, with circuit breaker)
            storage_repo = self._get_storage_repo()
            result = await storage_repo.upload_file(
                file_bytes=file_bytes,
                file_name=file.filename or "avatar.jpg",
                content_type=file.content_type or "image/jpeg",
                folder="avatars",
            )

            # Update profile with avatar URL
            profile_repo = self._get_profile_repo()
            await profile_repo.update_avatar(
                user_id=user_id,
                avatar_url=result["file_url"],
                avatar_key=result["file_key"],
            )

            logger.info("avatar_uploaded", user_id=user_id, file_key=result["file_key"])

            return UploadResponse(**result)

        except CircuitBreakerError as e:
            logger.error("storage_service_unavailable", user_id=user_id)
            raise ProfileError(
                error_code="service_unavailable",
                message="File upload service temporarily unavailable",
                details={"retry_after": getattr(e, "retry_after", 30)},
            ) from e
        except StorageError as e:
            logger.exception("avatar_upload_failed", user_id=user_id, error_code=e.error_code, error=str(e))
            raise ProfileError(
                error_code="upload_failed",
                message="Failed to upload avatar",
                details={"storage_error": e.error_code} if e.error_code else None,
            ) from e
        except ProfileError:
            raise
        except Exception as e:
            logger.exception("avatar_upload_error", user_id=user_id, error=str(e))
            raise ProfileError(
                error_code="upload_failed",
                message="Failed to upload avatar",
            ) from e

    async def delete_avatar(self, user_id: str) -> bool:
        """Delete user's avatar from storage and profile."""
        try:
            profile_repo = self._get_profile_repo()
            profile = await profile_repo.get_by_user_id(user_id)

            if not profile or not profile.avatar_key:
                return False

            # Delete from storage (async)
            storage_repo = self._get_storage_repo()
            await storage_repo.delete_file(profile.avatar_key)

            # Clear profile reference
            await profile_repo.delete_avatar_reference(user_id)

            logger.info("avatar_deleted", user_id=user_id)
            return True

        except Exception as e:
            logger.exception("avatar_delete_failed", user_id=user_id, error=str(e))
            # Don't raise — make delete idempotent
            return False

    async def _validate_file(self, file: UploadFile) -> None:
        """Validate uploaded file meets requirements."""

        # Check filename exists
        if not file.filename:
            raise ProfileError(
                error_code="invalid_file",
                message="File name is required",
            )

        # Check content type BEFORE reading
        if file.content_type and file.content_type not in FileValidationConfig.ALLOWED_CONTENT_TYPES:
            raise ProfileError(
                error_code="invalid_file_type",
                message=f"File type '{file.content_type}' not allowed",
                details={"allowed_types": FileValidationConfig.ALLOWED_CONTENT_TYPES},
            )

        # Read file bytes to check size
        file_bytes = await file.read()
        file_size = len(file_bytes)

        if file_size > FileValidationConfig.MAX_FILE_SIZE:
            await file.seek(0)

            raise ProfileError(
                error_code="file_too_large",
                message=f"File size exceeds maximum of {FileValidationConfig.MAX_FILE_SIZE // (1024*1024)}MB",
                details={"max_size": FileValidationConfig.MAX_FILE_SIZE, "actual_size": file_size},
            )

        await file.seek(0)
