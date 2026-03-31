# apps/api/app/schemas/profile.py

from datetime import datetime
from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field

# === Profile Requests ===


# Optional: TypedDict for stricter update validation (not required)
class ProfileUpdateData(TypedDict, total=False):
    """Type-safe update payload for repository layer."""

    full_name: NotRequired[str | None]
    avatar_url: NotRequired[str | None]
    timezone: NotRequired[str]
    email_notifications: NotRequired[bool]


class UpdateProfileRequest(BaseModel):
    """Request schema for PATCH /profile."""

    full_name: str | None = Field(None, max_length=100, examples=["Jane Doe"])
    avatar_url: str | None = Field(None, max_length=255, examples=["https://storage.example.com/avatars/abc123.jpg"])
    timezone: str | None = Field(None, max_length=50, examples=["America/New_York"])
    email_notifications: bool | None = Field(None, examples=[True])

    # Optional: Add method to convert to dict for repo layer
    def to_update_dict(self) -> dict[str, Any]:
        """Convert request to repository update payload."""
        return {k: v for k, v in self.model_dump(exclude_unset=True).items() if v is not None}


class UploadAvatarRequest(BaseModel):
    """
    Request schema for POST /profile/avatar (multipart form).

    Note: Actual file handling uses FastAPI's UploadFile, not JSON body.
    This class is a marker for documentation/openapi purposes.
    """

    pass


# === Profile Responses ===


class ProfileResponse(BaseModel):
    """Full profile response with app-specific data."""

    user_id: str = Field(..., description="Supabase user ID")
    email: str = Field(..., description="User email address")
    full_name: str | None = Field(None, description="User's full name")
    avatar_url: str | None = Field(None, description="Profile picture URL")
    timezone: str = Field(default="UTC", description="User's timezone")
    email_notifications: bool = Field(default=True, description="Whether email notifications are enabled")
    email_verified: bool = Field(..., description="Whether email has been verified")
    created_at: datetime = Field(..., description="Profile creation timestamp")
    updated_at: datetime = Field(..., description="Last profile update timestamp")
    last_login_at: datetime | None = Field(None, description="Last successful sign-in timestamp")

    # Pydantic v2: Use model_config instead of Config class
    model_config = ConfigDict(from_attributes=True)  # ← Updated syntax


class UploadResponse(BaseModel):
    """Response schema for file upload endpoints."""

    file_url: str = Field(..., description="Public URL to uploaded file")
    file_name: str = Field(..., description="Original file name")
    file_size: int = Field(..., description="File size in bytes")
    content_type: str = Field(..., description="MIME type of uploaded file")
    uploaded_at: datetime = Field(..., description="Upload timestamp")

    model_config = ConfigDict(from_attributes=True)


# === Validation ===


class FileValidationConfig:
    """Configuration for file upload validation."""

    MAX_FILE_SIZE: int = 5 * 1024 * 1024  # 5MB
    ALLOWED_CONTENT_TYPES: list[str] = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    ALLOWED_EXTENSIONS: list[str] = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
