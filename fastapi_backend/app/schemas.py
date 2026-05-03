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
    is_deleted: bool = False

    model_config = {"from_attributes": True}


class ItemUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sku: str | None = None
    category: str | None = None
    unit_type: UnitType | None = None
    stock: Decimal | None = None
    min_stock: Decimal | None = None
    price: Decimal | None = None


# --- Sales ---


class SaleItemCreate(BaseModel):
    item_id: UUID
    quantity: Decimal


class SaleCreate(BaseModel):
    items: list[SaleItemCreate]
    payment_method: PaymentMethod = PaymentMethod.cash
    amount_tendered: Decimal | None = None
    notes: str | None = None
    customer_id: UUID | None = None


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
    customer_id: UUID | None = None
    customer_name: str | None = None
    sale_items: list[SaleItemRead]

    model_config = {"from_attributes": True}


# --- Customers ---


class CustomerCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    id_number: str | None = None
    credit_limit: Decimal | None = None
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    id_number: str | None = None
    credit_limit: Decimal | None = None
    notes: str | None = None
    is_active: bool | None = None


class CustomerRead(BaseModel):
    id: UUID
    name: str
    phone: str | None
    email: str | None
    address: str | None
    id_number: str | None
    credit_limit: Decimal | None
    notes: str | None
    is_active: bool
    created_at: datetime
    total_credit: Decimal = Decimal("0")
    total_paid: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")

    model_config = {"from_attributes": True}


class CustomerPage(BaseModel):
    items: list[CustomerRead]
    total: int
    page: int
    size: int
    pages: int


class CustomerPaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str = "cash"
    payment_date: datetime | None = None
    notes: str | None = None


class CustomerPaymentRead(BaseModel):
    id: UUID
    amount: Decimal
    payment_method: str
    payment_date: datetime
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerDetailRead(CustomerRead):
    credit_sales: list[SaleRead] = []
    payments: list[CustomerPaymentRead] = []


# --- Purchases ---


class PurchaseItemCreate(BaseModel):
    item_id: UUID | None = None
    item_name: str
    unit_type: str = "unit"
    quantity: Decimal
    total_cost_price: Decimal
    sku: str | None = None
    category: str | None = None
    sell_price: Decimal | None = None
    overwrite_sell_price: bool = False


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


class CashboxTransactionRead(BaseModel):
    id: UUID
    session_id: UUID | None
    type: str
    direction: str
    amount: Decimal
    payment_method: str
    reference_type: str | None
    reference_id: UUID | None
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CashboxSessionCreate(BaseModel):
    opening_amount: Decimal = Decimal("0")
    notes: str | None = None


class CashboxSessionClose(BaseModel):
    closing_amount_counted: Decimal
    notes: str | None = None


class CashboxSessionRead(BaseModel):
    id: UUID
    opening_amount: Decimal
    status: str
    opened_at: datetime
    closed_at: datetime | None
    closing_amount_counted: Decimal | None
    notes: str | None
    created_at: datetime
    # Computed
    cash_in: Decimal = Decimal("0")
    cash_out: Decimal = Decimal("0")
    card_in: Decimal = Decimal("0")
    transfer_in: Decimal = Decimal("0")
    credit_sales: Decimal = Decimal("0")
    owner_withdrawals: Decimal = Decimal("0")
    expected_cash_balance: Decimal = Decimal("0")
    difference: Decimal | None = None
    transaction_count: int = 0

    model_config = {"from_attributes": True}


class CashboxManualTransaction(BaseModel):
    type: str  # "income" or "expense"
    amount: Decimal
    payment_method: str = "cash"
    description: str | None = None

