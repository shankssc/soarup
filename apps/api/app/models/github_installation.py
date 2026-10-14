# apps/api/app/models/github_installation.py

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class GitHubInstallation(Base):
    """
    Tracks a user's connected GitHub App installation(s).

    A user can have multiple rows — e.g. their personal account plus
    one or more organizations. Independent of sign-in method; a user
    who logged in via email/password or Google can still connect GitHub.
    """

    __tablename__ = "github_installations"

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'pending_approval', 'revoked')",
            name="ck_github_installations_status",
        ),
        CheckConstraint(
            "account_type IN ('User', 'Organization')",
            name="ck_github_installations_account_type",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    installation_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        unique=True,
        doc="GitHub's installation ID — used to generate installation " "access tokens via the App's private key.",
    )
    account_login: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="The GitHub username or org name this installation belongs to.",
    )
    account_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        doc="'User' or 'Organization', from GitHub's installation payload.",
    )
    github_login: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        doc="The GitHub username of the user who triggered the install "
        "(sender.login from the installation payload). For personal "
        "installs this equals account_login; for org installs it's "
        "the org member who connected — used to author-filter "
        "PRs/issues/commits in the data-fetch service.",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="active",
        nullable=False,
        doc="'active' | 'pending_approval' | 'revoked'. " "pending_approval: org install awaiting admin approval. " "revoked: detected when an installation token request returns " "401/404 — prompts reconnect in the UI.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<GitHubInstallation(" f"user_id='{self.user_id}', " f"account='{self.account_login}', " f"github_login='{self.github_login}')>"
