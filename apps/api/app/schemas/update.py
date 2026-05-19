# apps/api/app/schemas/update.py

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SubmitUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)
    mode: str = Field(default="text")
    update_date: str = Field(..., description="ISO date string YYYY-MM-DD")


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
    update_date: str
    created_at: datetime
    updated_at: datetime
    author_name: str | None = None
    author_avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UpdateListResponse(BaseModel):
    updates: list[UpdateResponse]
    total: int
