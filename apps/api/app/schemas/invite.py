# apps/api/app/schemas/invite.py

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CreateInviteRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address to invite")


class InviteResponse(BaseModel):
    """Returned to the inviting admin after creating an invite."""

    id: str
    workspace_id: str
    email: str
    code: str
    expires_at: datetime
    is_used: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InviteDetailsResponse(BaseModel):
    """
    Public-facing invite info shown on the /invite/:code page.
    No auth required to fetch — safe to expose workspace name and inviter name.
    """

    workspace_name: str
    workspace_slug: str
    invited_by_name: str | None
    email: str
    expires_at: datetime
    is_valid: bool  # False if expired or already used


class AcceptInviteRequest(BaseModel):
    code: str = Field(..., description="Invite code from the URL")


class PendingInviteResponse(BaseModel):
    """
    Single pending invite item for the members settings page list.
    Shown in the "Pending invites" section with a revoke button.
    """

    id: str
    email: str
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
