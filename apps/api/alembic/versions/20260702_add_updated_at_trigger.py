"""add_updated_at_trigger

Revision ID: a1b2c3d4e5f6
Revises: dc04381d2f54
Create Date: 2026-07-02 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'  # pragma: allowlist secret
down_revision: Union[str, None] = 'dc04381d2f54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER updates_updated_at
        BEFORE UPDATE ON updates
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS updates_updated_at ON updates;")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column;")
