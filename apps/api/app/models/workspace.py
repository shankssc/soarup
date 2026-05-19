# apps/api/app/models/workspace.py
# SQLAlchemy models for workspaces and workspace membership

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Workspace(Base):
    """
    A workspace is the top-level multi-tenancy boundary.
    Every resource (updates, digests, members) belongs to a workspace.
    """

    __tablename__ = "workspaces"

    # === Primary Key ===
    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=_new_uuid,
        doc="Workspace UUID",
    )

    # === Core Fields ===
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Display name of the workspace",
    )

    slug: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
        index=True,
        doc="URL-safe identifier — lowercase alphanumeric + hyphens",
    )

    owner_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        doc="Supabase user ID of the workspace owner",
    )

    plan: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="free",
        doc="Billing plan — 'free' or 'pro' (future)",
    )

    # === AI Prompt Configuration ===
    summarisation_prompt: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Custom Claude prompt for update summarisation. " "If None, the default prompt from app.workers.prompts is used.",
    )

    digest_prompt: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Custom Claude prompt for daily digest generation (Milestone 6).",
    )

    # === Timestamps ===
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Workspace creation timestamp",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        doc="Last workspace update timestamp",
    )

    def __repr__(self) -> str:
        return f"<Workspace(id='{self.id}', slug='{self.slug}')>"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "owner_id": self.owner_id,
            "plan": self.plan,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class WorkspaceMember(Base):
    """
    Join table — tracks which users belong to which workspaces and their roles.
    Unique constraint on (workspace_id, user_id) prevents duplicate membership.
    """

    __tablename__ = "workspace_members"

    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_members_workspace_user"),)

    # === Primary Key ===
    # Surrogate PK — simpler for FK references and easier to work with in queries.
    # Uniqueness of (workspace_id, user_id) is enforced via the constraint above.
    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=_new_uuid,
        doc="Membership record UUID",
    )

    # === Foreign Keys ===
    workspace_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="FK → workspaces.id",
    )

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="FK → profiles.id (Supabase user ID)",
    )

    # === Membership Fields ===
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="member",
        doc="Role within the workspace — 'owner', 'admin', or 'member'",
    )

    invited_by: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        doc="FK → profiles.id of the user who sent the invite (null for workspace creator)",
    )

    # === Timestamps ===
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        doc="Timestamp when user joined the workspace",
    )

    def __repr__(self) -> str:
        return f"<WorkspaceMember(workspace_id='{self.workspace_id}', user_id='{self.user_id}', role='{self.role}')>"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "user_id": self.user_id,
            "role": self.role,
            "invited_by": self.invited_by,
            "joined_at": self.joined_at.isoformat() if self.joined_at else None,
        }
