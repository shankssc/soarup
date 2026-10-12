# apps/api/app/models/digest.py
# SQLAlchemy model for team-level digest

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
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

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'sent', 'failed')",
            name="ck_digests_status",
        ),
        # History queries — filter by workspace, order by created_at desc
        Index("ix_digests_workspace_created", "workspace_id", "created_at"),
        # Date lookup — get digest for a specific date
        Index("ix_digests_workspace_date", "workspace_id", "digest_date"),
    )

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
    excluded_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        server_default="0",
        doc="Updates for this date that were still processing or had failed, " "and so were left out of the digest.",
    )
    delivered_to_slack: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="Whether this digest was successfully delivered to Slack.",
    )
    slack_delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        doc="Timestamp when digest was delivered to Slack channel.",
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


class DigestRecipient(Base):
    """
    Tracks which members were successfully emailed for a given digest.

    Exists because the send loop in app.workers.tasks._send_workspace_digest_async
    emails recipients one at a time and the digest itself only tracks an
    overall status (pending/processing/sent/failed) — not "sent to whom".
    Without this, a Celery retry after a partial failure (crash, timeout)
    partway through the loop would re-send to recipients who already got
    it. The unique (digest_id, user_id) constraint plus an INSERT ... ON
    CONFLICT DO NOTHING on write makes marking a recipient sent idempotent.
    """

    __tablename__ = "digest_recipients"

    __table_args__ = (
        Index(
            "ux_digest_recipients_digest_user",
            "digest_id",
            "user_id",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    digest_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("digests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    email_sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<DigestRecipient(digest_id='{self.digest_id}', user_id='{self.user_id}')>"
