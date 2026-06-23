"""add_history_indexes

Revision ID: add_history_indexes
Revises: <replace_with_previous_head>
Create Date: 2026-06-23

Indexes added:
  updates: ix_updates_workspace_date, ix_updates_user_workspace, ix_updates_user_date
  digests: ix_digests_workspace_created, ix_digests_workspace_date

All three update indexes back the history pagination and analytics queries:
  - ix_updates_workspace_date: GET /updates/history (workspace + date range filter)
  - ix_updates_user_workspace:  per-user filters in history + team analytics
  - ix_updates_user_date:       streak calculation (user + date, ordered desc)

NOTE: After generating with --autogenerate, verify these op.create_index calls
are present before running upgrade. Autogenerate may not detect index additions
on existing tables reliably.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_history_indexes"
down_revision: str | None = "1df2f2fdd226"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ------------------------------------------------------------------ updates
    op.create_index(
        "ix_updates_workspace_date",
        "updates",
        ["workspace_id", "update_date"],
    )
    op.create_index(
        "ix_updates_user_workspace",
        "updates",
        ["user_id", "workspace_id"],
    )
    op.create_index(
        "ix_updates_user_date",
        "updates",
        ["user_id", "update_date"],
    )

    # ------------------------------------------------------------------ digests
    op.create_index(
        "ix_digests_workspace_created",
        "digests",
        ["workspace_id", "created_at"],
    )
    op.create_index(
        "ix_digests_workspace_date",
        "digests",
        ["workspace_id", "digest_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_digests_workspace_date", table_name="digests")
    op.drop_index("ix_digests_workspace_created", table_name="digests")
    op.drop_index("ix_updates_user_date", table_name="updates")
    op.drop_index("ix_updates_user_workspace", table_name="updates")
    op.drop_index("ix_updates_workspace_date", table_name="updates")
