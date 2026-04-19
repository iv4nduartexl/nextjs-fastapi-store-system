import uuid
from datetime import datetime
from decimal import Decimal

from fastapi_users import schemas
from pydantic import BaseModel
from uuid import UUID

from app.models import UnitType, PaymentMethod, SaleStatus, PurchaseStatus, PurchasePaymentStatus, PurchasePaymentMethod


class UserRead(schemas.BaseUser[uuid.UUID]):
    username: str | None = None


class UserCreate(schemas.BaseUserCreate):
    username: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    username: str | None = None


class ItemBase(BaseModel):
    name: str
    description: str | None = None
    sku: str | None = None
    category: str | None = None
    unit_type: UnitType = UnitType.unit
    stock: Decimal = Decimal("0")
    min_stock: Decimal | None = None
    price: Decimal | None = None


class ItemCreate(ItemBase):
    pass


class ItemRead(ItemBase):
    id: UUID
    user_id: UUID

    model_config = {"from_attributes": True}


# --- Sales ---


class SaleItemCreate(BaseModel):
    item_id: UUID
    quantity: Decimal


class SaleCreate(BaseModel):
    items: list[SaleItemCreate]
    payment_method: PaymentMethod = PaymentMethod.cash
    amount_tendered: Decimal | None = None
    notes: str | None = None


class SaleItemRead(BaseModel):
    id: UUID
    item_id: UUID | None
    item_name: str
    unit_type: str
    unit_price: Decimal
    quantity: Decimal
    subtotal: Decimal

    model_config = {"from_attributes": True}


class SaleRead(BaseModel):
    id: UUID
    created_at: datetime
    total: Decimal
    status: SaleStatus
    payment_method: PaymentMethod
    amount_tendered: Decimal | None
    change_given: Decimal | None
    notes: str | None
    sale_items: list[SaleItemRead]

    model_config = {"from_attributes": True}


# --- Purchases ---


class PurchaseItemCreate(BaseModel):
    item_id: UUID | None = None
    item_name: str
    unit_type: str = "unit"
    quantity: Decimal
    cost_price: Decimal
    sku: str | None = None
    category: str | None = None


class PurchaseCreate(BaseModel):
    supplier_name: str | None = None
    reference_number: str | None = None
    purchase_date: datetime | None = None
    payment_method: PurchasePaymentMethod = PurchasePaymentMethod.cash
    payment_status: PurchasePaymentStatus = PurchasePaymentStatus.paid
    tax: Decimal = Decimal("0")
    notes: str | None = None
    items: list[PurchaseItemCreate]


class PurchaseItemRead(BaseModel):
    id: UUID
    item_id: UUID | None
    item_name: str
    unit_type: str
    quantity: Decimal
    cost_price: Decimal
    subtotal: Decimal

    model_config = {"from_attributes": True}


class PurchaseRead(BaseModel):
    id: UUID
    supplier_name: str | None
    reference_number: str | None
    purchase_date: datetime
    created_at: datetime
    status: PurchaseStatus
    payment_status: PurchasePaymentStatus
    payment_method: PurchasePaymentMethod
    subtotal: Decimal
    tax: Decimal
    total_cost: Decimal
    notes: str | None
    purchase_items: list[PurchaseItemRead]

    model_config = {"from_attributes": True}
