"""purchases.invoice_total

Revision ID: s5e6f7a8b9c0
Revises: r4d5e6f7a8b9
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "s5e6f7a8b9c0"
down_revision: Union[str, None] = "r4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("purchases", sa.Column("invoice_total", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("purchases", "invoice_total")
