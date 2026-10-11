"""Compact, read-only endpoints designed as tools for the chat assistant.

They return small, flat JSON so the model can find ids and answer questions without paging
through the full list endpoints.
"""
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_async_session
from app.models import (
    Customer,
    Item,
    Purchase,
    PurchaseItem,
    PurchaseStatus,
    Sale,
    SaleItem,
    SaleStatus,
)
from app.routes.cashbox import _build_session_read, _get_open_session
from app.routes.customers import _batch_balances
from app.tenancy import TenantContext, current_tenant

router = APIRouter(tags=["assistant"])


class ProductMatch(BaseModel):
    id: UUID
    name: str
    sku: str | None
    category: str | None
    unit_type: str
    price: Decimal | None
    stock: Decimal
    min_stock: Decimal | None


class CustomerMatch(BaseModel):
    id: UUID
    name: str
    phone: str | None
    id_number: str | None
    balance: Decimal
    credit_limit: Decimal | None


class ProductDetails(ProductMatch):
    last_purchase_unit_cost: Decimal | None
    last_purchase_date: datetime | None
    sold_last_30_days: Decimal
    revenue_last_30_days: Decimal


class PaymentBreakdown(BaseModel):
    payment_method: str
    total: Decimal
    count: int


class LowStockItem(BaseModel):
    id: UUID
    name: str
    stock: Decimal
    min_stock: Decimal


class StoreSnapshot(BaseModel):
    date: str
    sales_total: Decimal
    sales_count: int
    sales_by_payment_method: list[PaymentBreakdown]
    cashbox_open: bool
    cashbox_expected_cash: Decimal | None
    cashbox_opened_at: datetime | None
    low_stock_count: int
    low_stock_items: list[LowStockItem]
    customers_over_credit_limit: int


def _product_match(item: Item) -> ProductMatch:
    return ProductMatch(
        id=item.id,
        name=item.name,
        sku=item.sku,
        category=item.category,
        unit_type=item.unit_type.value,
        price=item.price,
        stock=item.stock,
        min_stock=item.min_stock,
    )


def _tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name) if name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


