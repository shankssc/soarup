"""add_status_check_constraints

Revision ID: da2d2f3bc448
Revises: 4b4aec44a575
Create Date: 2026-10-12 11:30:49.551264+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da2d2f3bc448'  # pragma: allowlist secret
down_revision: Union[str, None] = '4b4aec44a575'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_updates_status",
        "updates",
        "status IN ('pending', 'processing', 'processed', 'failed')",
    )
    op.create_check_constraint(
        "ck_digests_status",
        "digests",
        "status IN ('pending', 'processing', 'sent', 'failed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_digests_status", "digests", type_="check")
    op.drop_constraint("ck_updates_status", "updates", type_="check")
