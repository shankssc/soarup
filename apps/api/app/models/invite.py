# apps/api/app/models/invite.py
# WorkspaceInvite — single-use, time-limited invite token.
#
# After creating this file, add the following import to conftest.py
# in the test_engine fixture so Alembic and test create_all pick it up:


import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class WorkspaceInvite(Base):
    """
    Single-use, time-limited invite for joining a workspace.

    `code` is a URL-safe random token (32 chars via secrets.token_urlsafe(24)),
    not a UUID — shorter and safe to embed in email links without encoding.

    Lifecycle:
      PENDING  → is_used=False, expires_at in the future
      USED     → is_used=True,  used_at + used_by set
      EXPIRED  → is_used=False, expires_at in the past (treated as invalid)
      REVOKED  → is_used=True,  used_at=None, used_by=None (manually invalidated)
    """

    __tablename__ = "workspace_invites"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=_new_uuid,
    )
    workspace_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invited_by: Mapped[str] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        doc="user_id of the member who created the invite",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
        doc="Email address the invite was sent to. Used for display only — " "acceptance does not require an email match (see InviteService).",
    )
    code: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
        doc="URL-safe token used in /invite/:code link",
    )
    is_used: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        doc="Invite expires 7 days after creation",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp when the invite was accepted. None if revoked rather than accepted.",
    )
    used_by: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
        doc="user_id of the person who accepted. None if revoked.",
    )

    def __repr__(self) -> str:
        return f"<WorkspaceInvite(id='{self.id}', email='{self.email}', is_used={self.is_used})>"
