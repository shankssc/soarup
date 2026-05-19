# apps/api/app/models/update.py

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Update(Base):
    """
    A single standup update submitted by a workspace member.
    Text mode for Milestone 2 — voice mode added in Milestone 4.
    """

    __tablename__ = "updates"

    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "user_id",
            "update_date",
            name="uq_updates_user_workspace_date",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(String(10), default="text")
    # "pending" → "processing" → "processed" | "failed"
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    # AI output — nullable until Milestone 3
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ISO date string "YYYY-MM-DD" in user's timezone
    # One update per user per workspace per day (enforced by unique constraint above)
    update_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Update(id='{self.id}', user_id='{self.user_id}', date='{self.update_date}')>"
