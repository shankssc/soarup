# apps/api/app/schemas/auth.py

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator

# === Requests ===


class LoginRequest(BaseModel):
    """Request schema for POST /auth/login."""

    email: EmailStr = Field(..., description="User email address", examples=["user@example.com"])
    password: str = Field(..., description="User password", min_length=8, max_length=100, examples=["SecurePass123!"])

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


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
    email_verified: bool = Field(..., description="Whether email has been verified")
    created_at: datetime = Field(..., description="Account creation timestamp")

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    """Response schema for successful login/signup."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(default=3600, description="Token expiration in seconds")
    refresh_token: str | None = Field(None, description="Refresh token for token renewal")
    user: UserResponse = Field(..., description="Authenticated user profile")


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
