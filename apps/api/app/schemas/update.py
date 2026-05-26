# apps/api/app/schemas/update.py

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SubmitUpdateRequest(BaseModel):
    content: str = Field(default="", max_length=1000)
    # content is optional for voice updates — transcript fills it after transcription
    mode: str = Field(default="text")
    update_date: str = Field(..., description="ISO date string YYYY-MM-DD")
    audio_key: str | None = Field(
        None,
        description="Minio/R2 object key from pre-signed upload. Required when mode='voice'.",
    )
    audio_duration_seconds: int | None = Field(None, gt=0, le=600)

    @model_validator(mode="after")
    def validate_voice_fields(self) -> "SubmitUpdateRequest":
        if self.mode == "voice" and not self.audio_key:
            raise ValueError("audio_key is required for voice updates")
        if self.mode == "text" and not self.content:
            raise ValueError("content is required for text updates")
        return self


class UpdateUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


class UpdateResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    content: str
    mode: str
    status: str
    summary: str | None
    transcript: str | None = None
    audio_duration_seconds: int | None = None
    update_date: str
    created_at: datetime
    updated_at: datetime
    author_name: str | None = None
    author_avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UpdateListResponse(BaseModel):
    updates: list[UpdateResponse]
    total: int
