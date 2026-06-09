# apps/api/app/models/digest.py
# SQLAlchemy model for team-level digest

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Digest(Base):
    """
    A daily team-level digest generated from all workspace updates.
    One digest per workspace per day when the scheduled task runs.
    """

    __tablename__ = "digests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    digest_date: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        index=True,
        doc="ISO date string YYYY-MM-DD",
    )
    summary: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Claude-generated team-level summary",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        doc="pending | processing | sent | failed",
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    update_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        doc="Number of updates included in this digest",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Digest(workspace_id='{self.workspace_id}', date='{self.digest_date}')>"


class DigestItem(Base):
    """Links a Digest to an individual Update that was included in it."""

    __tablename__ = "digest_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    digest_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("digests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    update_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("updates.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary_snapshot: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        doc="Copy of update.summary at digest generation time",
    )

    def __repr__(self) -> str:
        return f"<DigestItem(digest_id='{self.digest_id}', update_id='{self.update_id}')>"
