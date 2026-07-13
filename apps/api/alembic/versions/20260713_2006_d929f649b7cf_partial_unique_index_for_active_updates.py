"""partial unique index for active updates

Revision ID: d929f649b7cf
Revises: fb090fad7a42
Create Date: 2026-07-13 20:06:06.210594+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd929f649b7cf'  # pragma: allowlist secret
down_revision: Union[str, None] = 'fb090fad7a42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_updates_user_workspace_date",
        "updates",
        type_="unique",
    )
    op.create_index(
        "uq_updates_user_workspace_date_active",
        "updates",
        ["workspace_id", "user_id", "update_date"],
        unique=True,
        postgresql_where="is_deleted = false",
    )


def downgrade() -> None:
    op.drop_index("uq_updates_user_workspace_date_active",
                  table_name="updates")
    # Note: this recreates the original all-rows constraint. If any user has
    # both an active and a soft-deleted update for the same day at downgrade
    # time (now possible thanks to the upgrade), this will fail — that data
    # would need manual cleanup before downgrading.
    op.create_unique_constraint(
        "uq_updates_user_workspace_date",
        "updates",
        ["workspace_id", "user_id", "update_date"],
    )
