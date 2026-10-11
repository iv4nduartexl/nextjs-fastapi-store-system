import enum

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import BigInteger, Column, Integer, String, ForeignKey, Enum, Identity, Index, Numeric, DateTime, Boolean, Text, UniqueConstraint, text
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import declared_attr, relationship
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func
from uuid import uuid4


def _loaded_user_name(obj, attribute: str) -> str | None:
    """Display name of a related user, without triggering a lazy load (unsafe in async code)."""
    if attribute in sa_inspect(obj).unloaded:
        return None
    user = getattr(obj, attribute)
    if user is None:
        return None
    return user.full_name or user.username or user.email


class Base(DeclarativeBase):
    pass


class UnitType(str, enum.Enum):
    unit = "unit"
    gram = "gram"
    liter = "liter"
    pack = "pack"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    other = "other"
    credit = "credit"
    internal = "internal"


class SaleStatus(str, enum.Enum):
    completed = "completed"
    cancelled = "cancelled"
    refunded = "refunded"


class PricingSource(str, enum.Enum):
    base = "base"
    quantity_discount = "quantity_discount"
    manual_override = "manual_override"


class DiscountRuleScope(str, enum.Enum):
    global_scope = "global"
    item = "item"
    category = "category"


class DiscountRuleType(str, enum.Enum):
    percent = "percent"
    fixed_price = "fixed_price"
    buy_x_get_y = "buy_x_get_y"


class PurchaseStatus(str, enum.Enum):
    received = "received"
    partial = "partial"
    cancelled = "cancelled"


class PurchasePaymentStatus(str, enum.Enum):
    paid = "paid"
    unpaid = "unpaid"
    partial = "partial"


class PurchasePaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    transfer = "transfer"
    credit = "credit"


class UserRole(str, enum.Enum):
    owner = "owner"
    cashier = "cashier"


class Business(Base):
    """A store using the system. All business data is scoped to one business."""

    __tablename__ = "businesses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    currency_symbol = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    users = relationship("User", back_populates="business")


class TenantMixin:
    """Marks a table as business-owned: rows are only visible inside their business (see app/tenancy.py)."""

    @declared_attr
    def business_id(cls):
        return Column(UUID(as_uuid=True), ForeignKey("businesses.id"), nullable=False, index=True)


class User(SQLAlchemyBaseUserTableUUID, Base):
    username = Column(String, unique=True, nullable=True, index=True)
    full_name = Column(String, nullable=True)
    # Null only for the platform superuser, who belongs to no business
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.id"), nullable=True, index=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.owner, server_default="owner")
    must_change_password = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    # Bumped to sign out every existing session (password reset/change, deactivation, role change)
    token_version = Column(Integer, nullable=False, default=0, server_default=text("0"))
    business = relationship("Business", back_populates="users")
    items = relationship("Item", back_populates="user", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="user", foreign_keys="Sale.user_id")
    purchases = relationship("Purchase", back_populates="user", foreign_keys="Purchase.user_id")
    customers = relationship("Customer", back_populates="user")


