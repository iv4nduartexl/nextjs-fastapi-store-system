"""add user.last_login_at

Revision ID: p2b3c4d5e6f7
Revises: o1a2b3c4d5e6
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "p2b3c4d5e6f7"
down_revision: Union[str, None] = "o1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "last_login_at")
