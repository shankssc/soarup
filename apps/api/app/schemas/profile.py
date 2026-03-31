# apps/api/app/schemas/profile.py

from datetime import datetime

from pydantic import BaseModel, Field

# === Profile Requests ===


class UpdateProfileRequest(BaseModel):
    """Request schema for PATCH /profile."""

    full_name: str | None = Field(None, max_length=100, examples=["Jane Doe"])
    avatar_url: str | None = Field(None, max_length=255, examples=["https://storage.example.com/avatars/abc123.jpg"])
    timezone: str | None = Field(None, max_length=50, examples=["America/New_York"])
    email_notifications: bool | None = Field(None, examples=[True])


class UploadAvatarRequest(BaseModel):
    """Request schema for POST /profile/avatar (multipart form)."""

    # This is handled via FastAPI's UploadFile, not JSON body
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

    class Config:
        from_attributes = True


class UploadResponse(BaseModel):
    """Response schema for file upload endpoints."""

    file_url: str = Field(..., description="Public URL to uploaded file")
    file_name: str = Field(..., description="Original file name")
    file_size: int = Field(..., description="File size in bytes")
    content_type: str = Field(..., description="MIME type of uploaded file")
    uploaded_at: datetime = Field(..., description="Upload timestamp")


# === Validation ===


class FileValidationConfig:
    """Configuration for file upload validation."""

    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
