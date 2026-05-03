import enum

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, ForeignKey, Enum, Numeric, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from uuid import uuid4


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


class User(SQLAlchemyBaseUserTableUUID, Base):
    username = Column(String, unique=True, nullable=True, index=True)
    items = relationship("Item", back_populates="user", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="user")
    purchases = relationship("Purchase", back_populates="user")
    customers = relationship("Customer", back_populates="user")


class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    from sqlalchemy import UniqueConstraint
    __table_args__ = (UniqueConstraint("name", "user_id", name="uq_category_name_user"),)


class Item(Base):
    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    sku = Column(String, nullable=True, unique=True, index=True)
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


class Sale(Base):
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

    sale_items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    user = relationship("User", back_populates="sales")
    customer = relationship("Customer", back_populates="sales")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.id"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=True)
    item_name = Column(String, nullable=False)
    unit_type = Column(Enum(UnitType), nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Numeric(10, 3), nullable=False)
    subtotal = Column(Numeric(10, 2), nullable=False)

    sale = relationship("Sale", back_populates="sale_items")
    item = relationship("Item", back_populates="sale_items")


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)
    supplier_name = Column(String, nullable=True)
    reference_number = Column(String, nullable=True)
    purchase_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(Enum(PurchaseStatus), nullable=False, default=PurchaseStatus.received)
    payment_status = Column(Enum(PurchasePaymentStatus), nullable=False, default=PurchasePaymentStatus.paid)
    payment_method = Column(Enum(PurchasePaymentMethod), nullable=False, default=PurchasePaymentMethod.cash)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax = Column(Numeric(12, 2), nullable=False, default=0)
    total_cost = Column(Numeric(12, 2), nullable=False, default=0)
    notes = Column(String, nullable=True)

    purchase_items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")
    user = relationship("User", back_populates="purchases")


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


class Customer(Base):
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


class CustomerPayment(Base):
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
    user = relationship("User")


class CustomerOutcome(Base):
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


class CashboxTransactionDirection(str, enum.Enum):
    in_ = "in"
    out = "out"


class CashboxSession(Base):
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

    user = relationship("User")
    transactions = relationship("CashboxTransaction", back_populates="session", cascade="all, delete-orphan")


class CashboxTransaction(Base):
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
    user = relationship("User")
