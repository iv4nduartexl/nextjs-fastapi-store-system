"""sales.request_id (idempotent checkout) and purchases.paid_amount

Revision ID: r4d5e6f7a8b9
Revises: q3c4d5e6f7a8
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "r4d5e6f7a8b9"
down_revision: Union[str, None] = "q3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales", sa.Column("request_id", sa.String(), nullable=True))
    op.create_unique_constraint("uq_sale_business_request", "sales", ["business_id", "request_id"])

    op.add_column("purchases", sa.Column("paid_amount", sa.Numeric(12, 2), nullable=True))
    # Known for fully paid / unpaid purchases; partial ones stay unknown (NULL)
    op.execute("UPDATE purchases SET paid_amount = total_cost WHERE payment_status = 'paid'")
    op.execute("UPDATE purchases SET paid_amount = 0 WHERE payment_status = 'unpaid'")


def downgrade() -> None:
    op.drop_column("purchases", "paid_amount")
    op.drop_constraint("uq_sale_business_request", "sales", type_="unique")
    op.drop_column("sales", "request_id")
