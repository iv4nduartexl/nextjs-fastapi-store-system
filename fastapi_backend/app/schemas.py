import uuid
from datetime import datetime
from decimal import Decimal

from fastapi_users import schemas
from pydantic import BaseModel
from uuid import UUID

from app.models import (
    DiscountRuleScope,
    DiscountRuleType,
    PaymentMethod,
    PurchasePaymentMethod,
    PurchasePaymentStatus,
    PurchaseStatus,
    SaleStatus,
    UnitType,
)


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
    unit_price_override: Decimal | None = None
    manual_override_reason: str | None = None


class SaleCreate(BaseModel):
    items: list[SaleItemCreate]
    payment_method: PaymentMethod = PaymentMethod.cash
    amount_tendered: Decimal | None = None
    notes: str | None = None
    customer_id: UUID | None = None
    subtotal_override: Decimal | None = None
    subtotal_override_reason: str | None = None


class SaleItemRead(BaseModel):
    id: UUID
    item_id: UUID | None
    item_name: str
    unit_type: str
    base_unit_price: Decimal
    unit_price: Decimal
    quantity: Decimal
    subtotal: Decimal
    pricing_source: str | None = None
    discount_rule_name: str | None = None
    discount_amount: Decimal | None = None
    manual_override_reason: str | None = None

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


class QuantityDiscountRuleRead(BaseModel):
    id: UUID
    name: str
    scope: str
    item_id: UUID | None
    category: str | None
    is_active: bool
    priority: Decimal
    min_qty: Decimal
    rule_type: str
    percent_off: Decimal | None
    fixed_unit_price: Decimal | None
    buy_qty: Decimal | None
    free_qty: Decimal | None

    model_config = {"from_attributes": True}


class QuantityDiscountRuleCreate(BaseModel):
    name: str
    scope: DiscountRuleScope = DiscountRuleScope.item
    item_id: UUID | None = None
    category: str | None = None
    is_active: bool = True
    priority: Decimal = Decimal("100")
    min_qty: Decimal
    rule_type: DiscountRuleType
    percent_off: Decimal | None = None
    fixed_unit_price: Decimal | None = None
    buy_qty: Decimal | None = None
    free_qty: Decimal | None = None


class QuantityDiscountRuleUpdate(BaseModel):
    name: str | None = None
    scope: DiscountRuleScope | None = None
    item_id: UUID | None = None
    category: str | None = None
    is_active: bool | None = None
    priority: Decimal | None = None
    min_qty: Decimal | None = None
    rule_type: DiscountRuleType | None = None
    percent_off: Decimal | None = None
    fixed_unit_price: Decimal | None = None
    buy_qty: Decimal | None = None
    free_qty: Decimal | None = None


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
    total_outcomes: Decimal = Decimal("0")
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


class CustomerOutcomeCreate(BaseModel):
    amount: Decimal
    description: str
    outcome_date: datetime | None = None


class CustomerOutcomeRead(BaseModel):
    id: UUID
    amount: Decimal
    description: str
    outcome_date: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerDetailRead(CustomerRead):
    credit_sales: list[SaleRead] = []
    payments: list[CustomerPaymentRead] = []
    outcomes: list[CustomerOutcomeRead] = []

# --- Suppliers ---
class SupplierCreate(BaseModel):
    id: UUID | None = None
    name: str

    model_config = {"from_attributes": True}

class SupplierRead(BaseModel):
    id: UUID
    name: str

    model_config = {"from_attributes": True}

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
    overwrite_previous_value: bool = False


class PurchaseCreate(BaseModel):
    supplier: SupplierCreate | None = None
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
    supplier: SupplierRead| None
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


class CashboxSessionList(BaseModel):
    items: list[CashboxSessionRead]
    total: int
    page: int
    size: int
    pages: int

    model_config = {"from_attributes": True}


class CashboxManualTransaction(BaseModel):
    type: str  # "income" or "expense"
    amount: Decimal
    payment_method: str = "cash"
    description: str | None = None


# --- Analytics ---

class TopCategorySchema(BaseModel):
    name: str        # 👈 This fixes "CARNE" failing validation
    revenue: float