class Category(TenantMixin, Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    __table_args__ = (UniqueConstraint("business_id", "name", name="uq_category_business_name"),)


class Item(TenantMixin, Base):
    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    # Unique per business (uq_item_business_sku), not globally
    sku = Column(String, nullable=True, index=True)
    category = Column(String, nullable=True)
    unit_type = Column(Enum(UnitType), nullable=False, default=UnitType.unit)
    stock = Column(Numeric(10, 3), nullable=False, default=0)
    min_stock = Column(Numeric(10, 3), nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="items")
    sale_items = relationship("SaleItem", back_populates="item")
    purchase_items = relationship("PurchaseItem", back_populates="item")

    __table_args__ = (UniqueConstraint("business_id", "sku", name="uq_item_business_sku"),)


class Sale(TenantMixin, Base):
    __tablename__ = "sales"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    total = Column(Numeric(10, 2), nullable=False)
    status = Column(Enum(SaleStatus), nullable=False, default=SaleStatus.completed)
    payment_method = Column(Enum(PaymentMethod), nullable=False, default=PaymentMethod.cash)
    amount_tendered = Column(Numeric(10, 2), nullable=True)
    change_given = Column(Numeric(10, 2), nullable=True)
    notes = Column(String, nullable=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    # Sent by the register for each checkout so a repeated submit returns the same sale
    request_id = Column(String, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    cancel_reason = Column(String, nullable=True)

    sale_items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    # Eager (joined) so "who did it" names are always available without extra queries
    user = relationship("User", back_populates="sales", foreign_keys=[user_id], lazy="joined")
    cancelled_by_user = relationship("User", foreign_keys=[cancelled_by], lazy="joined")

    @property
    def user_name(self) -> str | None:
        return _loaded_user_name(self, "user")

    @property
    def cancelled_by_name(self) -> str | None:
        return _loaded_user_name(self, "cancelled_by_user")

    customer = relationship("Customer", back_populates="sales")

    __table_args__ = (UniqueConstraint("business_id", "request_id", name="uq_sale_business_request"),)


class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.id"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=True)
    item_name = Column(String, nullable=False)
    unit_type = Column(Enum(UnitType), nullable=False)
    base_unit_price = Column(Numeric(10, 2), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Numeric(10, 3), nullable=False)
    subtotal = Column(Numeric(10, 2), nullable=False)
    pricing_source = Column(Enum(PricingSource), nullable=False, default=PricingSource.base)
    discount_rule_name = Column(String, nullable=True)
    discount_amount = Column(Numeric(10, 2), nullable=False, default=0)
    manual_override_reason = Column(String, nullable=True)
    manual_overridden_by = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    manual_overridden_at = Column(DateTime(timezone=True), nullable=True)

    sale = relationship("Sale", back_populates="sale_items")
    item = relationship("Item", back_populates="sale_items")


class SalePriceChangeLog(TenantMixin, Base):
    __tablename__ = "sale_price_change_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.id", ondelete="CASCADE"), nullable=False)
    sale_item_id = Column(UUID(as_uuid=True), ForeignKey("sale_items.id", ondelete="CASCADE"), nullable=True)
    change_scope = Column(String, nullable=False)  # item | subtotal
    source = Column(String, nullable=False)  # manual | system_discount
    old_value = Column(Numeric(12, 2), nullable=False)
    new_value = Column(Numeric(12, 2), nullable=False)
    reason = Column(String, nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class QuantityDiscountRule(TenantMixin, Base):
    __tablename__ = "quantity_discount_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    priority = Column(Numeric(6, 0), nullable=False, default=100)
    scope = Column(Enum(DiscountRuleScope), nullable=False, default=DiscountRuleScope.global_scope)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=True)
    category = Column(String, nullable=True)
    min_qty = Column(Numeric(10, 3), nullable=False, default=1)
    rule_type = Column(Enum(DiscountRuleType), nullable=False)
    percent_off = Column(Numeric(5, 2), nullable=True)
    fixed_unit_price = Column(Numeric(10, 2), nullable=True)
    buy_qty = Column(Numeric(10, 3), nullable=True)
    free_qty = Column(Numeric(10, 3), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class Supplier(TenantMixin, Base):
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    # Who created it (suppliers had no owner before businesses existed)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)

    purchases = relationship("Purchase", back_populates="supplier")

class Purchase(TenantMixin, Base):
    __tablename__ = "purchases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id"), nullable=True)
    reference_number = Column(String, nullable=True)
    purchase_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(Enum(PurchaseStatus), nullable=False, default=PurchaseStatus.received)
    payment_status = Column(Enum(PurchasePaymentStatus), nullable=False, default=PurchasePaymentStatus.paid)
    payment_method = Column(Enum(PurchasePaymentMethod), nullable=False, default=PurchasePaymentMethod.cash)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax = Column(Numeric(12, 2), nullable=False, default=0)
    total_cost = Column(Numeric(12, 2), nullable=False, default=0)
    # What was actually paid now (total for "paid", 0 for "unpaid", the given amount for "partial")
    paid_amount = Column(Numeric(12, 2), nullable=True)
    # Total printed on the supplier's invoice (optional, for checking)
    invoice_total = Column(Numeric(12, 2), nullable=True)
    notes = Column(String, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=True)
    cancel_reason = Column(String, nullable=True)

    purchase_items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")
    user = relationship("User", back_populates="purchases", foreign_keys=[user_id], lazy="joined")
    cancelled_by_user = relationship("User", foreign_keys=[cancelled_by], lazy="joined")

    @property
    def user_name(self) -> str | None:
        return _loaded_user_name(self, "user")

    @property
    def cancelled_by_name(self) -> str | None:
        return _loaded_user_name(self, "cancelled_by_user")
    supplier = relationship("Supplier", back_populates="purchases")

