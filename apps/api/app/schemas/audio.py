# apps/api/app/schemas/audio.py
# Pydantic request and response schemas for the audio upload and playback endpoints.

from pydantic import BaseModel, Field


class PresignedUploadUrlRequest(BaseModel):
    """Request schema for POST /workspaces/:id/audio/upload-url"""

    content_type: str = Field(
        ...,
        description="MIME type of the audio file from the browser.",
        examples=["audio/webm", "audio/mp4"],
    )
    file_size_bytes: int = Field(
        ...,
        gt=0,
        le=10 * 1024 * 1024,  # 10MB max
        description="File size in bytes — validated before issuing URL",
    )


class PresignedUploadUrlResponse(BaseModel):
    """Response schema for POST /workspaces/:id/audio/upload-url"""

    upload_url: str = Field(..., description="Pre-signed PUT URL for direct browser upload")
    object_key: str = Field(..., description="R2/Minio object key — pass to submit update")
    expires_in: int = Field(default=900, description="URL expiry in seconds (15 minutes)")


class AudioPlaybackUrlResponse(BaseModel):
    """Response for GET /workspaces/:id/updates/:update_id/audio"""

    playback_url: str = Field(..., description="Pre-signed GET URL for audio playback")
    expires_in: int = Field(default=900, description="URL expiry in seconds")
    duration_seconds: int | None = Field(None)
