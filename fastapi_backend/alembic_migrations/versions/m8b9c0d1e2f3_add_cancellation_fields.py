"""add cancellation fields to sales/purchases and cashbox reversal types

Revision ID: m8b9c0d1e2f3
Revises: b94918ff8152
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "m8b9c0d1e2f3"
down_revision: Union[str, None] = "b94918ff8152"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype ADD VALUE IF NOT EXISTS 'sale_cancel'"))
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype ADD VALUE IF NOT EXISTS 'purchase_cancel'"))

    for table in ("sales", "purchases"):
        op.add_column(table, sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("cancelled_by", sa.UUID(), nullable=True))
        op.add_column(table, sa.Column("cancel_reason", sa.String(), nullable=True))
        op.create_foreign_key(
            f"{table}_cancelled_by_fkey", table, "user", ["cancelled_by"], ["id"]
        )


def downgrade() -> None:
    for table in ("sales", "purchases"):
        op.drop_constraint(f"{table}_cancelled_by_fkey", table, type_="foreignkey")
        op.drop_column(table, "cancel_reason")
        op.drop_column(table, "cancelled_by")
        op.drop_column(table, "cancelled_at")

    # PostgreSQL can't drop enum values; recreate the type without the reversal values.
    op.execute(sa.text(
        "DELETE FROM cashbox_transactions WHERE type IN ('sale_cancel', 'purchase_cancel')"
    ))
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype RENAME TO cashboxtransactiontype_old"))
    op.execute(sa.text(
        "CREATE TYPE cashboxtransactiontype AS ENUM "
        "('sale', 'purchase', 'income', 'expense', 'customer_payment', 'opening', 'owner_withdrawal')"
    ))
    op.execute(sa.text(
        "ALTER TABLE cashbox_transactions ALTER COLUMN type TYPE cashboxtransactiontype "
        "USING type::text::cashboxtransactiontype"
    ))
    op.execute(sa.text("DROP TYPE cashboxtransactiontype_old"))
