"""Which API operations the chat assistant can use as tools, and how they are described to it.

Only operations listed here are exposed through MCP. Auth, user management and the chat
endpoints themselves are deliberately absent: exposing them made the model try to log in,
register or call itself.
"""
from fastapi import FastAPI
from fastapi.routing import APIRoute

PERIOD_HELP = (
    " `period` is one of 7d, 30d, 90d, 1y, all (default 30d); "
    "or pass start_date/end_date (ISO 8601) for a custom range."
)

# operation id -> description shown to the model
TOOL_DESCRIPTIONS: dict[str, str] = {
    # Lookups (use these first to get ids)
    "assistant-search_products": (
        "Find products by name, SKU or category words (e.g. 'coca 2l'). Returns id, price, stock and unit_type. "
        "For unit_type 'gram' the price is per kilogram and stock is in grams. "
        "Always use this to get product ids before creating sales or purchases."
    ),
    "assistant-search_customers": (
        "Find customers by name, phone or ID number. Returns id, current credit balance (what they owe) "
        "and credit_limit (null = unlimited)."
    ),
    "assistant-product_details": (
        "Details for one product: stock, price, last purchase unit cost, and units/revenue sold in the last 30 days."
    ),
    "assistant-store_snapshot": (
        "Today's overview: sales total/count by payment method, whether the cashbox is open and the expected "
        "cash in it, low-stock products and customers over their credit limit. Pass tz (IANA timezone). "
        "Use this for questions like 'how did we do today?'."
    ),
    "suppliers-search_suppliers": "Find suppliers by name prefix. Returns id and name.",
    "categories-search_categories": "List product category names, optionally filtered by prefix.",
    "customers-get_customer": (
        "Full customer account: contact data, balance, credit sales, payments and other charges."
    ),
    # Sales
    "sales-list_sales": (
        "List sales, newest first, paginated (page, size). Optional status filter: completed, cancelled, refunded."
    ),
    "sales-get_sale": "One sale with its product lines, totals, payment method and status.",
    "sales-create_sale": (
        "Register a sale (needs user approval). Get item ids from search_products first. "
        "Quantity is in grams for gram products. Credit sales need customer_id. "
        "Prices come from the catalog unless the user explicitly asks for another price."
    ),
    "sales-cancel_sale": (
        "Cancel (undo) a sale (needs user approval): restores stock and reverses its cashbox entry. "
        "Optional body {reason}."
    ),
    # Purchases
    "purchases-list_purchases": (
        "List purchases from suppliers, newest first, paginated. Filters: q (supplier or reference), "
        "payment_status (paid, unpaid, partial), status (received, partial, cancelled)."
    ),
    "purchases-get_purchase": "One purchase with its lines, costs, supplier and payment status.",
    "purchases-create_purchase": (
        "Register stock received from a supplier (needs user approval). Adds the quantities to stock. "
        "Lines without item_id create new products. total_cost_price is the total for the line."
    ),
    "purchases-cancel_purchase": (
        "Cancel (undo) a purchase (needs user approval): removes the stock again and reverses its cashbox entry. "
        "Body {reason, force}; it fails with negative_stock unless force=true when units were already sold."
    ),
    # Customers
    "customers-create_customer": "Create a customer (needs user approval). Only name is required.",
    "customers-update_customer": "Update a customer's contact data or credit limit (needs user approval).",
    "customers-record_payment": (
        "Record a payment a customer makes towards their credit balance (needs user approval)."
    ),
    # Cashbox
    "cashbox-get_current_session": (
        "The open cashbox session with opening amount, cash in/out and expected cash balance. 404 if none is open."
    ),
    "cashbox-list_transactions": "Recent cashbox movements, optionally for one session_id.",
    "cashbox-open_session": "Open the cashbox with an opening cash amount (needs user approval).",
    "cashbox-close_session": (
        "Close the open cashbox session with the cash actually counted (needs user approval)."
    ),
    "cashbox-add_manual_transaction": (
        "Record a manual cash income or expense in the open session (needs user approval)."
    ),
    # Products
    "item-create_item": (
        "Create a product (needs user approval). unit_type: unit, gram (price per kg, stock in grams), liter or pack."
    ),
    "item-update_item": (
        "Change a product's name, price, stock, min_stock, category or SKU (needs user approval). "
        "Get the id from search_products."
    ),
    # Analytics
    "sales-analytics_summary": "Revenue, sales count, average ticket and top category." + PERIOD_HELP,
    "sales-analytics_top_products": "Best-selling products by revenue and quantity." + PERIOD_HELP,
    "sales-analytics_by_category": "Revenue per product category." + PERIOD_HELP,
    "sales-analytics_by_payment_method": "Revenue per payment method." + PERIOD_HELP,
    "sales-analytics_profitability": "Revenue, cost of goods sold and gross margin, plus the most and least profitable products." + PERIOD_HELP,
    "sales-analytics_revenue_trend": "Revenue over time, one point per date." + PERIOD_HELP,
    "sales-analytics_inventory": "Inventory value, low-stock products and products with no recent sales.",
    "sales-analytics_cashbox": "Cash inflow/outflow totals by movement type." + PERIOD_HELP,
}

# Operations that change data; the chat asks the user to approve these before running them
WRITE_OPERATIONS: set[str] = {
    "sales-create_sale",
    "sales-cancel_sale",
    "purchases-create_purchase",
    "purchases-cancel_purchase",
    "customers-create_customer",
    "customers-update_customer",
    "customers-record_payment",
    "cashbox-open_session",
    "cashbox-close_session",
    "cashbox-add_manual_transaction",
    "item-create_item",
    "item-update_item",
}

# Owner-only endpoints (require_owner); not offered to cashiers in the chat
OWNER_ONLY_OPERATIONS: set[str] = {
    "sales-cancel_sale",
    "purchases-cancel_purchase",
    *(op for op in TOOL_DESCRIPTIONS if op.startswith("sales-analytics_")),
}

ALLOWED_OPERATIONS: list[str] = list(TOOL_DESCRIPTIONS)


def apply_tool_descriptions(app: FastAPI) -> None:
    """Attach the assistant-facing descriptions to the routes before the OpenAPI schema is built."""
    found = set()
    for route in app.routes:
        if isinstance(route, APIRoute) and route.operation_id is None:
            op_id = route.unique_id
        elif isinstance(route, APIRoute):
            op_id = route.operation_id
        else:
            continue
        if op_id in TOOL_DESCRIPTIONS:
            route.description = TOOL_DESCRIPTIONS[op_id]
            found.add(op_id)
    missing = set(TOOL_DESCRIPTIONS) - found
    if missing:
        raise RuntimeError(f"MCP tool allowlist references unknown operations: {sorted(missing)}")
