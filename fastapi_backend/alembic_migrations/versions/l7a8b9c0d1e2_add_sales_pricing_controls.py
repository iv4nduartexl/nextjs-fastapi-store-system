"""add sales pricing controls

Revision ID: l7a8b9c0d1e2
Revises: k6f7a8b9c0d1
Create Date: 2026-05-03

"""
from typing import Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "l7a8b9c0d1e2"
down_revision: Union[str, None] = "k6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE pricingsource AS ENUM ('base', 'quantity_discount', 'manual_override');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """))

    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE discountrulescope AS ENUM ('global_scope', 'item', 'category');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """))

    op.execute(sa.text("""
        DO $$ BEGIN
            CREATE TYPE discountruletype AS ENUM ('percent', 'fixed_price', 'buy_x_get_y');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """))

    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS base_unit_price NUMERIC(10,2)"))
    op.execute(sa.text("UPDATE sale_items SET base_unit_price = unit_price WHERE base_unit_price IS NULL"))
    op.execute(sa.text("ALTER TABLE sale_items ALTER COLUMN base_unit_price SET NOT NULL"))

    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS pricing_source pricingsource NOT NULL DEFAULT 'base'"))
    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_rule_name VARCHAR"))
    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0"))
    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS manual_override_reason VARCHAR"))
    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS manual_overridden_by UUID REFERENCES \"user\"(id)"))
    op.execute(sa.text("ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS manual_overridden_at TIMESTAMPTZ"))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_price_change_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            sale_item_id UUID NULL REFERENCES sale_items(id) ON DELETE CASCADE,
            change_scope VARCHAR NOT NULL,
            source VARCHAR NOT NULL,
            old_value NUMERIC(12,2) NOT NULL,
            new_value NUMERIC(12,2) NOT NULL,
            reason VARCHAR NULL,
            user_id UUID NOT NULL REFERENCES \"user\"(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sale_price_change_logs_sale_id ON sale_price_change_logs (sale_id)"))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS quantity_discount_rules (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES \"user\"(id),
            name VARCHAR NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            priority NUMERIC(6,0) NOT NULL DEFAULT 100,
            scope discountrulescope NOT NULL DEFAULT 'global_scope',
            item_id UUID NULL REFERENCES items(id),
            category VARCHAR NULL,
            min_qty NUMERIC(10,3) NOT NULL DEFAULT 1,
            rule_type discountruletype NOT NULL,
            percent_off NUMERIC(5,2) NULL,
            fixed_unit_price NUMERIC(10,2) NULL,
            buy_qty NUMERIC(10,3) NULL,
            free_qty NUMERIC(10,3) NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_quantity_discount_rules_user_id ON quantity_discount_rules (user_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_quantity_discount_rules_user_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS quantity_discount_rules"))

    op.execute(sa.text("DROP INDEX IF EXISTS ix_sale_price_change_logs_sale_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS sale_price_change_logs"))

    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS manual_overridden_at"))
    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS manual_overridden_by"))
    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS manual_override_reason"))
    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS discount_amount"))
    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS discount_rule_name"))
    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS pricing_source"))
    op.execute(sa.text("ALTER TABLE sale_items DROP COLUMN IF EXISTS base_unit_price"))

    op.execute(sa.text("DROP TYPE IF EXISTS discountruletype"))
    op.execute(sa.text("DROP TYPE IF EXISTS discountrulescope"))
    op.execute(sa.text("DROP TYPE IF EXISTS pricingsource"))
