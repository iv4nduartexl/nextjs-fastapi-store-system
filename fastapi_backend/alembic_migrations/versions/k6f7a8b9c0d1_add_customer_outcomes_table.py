"""add customer outcomes table

Revision ID: k6f7a8b9c0d1
Revises: j5e6f7a8b9c0
Create Date: 2026-05-03

"""
from typing import Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "k6f7a8b9c0d1"
down_revision: Union[str, None] = "j5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE customer_outcomes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES "user"(id),
            amount NUMERIC(12,2) NOT NULL,
            description VARCHAR NOT NULL,
            outcome_date TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX ix_customer_outcomes_customer_id ON customer_outcomes (customer_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_customer_outcomes_customer_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS customer_outcomes"))
