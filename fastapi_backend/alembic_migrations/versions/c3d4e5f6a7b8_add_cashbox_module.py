"""Add cashbox module

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-19
"""

from alembic import op

revision = "c3d4e5f6a7b8"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE TYPE cashboxsessionstatus AS ENUM ('open', 'closed')")
    op.execute(
        "CREATE TYPE cashboxtransactiontype AS ENUM ('sale', 'purchase', 'income', 'expense', 'customer_payment', 'opening')"
    )
    op.execute("CREATE TYPE cashboxtransactiondirection AS ENUM ('in', 'out')")
    op.execute("""
        CREATE TABLE cashbox_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            opening_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
            status cashboxsessionstatus NOT NULL DEFAULT 'open',
            opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            closed_at TIMESTAMPTZ,
            closing_amount_counted NUMERIC(14,2),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_cashbox_sessions_user_id ON cashbox_sessions(user_id)")
    op.execute("CREATE INDEX ix_cashbox_sessions_status ON cashbox_sessions(status)")
    op.execute("""
        CREATE TABLE cashbox_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID REFERENCES cashbox_sessions(id) ON DELETE SET NULL,
            user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
            type cashboxtransactiontype NOT NULL,
            direction cashboxtransactiondirection NOT NULL,
            amount NUMERIC(14,2) NOT NULL,
            payment_method VARCHAR NOT NULL DEFAULT 'cash',
            reference_type VARCHAR,
            reference_id UUID,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX ix_cashbox_transactions_session_id ON cashbox_transactions(session_id)"
    )
    op.execute(
        "CREATE INDEX ix_cashbox_transactions_user_id ON cashbox_transactions(user_id)"
    )
    op.execute(
        "CREATE INDEX ix_cashbox_transactions_type ON cashbox_transactions(type)"
    )


def downgrade():
    op.drop_table("cashbox_transactions")
    op.drop_table("cashbox_sessions")
    op.execute("DROP TYPE IF EXISTS cashboxtransactiondirection")
    op.execute("DROP TYPE IF EXISTS cashboxtransactiontype")
    op.execute("DROP TYPE IF EXISTS cashboxsessionstatus")
