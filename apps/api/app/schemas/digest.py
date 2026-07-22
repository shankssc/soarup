# apps/api/app/schemas/digest.py
# Pydantic request/response schemas for digest endpoints

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DigestItemResponse(BaseModel):
    id: str
    update_id: str
    author_name: str | None
    summary_snapshot: str | None

    model_config = ConfigDict(from_attributes=True)


class DigestResponse(BaseModel):
    id: str
    workspace_id: str
    digest_date: str
    summary: str | None
    status: str
    update_count: int
    email_sent_at: datetime | None
    delivered_to_slack: bool = False
    slack_delivered_at: datetime | None = None
    created_at: datetime
    items: list[DigestItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class DigestListResponse(BaseModel):
    digests: list[DigestResponse]
    next_cursor: str | None
    total: int


class UpdateDigestSettingsRequest(BaseModel):
    digest_enabled: bool | None = None
    digest_send_time: str | None = Field(
        None,
        pattern=r"^\d{2}:\d{2}$",
        description="HH:MM format",
    )
    digest_timezone: str | None = None
    digest_days: str | None = Field(
        None,
        pattern=r"^[1-7](,[1-7])*$",
        description="Comma-separated ISO weekday numbers e.g. '1,2,3,4,5'",
    )


class DigestPreviewResponse(BaseModel):
    html: str
    digest_date: str
    update_count: int
    would_send_to: list[str]


class UpdateMyDigestPreferenceRequest(BaseModel):
    email_notifications: bool


class MyDigestPreferenceResponse(BaseModel):
    email_notifications: bool
