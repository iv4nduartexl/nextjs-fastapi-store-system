import uuid
from datetime import datetime
from decimal import Decimal

from fastapi_users import schemas
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field
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
    full_name: str | None = None
    # Read-only here: UserCreate/UserUpdate deliberately don't accept these
    business_id: uuid.UUID | None = None
    role: str | None = None
    must_change_password: bool = False


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
    item_id: UUID = Field(description="Product id (look it up with search_products; never invent it)")
    quantity: Decimal = Field(
        description="Amount sold. Units for unit/pack/liter products; GRAMS for products with unit_type 'gram' (e.g. 500 = half a kilo)"
    )
    unit_price_override: Decimal | None = Field(
        None, description="Only when the user explicitly asks for a different price (per kg for gram products)"
    )
    manual_override_reason: str | None = Field(None, description="Required when unit_price_override is set")


class SaleCreate(BaseModel):
    items: list[SaleItemCreate] = Field(description="At least one product line")
    payment_method: PaymentMethod = Field(
        PaymentMethod.cash,
        description="cash, card, other (transfer), credit (customer pays later; requires customer_id) or internal (owner takes goods)",
    )
    amount_tendered: Decimal | None = Field(None, description="Cash handed over by the customer, to compute change")
    notes: str | None = None
    customer_id: UUID | None = Field(None, description="Customer id from search_customers; required for credit sales")
    subtotal_override: Decimal | None = Field(None, description="Only when the user asks to charge a different total")
    subtotal_override_reason: str | None = Field(None, description="Required when subtotal_override is set")


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
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    user_id: UUID | None = None
    # Who made / cancelled it (display names)
    user_name: str | None = None
    cancelled_by_name: str | None = None
    sale_items: list[SaleItemRead]

    model_config = {"from_attributes": True}


class SaleCancelRequest(BaseModel):
    reason: str | None = None


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
    amount: Decimal = Field(description="Amount the customer pays towards their credit balance")
    payment_method: str = Field("cash", description="cash, card or transfer")
    payment_date: datetime | None = None
    notes: str | None = None


class CustomerPaymentRead(BaseModel):
    id: UUID
    amount: Decimal
    payment_method: str
    payment_date: datetime
    notes: str | None
    created_at: datetime
    user_name: str | None = None

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
    item_id: UUID | None = Field(
        None, description="Existing product id from search_products; omit to create a new product with item_name"
    )
    item_name: str = Field(description="Product name (always required)")
    unit_type: str = Field("unit", description="unit, gram, liter or pack")
    quantity: Decimal = Field(description="Amount received (grams for gram products)")
    total_cost_price: Decimal = Field(description="Total paid for this whole line, not the unit cost")
    sku: str | None = None
    category: str | None = None
    sell_price: Decimal | None = Field(None, description="New selling price (per kg for gram products), if the user gives one")
    overwrite_previous_value: bool = Field(
        False, description="True to replace the product's existing price/SKU/category with the values given here"
    )


class PurchaseCreate(BaseModel):
    supplier: SupplierCreate | None = Field(
        None, description="Supplier {id, name}; use search_suppliers for the id, or just a name to create one"
    )
    reference_number: str | None = Field(None, description="Invoice / receipt number")
    purchase_date: datetime | None = Field(None, description="Defaults to now")
    payment_method: PurchasePaymentMethod = Field(PurchasePaymentMethod.cash, description="cash, card, transfer or credit")
    payment_status: PurchasePaymentStatus = Field(
        PurchasePaymentStatus.paid, description="paid (recorded in the cashbox), unpaid or partial"
    )
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
    cancelled_at: datetime | None = None
    cancel_reason: str | None = None
    user_id: UUID | None = None
    user_name: str | None = None
    cancelled_by_name: str | None = None
    purchase_items: list[PurchaseItemRead]

    model_config = {"from_attributes": True}


class PurchaseCancelRequest(BaseModel):
    reason: str | None = None
    # Allow the cancel even if it leaves some products with negative stock
    force: bool = False


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
    user_id: UUID | None = None
    user_name: str | None = None

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
    type: str = Field(description="'income' (money in) or 'expense' (money out)")
    amount: Decimal = Field(description="Positive amount")
    payment_method: str = Field("cash", description="cash, card or transfer")
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


# --- AI settings ---


class AIProviderPreset(BaseModel):
    id: str
    label: str
    base_url: str
    default_model: str
    requires_key: bool