class AnalyticsSummarySchema(BaseModel):
    totalRevenue: float
    totalOrders: int
    avgOrderValue: float
    topCategory: TopCategorySchema | None


class CategoryStatSchema(BaseModel):
    category: str
    revenue: float
    quantity: int
    orderCount: int


class PaymentMethodStatSchema(BaseModel):
    method: str
    revenue: float
    count: int
    percentage: float


class TopProductSchema(BaseModel):
    itemId: str
    name: str
    revenue: float
    quantity: int
    orderCount: int
    category: str


class CustomerInsightSchema(BaseModel):
    customerId: str
    name: str
    totalSpent: float
    orderCount: int
    avgOrder: float
    lastOrder: str


class ProfitableProductSchema(BaseModel):
    itemId: str
    name: str
    category: str
    revenue: float
    cost: float
    profit: float
    margin: float
    quantity: int


class ProfitabilitySchema(BaseModel):
    totalRevenue: float
    totalCOGS: float
    grossProfit: float
    grossMarginPercent: float
    topProfitableProducts: list[ProfitableProductSchema]
    leastProfitableProducts: list[ProfitableProductSchema]


class TrendPointSchema(BaseModel):
    period: str
    revenue: float
    orders: int
    avgOrderValue: float


class RevenueTrendSchema(BaseModel):
    data: list[TrendPointSchema]


class DayOfWeekSchema(BaseModel):
    day: str
    revenue: float
    orders: int
    avgOrderValue: float


class SupplierSpendSchema(BaseModel):
    supplierId: str
    name: str
    totalSpend: float
    purchaseCount: int


class PurchasePaymentStatusSchema(BaseModel):
    status: str
    count: int
    total: float


class PurchaseAnalyticsSchema(BaseModel):
    totalSpend: float
    totalPurchases: int
    avgPurchaseValue: float
    bySupplier: list[SupplierSpendSchema]
    byPaymentStatus: list[PurchasePaymentStatusSchema]


class LowStockItemSchema(BaseModel):
    itemId: str
    name: str
    stock: float
    minStock: float | None
    category: str
    unitType: str


class DeadStockItemSchema(BaseModel):
    itemId: str
    name: str
    stock: float
    category: str
    lastSold: str | None


class InventoryAnalyticsSchema(BaseModel):
    totalInventoryValue: float
    totalItems: int
    lowStockItems: list[LowStockItemSchema]
    deadStockItems: list[DeadStockItemSchema]


class DiscountRuleStatSchema(BaseModel):
    ruleName: str
    usageCount: int
    totalDiscount: float


class DiscountAnalyticsSchema(BaseModel):
    totalDiscountAmount: float
    discountedSaleCount: int
    totalSalesCount: int
    discountRate: float
    byRule: list[DiscountRuleStatSchema]


class AdvancedCustomerSchema(BaseModel):
    customerId: str
    name: str
    totalSpent: float
    orderCount: int
    creditOwed: float


class CustomersAdvancedSchema(BaseModel):
    totalCustomers: int
    activeCustomers: int
    repeatCustomers: int
    repeatRate: float
    creditOutstanding: float
    topByValue: list[AdvancedCustomerSchema]


class CancellationAnalyticsSchema(BaseModel):
    cancelledCount: int
    cancelledRevenue: float
    refundedCount: int
    refundedRevenue: float
    totalLostRevenue: float
    refundRate: float


class CashboxTypeStatSchema(BaseModel):
    type: str
    direction: str
    amount: float
    count: int


class CashboxAnalyticsSchema(BaseModel):
    totalInflow: float
    totalOutflow: float
    netCashflow: float
    byType: list[CashboxTypeStatSchema]


class TimeBlockStatSchema(BaseModel):
    block: str
    label: str
    revenue: float
    orders: int
    percentage: float


class PeakTimesSchema(BaseModel):
    byTimeBlock: list[TimeBlockStatSchema]
    byDayOfWeek: list[dict]


class CategoryPairSchema(BaseModel):
    categoryA: str
    categoryB: str
    count: int
    percentage: float
    totalRevenue: float


class BasketAnalysisSchema(BaseModel):
    topPairs: list[CategoryPairSchema]
    totalBaskets: int
    avgItemsPerBasket: float

