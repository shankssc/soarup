# apps/api/app/models/profile.py
# SQLAlchemy model for user profile data (extends Supabase Auth)

from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Profile(Base):
    """
    User profile data that extends Supabase Auth.

    Supabase Auth handles: id, email, password, email_verified
    This model handles: app-specific profile fields + avatar reference
    """

    __tablename__ = "profiles"

    # === Primary Key ===
    # Supabase user ID (1:1 relationship with auth.users)
    id: Mapped[str] = mapped_column(String, primary_key=True, index=True, doc="Supabase auth user ID (UUID)")

    # === App-Specific Fields ===
    full_name: Mapped[str | None] = mapped_column(String(100), nullable=True, doc="User's display name")

    avatar_url: Mapped[str | None] = mapped_column(String(255), nullable=True, doc="Public URL for avatar image (Minio)")

    avatar_key: Mapped[str | None] = mapped_column(String(255), nullable=True, doc="Minio object key for avatar deletion")

    timezone: Mapped[str] = mapped_column(String(50), default="UTC", doc="User's preferred timezone (IANA format)")

    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        doc="User email address — populated on signup for digest delivery",
    )

    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True, doc="Whether user receives email notifications")

    is_onboarded: Mapped[bool] = mapped_column(
        Boolean,
        # re-aligns with original migration intent
        server_default=sa.text("false"),
        nullable=False,
        doc="Whether user has completed onboarding flow",
    )

    # === Public Profile Fields ===
    username: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
        unique=True,
        index=True,
        doc="Public username for /u/:username profile URL. " "Lowercase alphanumeric + hyphens, 3-30 chars. " "Must be unique across all users.",
    )
    bio: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
        doc="Optional one-line bio shown on public profile.",
    )
    tagline: Mapped[str | None] = mapped_column(
        String(60),
        nullable=True,
        doc="Optional tagline rendered as a pill on public profile.",
    )
    profile_public: Mapped[bool] = mapped_column(
        Boolean,
        server_default=sa.text("false"),
        default=False,
        nullable=False,
        doc="Whether this profile is publicly visible at /u/:username. " "Requires username to be set.",
    )

    # === Timestamps ===
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, doc="Account creation timestamp")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),  # Auto-updates on commit
        nullable=False,
        doc="Last profile update timestamp",
    )

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, doc="Last successful sign-in timestamp")

    # === Helper Methods ===

    def __repr__(self) -> str:
        return f"<Profile(id='{self.id}', full_name='{self.full_name}')>"

    def to_dict(self) -> dict[str, Any]:
        """Convert profile to dictionary (for API responses)."""
        return {
            "id": self.id,
            "full_name": self.full_name,
            "avatar_url": self.avatar_url,
            "avatar_key": self.avatar_key,
            "timezone": self.timezone,
            "email_notifications": self.email_notifications,
            "is_onboarded": self.is_onboarded,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
