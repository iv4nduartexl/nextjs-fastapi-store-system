"""supplier payments (pay purchase invoices later)

Existing paid/partially paid purchases get one payment each, so their history stays consistent.

Revision ID: t6f7a8b9c0d1
Revises: s5e6f7a8b9c0
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "t6f7a8b9c0d1"
down_revision: Union[str, None] = "s5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype ADD VALUE IF NOT EXISTS 'supplier_payment'"))
    op.execute(sa.text("ALTER TYPE cashboxtransactiontype ADD VALUE IF NOT EXISTS 'supplier_payment_cancel'"))

    op.create_table(
        "supplier_payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("purchase_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("affects_cashbox", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"]),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_supplier_payments_business_id", "supplier_payments", ["business_id"])
    op.create_index("ix_supplier_payments_purchase_id", "supplier_payments", ["purchase_id"])

    # One payment per already (partially) paid purchase; in the cashbox only if it was recorded there
    op.execute(
        sa.text(
            """
            INSERT INTO supplier_payments
                (id, business_id, purchase_id, user_id, amount, method, paid_at, affects_cashbox, created_at)
            SELECT gen_random_uuid(), p.business_id, p.id, p.user_id, p.paid_amount,
                   CASE WHEN p.payment_method::text = 'credit' THEN 'cash' ELSE p.payment_method::text END,
                   p.purchase_date,
                   EXISTS (
                       SELECT 1 FROM cashbox_transactions t
                       WHERE t.reference_type = 'purchase' AND t.reference_id = p.id AND t.type = 'purchase'
                   ),
                   p.created_at
            FROM purchases p
            WHERE p.paid_amount IS NOT NULL AND p.paid_amount > 0
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_supplier_payments_purchase_id", table_name="supplier_payments")
    op.drop_index("ix_supplier_payments_business_id", table_name="supplier_payments")
    op.drop_table("supplier_payments")
    # Enum values can't be dropped in PostgreSQL; the two extra values are left unused
