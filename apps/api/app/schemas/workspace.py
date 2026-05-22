# apps/api/app/schemas/workspace.py
# Pydantic request/response schemas for workspace endpoints

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# === Requests ===


class CreateWorkspaceRequest(BaseModel):
    """Request schema for POST /workspaces."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name of the workspace",
        examples=["My Team"],
    )
    slug: str = Field(
        ...,
        min_length=1,
        max_length=50,
        pattern=r"^[a-z0-9-]+$",
        description="URL-safe identifier — lowercase alphanumeric and hyphens only",
        examples=["my-team"],
    )


class JoinWorkspaceRequest(BaseModel):
    """Request schema for POST /workspaces/join."""

    invite_code: str = Field(
        ...,
        min_length=1,
        description="Invite code from a workspace invite link",
        examples=["abc123xyz"],
    )


class UpdateWorkspacePromptsRequest(BaseModel):
    """Request schema for PATCH /workspaces/:id/prompts.

    Both fields are optional — pass only the prompt you want to update.
    Pass null explicitly to reset a prompt back to the system default.
    """

    summarisation_prompt: str | None = Field(
        None,
        max_length=2000,
        description="Custom prompt for update summarisation. " "Pass null to reset to the system default.",
        examples=["Summarise this developer update in 2 sentences using third person."],
    )
    digest_prompt: str | None = Field(
        None,
        max_length=2000,
        description="Custom prompt for daily digest generation (Milestone 6). " "Pass null to reset to the system default.",
    )


# === Responses ===


class WorkspaceResponse(BaseModel):
    """Workspace object returned from create/get endpoints."""

    id: str = Field(..., description="Workspace UUID")
    name: str = Field(..., description="Display name of the workspace")
    slug: str = Field(..., description="URL-safe workspace identifier")
    owner_id: str = Field(..., description="Supabase user ID of the workspace owner")
    plan: str = Field(..., description="Billing plan — 'free' or 'pro'")
    created_at: datetime = Field(..., description="Workspace creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class WorkspaceMemberResponse(BaseModel):
    """Membership record returned from member endpoints."""

    id: str = Field(..., description="Membership record UUID")
    workspace_id: str = Field(..., description="Workspace UUID")
    user_id: str = Field(..., description="Member's Supabase user ID")
    role: str = Field(..., description="Role within the workspace — 'owner', 'admin', or 'member'")
    joined_at: datetime = Field(..., description="Timestamp when the user joined")

    model_config = ConfigDict(from_attributes=True)


class WorkspaceListResponse(BaseModel):
    """Response for GET /workspaces — list of workspaces the user belongs to."""

    data: list[WorkspaceResponse] = Field(..., description="List of workspaces")