@router.get("/products/search", response_model=list[ProductMatch])
async def search_products(
    q: str = Query(..., min_length=1, description="Words from the product name, SKU or category"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    words = [w for w in q.strip().split() if w]
    # Every word must appear in the name, SKU or category, in any order ("coca 2l" finds "Coca Cola 2L")
    word_filters = [
        or_(Item.name.ilike(f"%{w}%"), Item.sku.ilike(f"%{w}%"), Item.category.ilike(f"%{w}%"))
        for w in words
    ]
    rank = case(
        (func.lower(Item.name) == q.strip().lower(), 0),
        (Item.sku == q.strip(), 0),
        (Item.name.ilike(f"{q.strip()}%"), 1),
        else_=2,
    )
    result = await db.execute(
        select(Item)
        .where(Item.business_id == tenant.business_id, Item.is_deleted == False, and_(*word_filters))  # noqa: E712
        .order_by(rank, Item.name)
        .limit(limit)
    )
    return [_product_match(item) for item in result.scalars().all()]


@router.get("/customers/search", response_model=list[CustomerMatch])
async def search_customers(
    q: str = Query(..., min_length=1, description="Name, phone or ID number"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    words = [w for w in q.strip().split() if w]
    word_filters = [
        or_(
            Customer.name.ilike(f"%{w}%"),
            Customer.phone.ilike(f"%{w}%"),
            Customer.id_number.ilike(f"%{w}%"),
        )
        for w in words
    ]
    result = await db.execute(
        select(Customer)
        .where(Customer.business_id == tenant.business_id, Customer.is_active == True, and_(*word_filters))  # noqa: E712
        .order_by(Customer.name)
        .limit(limit)
    )
    customers = result.scalars().all()
    if not customers:
        return []
    balances = await _batch_balances([c.id for c in customers], db)
    return [
        CustomerMatch(
            id=c.id,
            name=c.name,
            phone=c.phone,
            id_number=c.id_number,
            balance=(
                balances[c.id]["total_credit"]
                + balances[c.id]["total_outcomes"]
                - balances[c.id]["total_paid"]
            ),
            credit_limit=c.credit_limit,
        )
        for c in customers
    ]


@router.get("/products/{item_id}", response_model=ProductDetails)
async def product_details(
    item_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    result = await db.execute(select(Item).where(Item.id == item_id, Item.business_id == tenant.business_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Product not found")

    last_purchase = (
        await db.execute(
            select(PurchaseItem.cost_price, Purchase.purchase_date)
            .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
            .where(
                PurchaseItem.item_id == item.id,
                Purchase.business_id == tenant.business_id,
                Purchase.status != PurchaseStatus.cancelled,
            )
            .order_by(Purchase.purchase_date.desc())
            .limit(1)
        )
    ).first()

    since = datetime.now(timezone.utc) - timedelta(days=30)
    sold = (
        await db.execute(
            select(
                func.coalesce(func.sum(SaleItem.quantity), 0),
                func.coalesce(func.sum(SaleItem.subtotal), 0),
            )
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(
                SaleItem.item_id == item.id,
                Sale.business_id == tenant.business_id,
                Sale.status == SaleStatus.completed,
                Sale.created_at >= since,
            )
        )
    ).one()

    return ProductDetails(
        **_product_match(item).model_dump(),
        last_purchase_unit_cost=last_purchase.cost_price if last_purchase else None,
        last_purchase_date=last_purchase.purchase_date if last_purchase else None,
        sold_last_30_days=Decimal(str(sold[0])),
        revenue_last_30_days=Decimal(str(sold[1])),
    )


@router.get("/snapshot", response_model=StoreSnapshot)
async def store_snapshot(
    tz: str | None = Query(None, description="IANA timezone used to decide what 'today' is"),
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    zone = _tz(tz)
    today = datetime.now(zone).date()
    start = datetime.combine(today, time.min, tzinfo=zone)
    end = start + timedelta(days=1)

    by_method = (
        await db.execute(
            select(Sale.payment_method, func.sum(Sale.total), func.count(Sale.id))
            .where(
                Sale.business_id == tenant.business_id,
                Sale.status == SaleStatus.completed,
                Sale.created_at >= start,
                Sale.created_at < end,
            )
            .group_by(Sale.payment_method)
        )
    ).all()
    breakdown = [
        PaymentBreakdown(payment_method=row[0].value, total=Decimal(str(row[1] or 0)), count=row[2])
        for row in by_method
    ]

    session = await _get_open_session(db, tenant.business_id)
    session_read = _build_session_read(session) if session else None

    low_stock_rows = (
        await db.execute(
            select(Item)
            .where(
                Item.business_id == tenant.business_id,
                Item.is_deleted == False,  # noqa: E712
                Item.min_stock.isnot(None),
                Item.stock <= Item.min_stock,
            )
            .order_by(Item.stock - Item.min_stock)
        )
    ).scalars().all()

    limited_customers = (
        await db.execute(
            select(Customer).where(
                Customer.business_id == tenant.business_id,
                Customer.is_active == True,  # noqa: E712
                Customer.credit_limit.isnot(None),
            )
        )
    ).scalars().all()
    over_limit = 0
    if limited_customers:
        balances = await _batch_balances([c.id for c in limited_customers], db)
        for c in limited_customers:
            b = balances[c.id]
            if b["total_credit"] + b["total_outcomes"] - b["total_paid"] > c.credit_limit:
                over_limit += 1

    return StoreSnapshot(
        date=today.isoformat(),
        sales_total=sum((b.total for b in breakdown), Decimal("0")),
        sales_count=sum(b.count for b in breakdown),
        sales_by_payment_method=breakdown,
        cashbox_open=session is not None,
        cashbox_expected_cash=session_read.expected_cash_balance if session_read else None,
        cashbox_opened_at=session.opened_at if session else None,
        low_stock_count=len(low_stock_rows),
        low_stock_items=[
            LowStockItem(id=i.id, name=i.name, stock=i.stock, min_stock=i.min_stock)
            for i in low_stock_rows[:10]
        ],
        customers_over_credit_limit=over_limit,
    )