class AISettingsRead(BaseModel):
    provider: str
    base_url: str
    model: str
    temperature: float | None = None
    has_api_key: bool
    api_key_hint: str | None = None
    # False when the user has no saved settings and the server defaults are in use
    is_custom: bool
    presets: list[AIProviderPreset]


class AISettingsUpdate(BaseModel):
    provider: str
    base_url: str
    model: str
    temperature: float | None = Field(None, ge=0, le=2)
    # Empty/omitted keeps the stored key
    api_key: str | None = None
    clear_api_key: bool = False


class AISettingsTestRequest(BaseModel):
    # All optional: missing values fall back to the saved settings
    provider: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None


class AISettingsTestResult(BaseModel):
    ok: bool
    error: str | None = None
    detail: str | None = None


class AIModelList(BaseModel):
    models: list[str]
    error: str | None = None
    detail: str | None = None


# --- Chat ---


class ChatMessageRead(BaseModel):
    id: UUID
    role: str
    content: str | None
    pending_action: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatConversationRead(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ChatConversationDetail(ChatConversationRead):
    messages: list[ChatMessageRead]


class ChatConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: UUID | None = None
    locale: str = "en"
    timezone: str | None = None
    currency_symbol: str | None = None


class ChatExecuteRequest(BaseModel):
    conversation_id: UUID
    action_message_id: UUID
    approved: bool
    locale: str = "en"
    timezone: str | None = None
    currency_symbol: str | None = None


class ChatResponse(BaseModel):
    conversation_id: UUID
    # Only messages meant for display (user, assistant text, approval requests)
    messages: list[ChatMessageRead]
    error: Literal[
        "no_api_key",
        "invalid_api_key",
        "model_not_found",
        "rate_limited",
        "timeout",
        "connection_error",
        "bad_request",
        "provider_error",
        "too_many_steps",
    ] | None = None
    error_detail: str | None = None


# --- Account, team and admin ---


class MeRead(BaseModel):
    id: UUID
    email: str
    username: str | None
    full_name: str | None
    role: str
    is_superuser: bool
    must_change_password: bool
    business_id: UUID | None
    business_name: str | None
    # Set while the superuser is viewing the app as this user
    impersonated_by: UUID | None = None
    impersonator_email: str | None = None


class MeUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=120)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ChangePasswordResponse(BaseModel):
    # New session token: the old ones stop working after a password change
    access_token: str
    token_type: str = "bearer"


class BusinessRead(BaseModel):
    id: UUID
    name: str
    is_active: bool
    currency_symbol: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BusinessUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class TeamUserRead(BaseModel):
    id: UUID
    email: str
    username: str | None
    full_name: str | None
    role: str
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None = None

    model_config = {"from_attributes": True}


class TeamUserCreate(BaseModel):
    email: EmailStr
    username: str | None = Field(None, max_length=60)
    full_name: str | None = Field(None, max_length=120)
    role: Literal["owner", "cashier"] = "cashier"


class TeamUserUpdate(BaseModel):
    role: Literal["owner", "cashier"] | None = None
    is_active: bool | None = None
    full_name: str | None = Field(None, max_length=120)


class TemporaryPasswordResponse(BaseModel):
    user_id: UUID
    email: str
    # Shown once; the user must change it on first login
    temporary_password: str


class AdminBusinessRead(BusinessRead):
    user_count: int = 0
    sales_count: int = 0
    last_activity_at: datetime | None = None


class AdminBusinessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    owner_email: EmailStr
    owner_username: str | None = Field(None, max_length=60)
    owner_full_name: str | None = Field(None, max_length=120)


class AdminBusinessUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    is_active: bool | None = None


class AdminBusinessCreated(BaseModel):
    business: AdminBusinessRead
    owner: TemporaryPasswordResponse


class AdminUserRead(TeamUserRead):
    is_superuser: bool
    business_id: UUID | None
    business_name: str | None = None


class AdminUserCreate(TeamUserCreate):
    business_id: UUID


class AdminUserUpdate(TeamUserUpdate):
    business_id: UUID | None = None


class ImpersonationResponse(BaseModel):
    access_token: str
    expires_in: int
    user: AdminUserRead


class AuditLogRead(BaseModel):
    id: UUID
    action: str
    actor_user_id: UUID | None
    actor_name: str | None = None
    impersonated_by: UUID | None
    impersonator_name: str | None = None
    business_id: UUID | None
    business_name: str | None = None
    target_type: str | None
    target_id: str | None
    details: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogPage(BaseModel):
    items: list[AuditLogRead]
    total: int
    page: int
    size: int
