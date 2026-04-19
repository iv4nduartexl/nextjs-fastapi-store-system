import enum

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, ForeignKey, Enum, Numeric, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from uuid import uuid4


class Base(DeclarativeBase):
    pass


class UnitType(str, enum.Enum):
    unit = "unit"
    kg = "kg"
    gram = "gram"
    liter = "liter"
    pack = "pack"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    other = "other"


class SaleStatus(str, enum.Enum):
    completed = "completed"
    cancelled = "cancelled"
    refunded = "refunded"


class User(SQLAlchemyBaseUserTableUUID, Base):
    username = Column(String, unique=True, nullable=True, index=True)
    items = relationship("Item", back_populates="user", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="user")


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
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    user = relationship("User", back_populates="items")
    sale_items = relationship("SaleItem", back_populates="item")


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

    sale_items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    user = relationship("User", back_populates="sales")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    sale_id = Column(UUID(as_uuid=True), ForeignKey("sales.id"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=True)
    item_name = Column(String, nullable=False)
    unit_type = Column(String, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Numeric(10, 3), nullable=False)
    subtotal = Column(Numeric(10, 2), nullable=False)

    sale = relationship("Sale", back_populates="sale_items")
    item = relationship("Item", back_populates="sale_items")
