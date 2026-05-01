"""add missing enum values: paymentmethod.internal and cashboxtransactiontype.owner_withdrawal

Revision ID: j5e6f7a8b9c0
Revises: i4d5e6f7a8b9
Create Date: 2026-05-01

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "j5e6f7a8b9c0"
down_revision: Union[str, None] = "e0913a34e833"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'internal'"))
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype ADD VALUE IF NOT EXISTS 'owner_withdrawal'"))


def downgrade() -> None:
    # PostgreSQL does not support removing values from an enum type directly.
    # To revert, the enum must be recreated without the added values.
    # paymentmethod: remove 'internal'
    op.execute(sa.text("ALTER TYPE paymentmethod RENAME TO paymentmethod_old"))
    op.execute(sa.text("CREATE TYPE paymentmethod AS ENUM ('cash', 'card', 'other', 'credit')"))
    op.execute(sa.text(
        "ALTER TABLE sales ALTER COLUMN payment_method TYPE paymentmethod "
        "USING payment_method::text::paymentmethod"
    ))
    op.execute(sa.text("DROP TYPE paymentmethod_old"))

    # cashboxtransactiontype: remove 'owner_withdrawal'
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype RENAME TO cashboxtransactiontype_old"))
    op.execute(sa.text(
        "CREATE TYPE cashboxtransactiontype AS ENUM "
        "('sale', 'purchase', 'income', 'expense', 'customer_payment', 'opening')"
    ))
    op.execute(sa.text(
        "ALTER TABLE cashbox_transactions ALTER COLUMN type TYPE cashboxtransactiontype "
        "USING type::text::cashboxtransactiontype"
    ))
    op.execute(sa.text("DROP TYPE cashboxtransactiontype_old"))
