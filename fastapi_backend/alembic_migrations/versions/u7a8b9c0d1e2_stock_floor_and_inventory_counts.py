"""stock never below 0 (sale_items.stock_deducted) and inventory counts

Negative stock left by earlier sales is reset to 0.

Revision ID: u7a8b9c0d1e2
Revises: t6f7a8b9c0d1
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "u7a8b9c0d1e2"
down_revision: Union[str, None] = "t6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sale_items", sa.Column("stock_deducted", sa.Numeric(10, 3), nullable=True))
    op.execute(sa.text("UPDATE items SET stock = 0 WHERE stock < 0"))

    op.create_table(
        "inventory_counts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("business_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("lines_counted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lines_changed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_counts_business_id", "inventory_counts", ["business_id"])

    op.create_table(
        "inventory_count_lines",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("count_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=True),
        sa.Column("item_name", sa.String(), nullable=False),
        sa.Column(
            "unit_type",
            postgresql.ENUM("unit", "gram", "liter", "pack", name="unittype", create_type=False),
            nullable=False,
        ),
        sa.Column("expected", sa.Numeric(10, 3), nullable=False),
        sa.Column("counted", sa.Numeric(10, 3), nullable=False),
        sa.Column("previous_stock", sa.Numeric(10, 3), nullable=False),
        sa.Column("new_stock", sa.Numeric(10, 3), nullable=False),
        sa.ForeignKeyConstraint(["count_id"], ["inventory_counts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_count_lines_count_id", "inventory_count_lines", ["count_id"])


def downgrade() -> None:
    op.drop_index("ix_inventory_count_lines_count_id", table_name="inventory_count_lines")
    op.drop_table("inventory_count_lines")
    op.drop_index("ix_inventory_counts_business_id", table_name="inventory_counts")
    op.drop_table("inventory_counts")
    op.drop_column("sale_items", "stock_deducted")
