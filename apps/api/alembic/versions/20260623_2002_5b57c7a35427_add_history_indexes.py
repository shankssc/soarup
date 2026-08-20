"""add_history_indexes

Revision ID: 5b57c7a35427
Revises: add_history_indexes
Create Date: 2026-06-23 20:02:20.226919+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b57c7a35427'
down_revision: Union[str, None] = 'add_history_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
