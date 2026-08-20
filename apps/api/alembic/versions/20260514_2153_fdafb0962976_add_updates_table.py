"""add_updates_table

Revision ID: fdafb0962976
Revises: 001_workspaces
Create Date: 2026-05-14 21:53:17.366611+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'fdafb0962976'  # pragma: allowlist secret
down_revision: Union[str, None] = '001_workspaces'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('updates',
                    sa.Column('id', sa.String(), nullable=False),
                    sa.Column('workspace_id', sa.String(), nullable=False),
                    sa.Column('user_id', sa.String(), nullable=False),
                    sa.Column('content', sa.Text(), nullable=False),
                    sa.Column('mode', sa.String(length=10), nullable=False),
                    sa.Column('status', sa.String(length=20), nullable=False),
                    sa.Column('summary', sa.Text(), nullable=True),
                    sa.Column('transcript', sa.Text(), nullable=True),
                    sa.Column('update_date', sa.String(
                        length=10), nullable=False),
                    sa.Column('is_deleted', sa.Boolean(),
                              server_default=sa.text('false'), nullable=False),
                    sa.Column('created_at', sa.DateTime(timezone=True),
                              server_default=sa.text('now()'), nullable=False),
                    sa.Column('updated_at', sa.DateTime(timezone=True),
                              server_default=sa.text('now()'), nullable=False),
                    sa.ForeignKeyConstraint(
                        ['user_id'], ['profiles.id'], ondelete='CASCADE'),
                    sa.ForeignKeyConstraint(
                        ['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
                    sa.PrimaryKeyConstraint('id'),
                    sa.UniqueConstraint('workspace_id', 'user_id',
                                        'update_date', name='uq_updates_user_workspace_date')
                    )
    op.create_index(op.f('ix_updates_status'),
                    'updates', ['status'], unique=False)
    op.create_index(op.f('ix_updates_update_date'),
                    'updates', ['update_date'], unique=False)
    op.create_index(op.f('ix_updates_user_id'),
                    'updates', ['user_id'], unique=False)
    op.create_index(op.f('ix_updates_workspace_id'),
                    'updates', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_updates_workspace_id'), table_name='updates')
    op.drop_index(op.f('ix_updates_user_id'), table_name='updates')
    op.drop_index(op.f('ix_updates_update_date'), table_name='updates')
    op.drop_index(op.f('ix_updates_status'), table_name='updates')
    op.drop_table('updates')
