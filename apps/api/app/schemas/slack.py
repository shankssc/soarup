# apps/api/app/schemas/slack.py

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SlackSettingsResponse(BaseModel):
    """Public Slack settings — webhook URL is masked, never returned raw."""

    slack_configured: bool
    slack_digest_enabled: bool
    slack_updates_enabled: bool
    # Show last 8 chars of webhook URL so admin can verify which hook is set
    # without exposing the full URL. None if not configured.
    webhook_url_hint: str | None

    model_config = ConfigDict(from_attributes=True)


class UpdateSlackSettingsRequest(BaseModel):
    webhook_url: str | None = Field(
        None,
        description="Full Slack incoming webhook URL. " "Pass null to remove the integration.",
    )
    slack_digest_enabled: bool | None = None
    slack_updates_enabled: bool | None = None

    @field_validator("webhook_url", mode="after")
    @classmethod
    def validate_webhook_url(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        if not v.startswith("https://hooks.slack.com/"):
            raise ValueError("Webhook URL must be a valid Slack incoming webhook URL " "starting with https://hooks.slack.com/")
        return v


class SlackTestResponse(BaseModel):
    success: bool
    message: str
