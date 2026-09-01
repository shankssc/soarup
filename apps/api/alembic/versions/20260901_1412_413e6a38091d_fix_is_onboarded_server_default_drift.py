"""fix_is_onboarded_server_default_drift

Revision ID: 413e6a38091d
Revises: 5f34b2c267dd
Create Date: 2026-09-01 14:12:38.251003+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '413e6a38091d'  # pragma: allowlist secret
down_revision: Union[str, None] = '5f34b2c267dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Restore server_default='false' on is_onboarded.
    # This was originally set in 20afec183981 but stripped by
    # add_slack_config_to_workspaces (dc04381d2f54) via an
    # op.alter_column(server_default=None) that autogenerate produced
    # as a phantom diff. The model now declares server_default explicitly
    # to prevent recurrence.
    op.alter_column(
        'profiles',
        'is_onboarded',
        existing_type=sa.Boolean(),
        server_default=sa.text('false'),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'profiles',
        'is_onboarded',
        existing_type=sa.Boolean(),
        server_default=None,
        existing_nullable=False,
    )
