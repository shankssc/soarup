"""add email_notifications to workspace_members

Revision ID: 5f34b2c267dd
Revises: d929f649b7cf
Create Date: 2026-07-21 20:40:32.658048+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f34b2c267dd'  # pragma: allowlist secret
down_revision: Union[str, None] = 'd929f649b7cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'workspace_members',
        sa.Column(
            'email_notifications',
            sa.Boolean(),
            nullable=False,
            # Existing memberships backfill to opted-in — matches
            # Profile.email_notifications' existing default, so behavior
            # is unchanged for every current member until someone
            # explicitly unsubscribes from a specific workspace's digest.
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column('workspace_members', 'email_notifications')
