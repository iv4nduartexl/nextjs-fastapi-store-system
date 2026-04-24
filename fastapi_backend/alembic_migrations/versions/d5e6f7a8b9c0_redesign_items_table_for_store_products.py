"""Redesign items table for store products

Revision ID: d5e6f7a8b9c0
Revises: c1a2b3d4e5f6
Create Date: 2026-04-19 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, None] = "c1a2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

unit_type_enum = sa.Enum(
    "unit",
    "kg",
    "gram",
    "liter",
    "pack",
    name="unittype",
)


def upgrade() -> None:
    unit_type_enum.create(op.get_bind(), checkfirst=True)

    op.drop_column("items", "quantity")

    op.add_column("items", sa.Column("sku", sa.String(), nullable=True))
    op.add_column("items", sa.Column("category", sa.String(), nullable=True))
    op.add_column(
        "items",
        sa.Column(
            "unit_type",
            sa.Enum("unit", "kg", "gram", "liter", "pack", name="unittype"),
            nullable=False,
            server_default="unit",
        ),
    )
    op.add_column(
        "items",
        sa.Column(
            "stock",
            sa.Numeric(precision=10, scale=3),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "items",
        sa.Column("min_stock", sa.Numeric(precision=10, scale=3), nullable=True),
    )
    op.add_column(
        "items",
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=True),
    )

    op.create_index(op.f("ix_items_sku"), "items", ["sku"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_items_sku"), table_name="items")

    op.drop_column("items", "price")
    op.drop_column("items", "min_stock")
    op.drop_column("items", "stock")
    op.drop_column("items", "unit_type")
    op.drop_column("items", "category")
    op.drop_column("items", "sku")

    op.add_column(
        "items",
        sa.Column("quantity", sa.Integer(), nullable=True),
    )

    unit_type_enum.drop(op.get_bind(), checkfirst=True)
