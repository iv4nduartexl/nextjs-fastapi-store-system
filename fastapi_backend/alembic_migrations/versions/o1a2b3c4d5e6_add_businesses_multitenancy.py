"""add businesses (multi-tenancy), user roles and audit log

Every existing user becomes the owner of their own business and all their data is moved into it,
so existing clients keep their data and their login unchanged.

Revision ID: o1a2b3c4d5e6
Revises: n9c0d1e2f3a4
Create Date: 2026-10-11

"""
import uuid
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "o1a2b3c4d5e6"
down_revision: Union[str, None] = "n9c0d1e2f3a4"
branch_labels = None
depends_on = None

# Tables whose rows belong to the business of their user_id
TENANT_TABLES = [
    "categories",
    "items",
    "sales",
    "sale_price_change_logs",
    "quantity_discount_rules",
    "purchases",
    "customers",
    "customer_payments",
    "customer_outcomes",
    "cashbox_sessions",
    "cashbox_transactions",
    "ai_settings",
    "chat_conversations",
]

user_role = postgresql.ENUM("owner", "cashier", name="userrole", create_type=False)


def upgrade() -> None:
    conn = op.get_bind()

    # 1. New tables and nullable columns
    op.create_table(
        "businesses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("currency_symbol", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    postgresql.ENUM("owner", "cashier", name="userrole").create(conn, checkfirst=True)
    op.add_column("user", sa.Column("full_name", sa.String(), nullable=True))
    op.add_column("user", sa.Column("business_id", sa.UUID(), nullable=True))
    op.add_column("user", sa.Column("role", user_role, server_default="owner", nullable=False))
    op.add_column(
        "user",
        sa.Column("must_change_password", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_foreign_key("user_business_id_fkey", "user", "businesses", ["business_id"], ["id"])
    op.create_index("ix_user_business_id", "user", ["business_id"])

    for table in TENANT_TABLES + ["suppliers"]:
        op.add_column(table, sa.Column("business_id", sa.UUID(), nullable=True))
    op.add_column("suppliers", sa.Column("user_id", sa.UUID(), nullable=True))
    op.create_foreign_key("suppliers_user_id_fkey", "suppliers", "user", ["user_id"], ["id"])

    # 2. One business per existing user, owned by that user
    users = conn.execute(sa.text('SELECT id, username, email FROM "user" ORDER BY email')).fetchall()
    for user_id, username, email in users:
        business_id = uuid.uuid4()
        conn.execute(
            sa.text("INSERT INTO businesses (id, name) VALUES (:id, :name)"),
            {"id": business_id, "name": username or email},
        )
        conn.execute(
            sa.text('UPDATE "user" SET business_id = :b, role = \'owner\' WHERE id = :u'),
            {"b": business_id, "u": user_id},
        )

    # 3. Move every row into its user's business
    for table in TENANT_TABLES:
        conn.execute(
            sa.text(
                f'UPDATE {table} t SET business_id = u.business_id FROM "user" u WHERE t.user_id = u.id'
            )
        )

    # 4. Suppliers had no owner: give each one the business of the purchases that use it
    fallback_business = conn.execute(
        sa.text(
            "SELECT b.id FROM businesses b LEFT JOIN sales s ON s.business_id = b.id "
            "GROUP BY b.id ORDER BY count(s.id) DESC, b.id LIMIT 1"
        )
    ).scalar()
    suppliers = conn.execute(
        sa.text(
            "SELECT s.id, array_remove(array_agg(DISTINCT p.business_id), NULL) "
            "FROM suppliers s LEFT JOIN purchases p ON p.supplier_id = s.id GROUP BY s.id"
        )
    ).fetchall()
    for supplier_id, businesses in suppliers:
        businesses = list(businesses or [])
        if not businesses:
            if fallback_business is None:
                continue  # no businesses at all; the NULL check below reports it
            businesses = [fallback_business]
        conn.execute(
            sa.text("UPDATE suppliers SET business_id = :b WHERE id = :s"),
            {"b": businesses[0], "s": supplier_id},
        )
        # Used by several businesses: each other business gets its own copy
        for business_id in businesses[1:]:
            copy_id = uuid.uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO suppliers (id, name, phone, email, address, business_id) "
                    "SELECT :copy, name, phone, email, address, :b FROM suppliers WHERE id = :s"
                ),
                {"copy": copy_id, "b": business_id, "s": supplier_id},
            )
            conn.execute(
                sa.text(
                    "UPDATE purchases SET supplier_id = :copy WHERE supplier_id = :s AND business_id = :b"
                ),
                {"copy": copy_id, "s": supplier_id, "b": business_id},
            )

    # 5. Verify before enforcing: nothing may be left without a business
    for table in TENANT_TABLES + ["suppliers"]:
        missing = conn.execute(sa.text(f"SELECT count(*) FROM {table} WHERE business_id IS NULL")).scalar()
        if missing:
            raise RuntimeError(f"{missing} rows in {table} have no business; fix them before migrating")

    duplicated_open = conn.execute(
        sa.text(
            "SELECT business_id FROM cashbox_sessions WHERE status = 'open' "
            "GROUP BY business_id HAVING count(*) > 1"
        )
    ).fetchall()
    if duplicated_open:
        raise RuntimeError(
            "Some businesses have more than one open cashbox session; close the extra ones before migrating"
        )

    # 6. Enforce
    for table in TENANT_TABLES + ["suppliers"]:
        op.alter_column(table, "business_id", nullable=False)
        op.create_foreign_key(f"{table}_business_id_fkey", table, "businesses", ["business_id"], ["id"])
        op.create_index(f"ix_{table}_business_id", table, ["business_id"])

    op.drop_constraint("uq_category_name_user", "categories", type_="unique")
    op.create_unique_constraint("uq_category_business_name", "categories", ["business_id", "name"])

    op.drop_index("ix_items_sku", table_name="items")
    op.create_index("ix_items_sku", "items", ["sku"])
    op.create_unique_constraint("uq_item_business_sku", "items", ["business_id", "sku"])

    op.drop_constraint("ai_settings_user_id_key", "ai_settings", type_="unique")
    op.drop_constraint("ai_settings_user_id_fkey", "ai_settings", type_="foreignkey")
    op.alter_column("ai_settings", "user_id", nullable=True)
    op.create_foreign_key(
        "ai_settings_user_id_fkey", "ai_settings", "user", ["user_id"], ["id"], ondelete="SET NULL"
    )
    op.create_unique_constraint("uq_ai_settings_business", "ai_settings", ["business_id"])

    op.create_index(
        "uq_cashbox_open_session_business",
        "cashbox_sessions",
        ["business_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )

    # 7. Audit log
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("impersonated_by", sa.UUID(), nullable=True),
        sa.Column("business_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=True),
        sa.Column("target_id", sa.String(), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["impersonated_by"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_business_id", "audit_logs", ["business_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    conn = op.get_bind()

    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_business_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("uq_cashbox_open_session_business", table_name="cashbox_sessions")

    # Back to one AI config per user: keep the row of the user who last saved it
    op.drop_constraint("uq_ai_settings_business", "ai_settings", type_="unique")
    conn.execute(
        sa.text(
            'UPDATE ai_settings a SET user_id = (SELECT u.id FROM "user" u '
            "WHERE u.business_id = a.business_id ORDER BY u.email LIMIT 1) WHERE a.user_id IS NULL"
        )
    )
    conn.execute(sa.text("DELETE FROM ai_settings WHERE user_id IS NULL"))
    op.drop_constraint("ai_settings_user_id_fkey", "ai_settings", type_="foreignkey")
    op.alter_column("ai_settings", "user_id", nullable=False)
    op.create_foreign_key(
        "ai_settings_user_id_fkey", "ai_settings", "user", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_unique_constraint("ai_settings_user_id_key", "ai_settings", ["user_id"])

    op.drop_constraint("uq_item_business_sku", "items", type_="unique")
    op.drop_index("ix_items_sku", table_name="items")
    op.create_index("ix_items_sku", "items", ["sku"], unique=True)

    op.drop_constraint("uq_category_business_name", "categories", type_="unique")
    op.create_unique_constraint("uq_category_name_user", "categories", ["name", "user_id"])

    for table in TENANT_TABLES + ["suppliers"]:
        op.drop_index(f"ix_{table}_business_id", table_name=table)
        op.drop_constraint(f"{table}_business_id_fkey", table, type_="foreignkey")
        op.drop_column(table, "business_id")
    op.drop_constraint("suppliers_user_id_fkey", "suppliers", type_="foreignkey")
    op.drop_column("suppliers", "user_id")

    op.drop_index("ix_user_business_id", table_name="user")
    op.drop_constraint("user_business_id_fkey", "user", type_="foreignkey")
    op.drop_column("user", "must_change_password")
    op.drop_column("user", "role")
    op.drop_column("user", "business_id")
    op.drop_column("user", "full_name")
    postgresql.ENUM(name="userrole").drop(conn, checkfirst=True)
    op.drop_table("businesses")
