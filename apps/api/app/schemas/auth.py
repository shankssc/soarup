# apps/api/app/schemas/auth.py

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# === Username Validation ===

USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$")


def validate_username(username: str) -> str:
    username = username.lower().strip()
    if not USERNAME_PATTERN.match(username):
        raise ValueError("Username must be 3-30 characters, lowercase letters, " "numbers, and hyphens only. Cannot start or end with a hyphen.")
    if "--" in username:
        raise ValueError("Username cannot contain consecutive hyphens.")
    return username


# === Requests ===


class LoginRequest(BaseModel):
    """Request schema for POST /auth/login."""

    email: EmailStr = Field(..., description="User email address", examples=["user@example.com"])
    password: str = Field(..., description="User password", min_length=8, max_length=100, examples=["SecurePass123!"])


class SignupRequest(BaseModel):
    """Request schema for POST /auth/signup."""

    email: EmailStr = Field(..., description="User email address", examples=["user@example.com"])
    password: str = Field(..., description="User password", min_length=8, max_length=100, examples=["SecurePass123!"])
    full_name: str | None = Field(None, description="User's full name", max_length=100, examples=["Jane Doe"])


class RefreshTokenRequest(BaseModel):
    """Request schema for POST /auth/refresh."""

    refresh_token: str = Field(..., description="Refresh token from previous login")


# === Responses ===


class UserResponse(BaseModel):
    """Public user profile schema — never expose sensitive fields."""

    id: str = Field(..., description="User UUID")
    email: EmailStr = Field(..., description="User email address")
    full_name: str | None = Field(None, description="User's full name")
    avatar_url: str | None = Field(None, description="Profile picture URL")
    timezone: str = Field(default="UTC")
    email_verified: bool = Field(..., description="Whether email has been verified")
    is_onboarded: bool = Field(default=False, description="Whether user has completed onboarding")
    created_at: datetime = Field(..., description="Account creation timestamp")
    username: str | None = Field(None, description="Public profile username")
    bio: str | None = Field(None, description="Optional one-line bio")
    tagline: str | None = Field(None, description="Optional tagline pill text")
    profile_public: bool = Field(default=False, description="Whether public profile is enabled")

    model_config = ConfigDict(from_attributes=True)


class PublicProfileResponse(BaseModel):
    """
    Response shape for the public profile endpoint.
    Never includes email or workspace details.
    """

    username: str
    full_name: str | None
    avatar_url: str | None
    bio: str | None
    tagline: str | None
    # StreakResponse serialised — avoids circular import
    streak: dict[str, Any]
    heatmap: list[dict[str, Any]]
    heatmap_weeks: int = 52

    model_config = ConfigDict(from_attributes=True)


class UsernameAvailabilityResponse(BaseModel):
    """Response for GET /auth/check-username."""

    username: str
    available: bool
    message: str  # "Available", "Already taken", "Your current username"


class LoginResponse(BaseModel):
    """Response schema for successful login/signup."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(default=3600, description="Token expiration in seconds")
    refresh_token: str | None = Field(None, description="Refresh token for token renewal")
    user: UserResponse = Field(..., description="Authenticated user profile")


class SignupResponse(BaseModel):
    """Response schema for POST /auth/signup — discriminated on `status`.

    Supabase Cloud (with "Confirm email" enabled) returns a user but no
    session until the confirmation link is clicked, unlike local dev.
    The frontend branches on `status` rather than inferring intent from
    missing tokens.
    """

    status: Literal["authenticated", "confirmation_required"]
    access_token: str | None = Field(None, description="Present only when status='authenticated'")
    token_type: str = Field(default="bearer")
    expires_in: int | None = Field(None, description="Present only when status='authenticated'")
    refresh_token: str | None = Field(None, description="Present only when status='authenticated'")
    user: UserResponse | None = Field(None, description="Present only when status='authenticated'")
    email: EmailStr | None = Field(None, description="Present only when status='confirmation_required'")
    message: str | None = Field(None, description="Present only when status='confirmation_required'")


class ErrorResponse(BaseModel):
    """Standard error response schema."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    details: dict[str, Any] | None = Field(None, description="Additional error context")


# === API Versioning ===


class ApiVersionInfo(BaseModel):
    """Metadata for API versioning."""

    version: str = Field(default="v1", description="API version")
    deprecated: bool = Field(default=False, description="Whether this version is deprecated")
    sunset_date: str | None = Field(None, description="ISO 8601 date when version will be retired")


# === Forgot/Reset Password Requests ===


class ForgotPasswordRequest(BaseModel):
    """Request schema for POST /auth/forgot-password."""

    email: EmailStr = Field(..., description="User email address", examples=["user@example.com"])
    redirect_to: str | None = Field(
        None,
        description="URL to redirect user after clicking reset link (must be whitelisted)",
        examples=["https://app.soarup.app/auth/reset-password"],
    )


class ResetPasswordRequest(BaseModel):
    """Request schema for POST /auth/reset-password."""

    token: str = Field(..., description="Recovery token from email link", min_length=32)
    new_password: str = Field(..., description="New password", min_length=8, max_length=100, examples=["NewSecurePass123!"])

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


# === Forgot/Reset Password Responses ===


class ForgotPasswordResponse(BaseModel):
    """Response for successful forgot password request."""

    message: str = Field(default="Password reset email sent if account exists", description="Generic success message for security")
    email_sent: bool = Field(..., description="Whether email was dispatched (for logging, not exposed to client)")


class ResetPasswordResponse(BaseModel):
    """Response for successful password reset."""

    message: str = Field(default="Password updated successfully", description="Confirmation message")
    requires_login: bool = Field(default=True, description="Whether user must log in again")
