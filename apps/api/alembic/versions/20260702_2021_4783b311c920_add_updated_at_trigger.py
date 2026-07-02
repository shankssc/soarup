"""add_updated_at_trigger

Revision ID: 4783b311c920
Revises: a1b2c3d4e5f6
Create Date: 2026-07-02 20:21:51.504132+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4783b311c920'  # pragma: allowlist secret
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
