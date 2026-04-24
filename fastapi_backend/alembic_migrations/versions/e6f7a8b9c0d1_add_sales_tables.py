"""Add sales tables

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("DROP TYPE IF EXISTS salestatus"))
    op.execute(sa.text("DROP TYPE IF EXISTS paymentmethod"))
    op.execute(
        sa.text("CREATE TYPE salestatus AS ENUM ('completed', 'cancelled', 'refunded')")
    )
    op.execute(sa.text("CREATE TYPE paymentmethod AS ENUM ('cash', 'card', 'other')"))
    op.execute(
        sa.text("""
        CREATE TABLE sales (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES "user"(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            total NUMERIC(10, 2) NOT NULL,
            status salestatus NOT NULL DEFAULT 'completed',
            payment_method paymentmethod NOT NULL DEFAULT 'cash',
            amount_tendered NUMERIC(10, 2),
            change_given NUMERIC(10, 2),
            notes VARCHAR
        )
    """)
    )
    op.execute(
        sa.text("""
        CREATE TABLE sale_items (
            id UUID PRIMARY KEY,
            sale_id UUID NOT NULL REFERENCES sales(id),
            item_id UUID REFERENCES items(id),
            item_name VARCHAR NOT NULL,
            unit_type VARCHAR NOT NULL,
            unit_price NUMERIC(10, 2) NOT NULL,
            quantity NUMERIC(10, 3) NOT NULL,
            subtotal NUMERIC(10, 2) NOT NULL
        )
    """)
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS sale_items"))
    op.execute(sa.text("DROP TABLE IF EXISTS sales"))
    op.execute(sa.text("DROP TYPE IF EXISTS salestatus"))
    op.execute(sa.text("DROP TYPE IF EXISTS paymentmethod"))
