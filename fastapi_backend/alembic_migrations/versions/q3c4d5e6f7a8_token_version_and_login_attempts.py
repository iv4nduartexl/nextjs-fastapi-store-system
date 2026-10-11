"""add user.token_version and login_attempts

Revision ID: q3c4d5e6f7a8
Revises: p2b3c4d5e6f7
Create Date: 2026-10-11

"""
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "q3c4d5e6f7a8"
down_revision: Union[str, None] = "p2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("token_version", sa.Integer(), server_default=sa.text("0"), nullable=False))
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("ip", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_login_attempts_email", "login_attempts", ["email"])
    op.create_index("ix_login_attempts_ip", "login_attempts", ["ip"])
    op.create_index("ix_login_attempts_created_at", "login_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_login_attempts_created_at", table_name="login_attempts")
    op.drop_index("ix_login_attempts_ip", table_name="login_attempts")
    op.drop_index("ix_login_attempts_email", table_name="login_attempts")
    op.drop_table("login_attempts")
    op.drop_column("user", "token_version")
