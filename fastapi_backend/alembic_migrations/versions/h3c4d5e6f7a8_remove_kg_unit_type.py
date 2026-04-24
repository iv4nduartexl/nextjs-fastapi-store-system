"""Remove kg unit type, migrate kg items to gram

Revision ID: h3c4d5e6f7a8
Revises: g2b3c4d5e6f7
Create Date: 2026-04-21 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "h3c4d5e6f7a8"
down_revision: Union[str, None] = "g2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Migrate all kg rows to gram first
    op.execute(sa.text("UPDATE items SET unit_type = 'gram' WHERE unit_type = 'kg'"))
    op.execute(sa.text("UPDATE purchase_items SET unit_type = 'gram' WHERE unit_type = 'kg'"))
    op.execute(sa.text("UPDATE sale_items SET unit_type = 'gram' WHERE unit_type = 'kg'"))

    # Recreate enum without kg
    op.execute(sa.text("ALTER TYPE unittype RENAME TO unittype_old"))
    op.execute(sa.text("CREATE TYPE unittype AS ENUM ('unit', 'gram', 'liter', 'pack')"))

    # Drop defaults, alter column types, restore defaults
    op.execute(sa.text("ALTER TABLE items ALTER COLUMN unit_type DROP DEFAULT"))
    op.execute(sa.text(
        "ALTER TABLE items ALTER COLUMN unit_type TYPE unittype USING unit_type::text::unittype"
    ))
    op.execute(sa.text("ALTER TABLE items ALTER COLUMN unit_type SET DEFAULT 'unit'"))

    op.execute(sa.text("ALTER TABLE purchase_items ALTER COLUMN unit_type DROP DEFAULT"))
    op.execute(sa.text(
        "ALTER TABLE purchase_items ALTER COLUMN unit_type TYPE unittype USING unit_type::text::unittype"
    ))

    op.execute(sa.text("DROP TYPE unittype_old"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TYPE unittype RENAME TO unittype_old"))
    op.execute(sa.text("CREATE TYPE unittype AS ENUM ('unit', 'kg', 'gram', 'liter', 'pack')"))
    op.execute(sa.text(
        "ALTER TABLE items ALTER COLUMN unit_type TYPE unittype USING unit_type::text::unittype"
    ))
    op.execute(sa.text(
        "ALTER TABLE purchase_items ALTER COLUMN unit_type TYPE unittype USING unit_type::text::unittype"
    ))
    op.execute(sa.text("DROP TYPE unittype_old"))
