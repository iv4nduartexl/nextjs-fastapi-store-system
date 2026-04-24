"""Add customers module

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add 'credit' to existing paymentmethod enum (sales)
    op.execute(sa.text("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'credit'"))

    # 2. Create customers table
    op.execute(
        sa.text("""
        CREATE TABLE customers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            name VARCHAR NOT NULL,
            phone VARCHAR,
            email VARCHAR,
            address VARCHAR,
            id_number VARCHAR,
            credit_limit NUMERIC(12, 2),
            notes VARCHAR,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    )
    op.execute(sa.text("CREATE INDEX ix_customers_user_id ON customers (user_id)"))
    op.execute(sa.text("CREATE INDEX ix_customers_name ON customers (user_id, name)"))

    # 3. Create customer_payments table
    op.execute(
        sa.text("""
        CREATE TABLE customer_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES "user"(id),
            amount NUMERIC(12, 2) NOT NULL,
            payment_method VARCHAR NOT NULL DEFAULT 'cash',
            payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            notes VARCHAR,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    )
    op.execute(
        sa.text(
            "CREATE INDEX ix_customer_payments_customer_id ON customer_payments (customer_id)"
        )
    )

    # 4. Add customer_id to sales
    op.execute(
        sa.text(
            "ALTER TABLE sales ADD COLUMN customer_id UUID REFERENCES customers(id) ON DELETE SET NULL"
        )
    )
    op.execute(sa.text("CREATE INDEX ix_sales_customer_id ON sales (customer_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_sales_customer_id"))
    op.execute(sa.text("ALTER TABLE sales DROP COLUMN IF EXISTS customer_id"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_customer_payments_customer_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS customer_payments"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_customers_name"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_customers_user_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS customers"))
    # Note: cannot remove enum values from PostgreSQL without recreating the type
