"""Add categories table

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-21 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "user_id", UUID(as_uuid=True), sa.ForeignKey("user.id"), nullable=False
        ),
        sa.UniqueConstraint("name", "user_id", name="uq_category_name_user"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])

    # Seed from existing item categories
    op.execute(
        sa.text("""
        INSERT INTO categories (id, name, user_id)
        SELECT gen_random_uuid(), category, user_id
        FROM items
        WHERE category IS NOT NULL AND category != ''
        GROUP BY category, user_id
        ON CONFLICT ON CONSTRAINT uq_category_name_user DO NOTHING
    """)
    )


def downgrade() -> None:
    op.drop_index("ix_categories_user_id", table_name="categories")
    op.drop_table("categories")
