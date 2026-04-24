"""Add purchases tables

Revision ID: f1a2b3c4d5e6
Revises: e6f7a8b9c0d1
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("DROP TYPE IF EXISTS purchasestatus"))
    op.execute(sa.text("DROP TYPE IF EXISTS purchasepaymentstatus"))
    op.execute(sa.text("DROP TYPE IF EXISTS purchasepaymentmethod"))
    op.execute(
        sa.text(
            "CREATE TYPE purchasestatus AS ENUM ('received', 'partial', 'cancelled')"
        )
    )
    op.execute(
        sa.text(
            "CREATE TYPE purchasepaymentstatus AS ENUM ('paid', 'unpaid', 'partial')"
        )
    )
    op.execute(
        sa.text(
            "CREATE TYPE purchasepaymentmethod AS ENUM ('cash', 'card', 'transfer', 'credit')"
        )
    )
    op.execute(
        sa.text("""
        CREATE TABLE purchases (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES "user"(id),
            supplier_name VARCHAR(255),
            reference_number VARCHAR(100),
            purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status purchasestatus NOT NULL DEFAULT 'received',
            payment_status purchasepaymentstatus NOT NULL DEFAULT 'paid',
            payment_method purchasepaymentmethod NOT NULL DEFAULT 'cash',
            subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
            tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
            total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
            notes VARCHAR
        )
    """)
    )
    op.execute(
        sa.text("""
        CREATE TABLE purchase_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
            item_id UUID REFERENCES items(id) ON DELETE SET NULL,
            item_name VARCHAR NOT NULL,
            unit_type VARCHAR NOT NULL DEFAULT 'unit',
            quantity NUMERIC(12, 3) NOT NULL,
            cost_price NUMERIC(12, 2) NOT NULL,
            subtotal NUMERIC(12, 2) NOT NULL
        )
    """)
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS purchase_items"))
    op.execute(sa.text("DROP TABLE IF EXISTS purchases"))
    op.execute(sa.text("DROP TYPE IF EXISTS purchasepaymentmethod"))
    op.execute(sa.text("DROP TYPE IF EXISTS purchasepaymentstatus"))
    op.execute(sa.text("DROP TYPE IF EXISTS purchasestatus"))