class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    purchase_id = Column(UUID(as_uuid=True), ForeignKey("purchases.id"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=True)
    item_name = Column(String, nullable=False)
    unit_type = Column(Enum(UnitType), nullable=False, default=UnitType.unit)
    quantity = Column(Numeric(12, 3), nullable=False)
    cost_price = Column(Numeric(12, 2), nullable=False)
    subtotal = Column(Numeric(12, 2), nullable=False)

    purchase = relationship("Purchase", back_populates="purchase_items")
    item = relationship("Item", back_populates="purchase_items")


class Customer(TenantMixin, Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    id_number = Column(String, nullable=True)  # Cédula / RUC
    credit_limit = Column(Numeric(12, 2), nullable=True)  # NULL = unlimited
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="customers")
    sales = relationship("Sale", back_populates="customer")
    credit_payments = relationship("CustomerPayment", back_populates="customer", cascade="all, delete-orphan")
    custom_outcomes = relationship("CustomerOutcome", back_populates="customer", cascade="all, delete-orphan")


class CustomerPayment(TenantMixin, Base):
    __tablename__ = "customer_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String, nullable=False, default="cash")  # cash / card / transfer
    payment_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    customer = relationship("Customer", back_populates="credit_payments")
    user = relationship("User", lazy="joined")

    @property
    def user_name(self) -> str | None:
        return _loaded_user_name(self, "user")


class CustomerOutcome(TenantMixin, Base):
    __tablename__ = "customer_outcomes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(String, nullable=False)
    outcome_date = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    customer = relationship("Customer", back_populates="custom_outcomes")
    user = relationship("User")


class CashboxSessionStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class CashboxTransactionType(str, enum.Enum):
    sale = "sale"
    purchase = "purchase"
    income = "income"
    expense = "expense"
    customer_payment = "customer_payment"
    opening = "opening"
    owner_withdrawal = "owner_withdrawal"
    # Reversal entries written when a sale or purchase is cancelled
    sale_cancel = "sale_cancel"
    purchase_cancel = "purchase_cancel"


class CashboxTransactionDirection(str, enum.Enum):
    in_ = "in"
    out = "out"


class CashboxSession(TenantMixin, Base):
    __tablename__ = "cashbox_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    opening_amount = Column(Numeric(14, 2), nullable=False, default=0)
    status = Column(Enum(CashboxSessionStatus), nullable=False, default=CashboxSessionStatus.open)
    opened_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    closing_amount_counted = Column(Numeric(14, 2), nullable=True)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # One shared cashbox per business: at most one open session
    __table_args__ = (
        Index(
            "uq_cashbox_open_session_business",
            "business_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    user = relationship("User")
    transactions = relationship("CashboxTransaction", back_populates="session", cascade="all, delete-orphan")


class CashboxTransaction(TenantMixin, Base):
    __tablename__ = "cashbox_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("cashbox_sessions.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    type = Column(Enum(CashboxTransactionType), nullable=False)
    direction = Column(Enum(CashboxTransactionDirection, values_callable=lambda x: [e.value for e in x]), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_method = Column(String, nullable=False, default="cash")
    reference_type = Column(String, nullable=True)
    reference_id = Column(UUID(as_uuid=True), nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("CashboxSession", back_populates="transactions")
    user = relationship("User", lazy="joined")

    @property
    def user_name(self) -> str | None:
        return _loaded_user_name(self, "user")


class AISettings(TenantMixin, Base):
    """Per-business AI provider configuration for the chat assistant (OpenAI-compatible APIs)."""

    __tablename__ = "ai_settings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    # Last user who changed the settings
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    provider = Column(String, nullable=False, default="openrouter")
    base_url = Column(String, nullable=False)
    model = Column(String, nullable=False)
    api_key_encrypted = Column(Text, nullable=True)
    temperature = Column(Numeric(3, 2), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("business_id", name="uq_ai_settings_business"),)


class ChatConversation(TenantMixin, Base):
    __tablename__ = "chat_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    messages = relationship(
        "ChatMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ChatMessage.seq",
    )


class ChatMessage(Base):
    """One chat message.

    Roles: user / assistant / tool follow the OpenAI chat format and are replayed to the model.
    "action" rows are approval requests for write operations; they are shown in the UI but never
    sent to the model.
    """

    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    # Insertion order (created_at is identical for rows written in the same transaction)
    seq = Column(BigInteger, Identity(), nullable=False)
    conversation_id = Column(
        UUID(as_uuid=True), ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    tool_calls = Column(JSONB, nullable=True)
    tool_call_id = Column(String, nullable=True)
    pending_action = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation = relationship("ChatConversation", back_populates="messages")


class AuditLog(Base):
    """Security-relevant actions: admin changes, password resets, impersonation, cancellations."""

    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    # Set when the actor was a superuser acting as another user
    impersonated_by = Column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class LoginAttempt(Base):
    """Failed sign-in attempts, used to throttle password guessing (see app/login_limits.py)."""

    __tablename__ = "login_attempts"

    id = Column(BigInteger, Identity(), primary_key=True)
    email = Column(String, nullable=False, index=True)
    ip = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
