"""Data that makes the purchase wizard fast: last costs, recent suppliers and usual products."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_async_session
from app.models import Item, Purchase, PurchaseItem, PurchaseStatus, Supplier
from app.tenancy import TenantContext, current_tenant

router = APIRouter(tags=["purchasing"])

MAX_CATALOG_ITEMS = 10000
RECENT_SUPPLIERS = 6
USUAL_PRODUCTS = 12
USUAL_PRODUCTS_WINDOW = timedelta(days=90)


class PurchasingCatalogItem(BaseModel):
    id: UUID
    name: str
    sku: str | None
    category: str | None
    unit_type: str
    price: Decimal | None
    stock: Decimal
    min_stock: Decimal | None
    # From the latest non-cancelled purchase (per kg for gram products)
    last_unit_cost: Decimal | None = None
    last_purchased_at: datetime | None = None


class RecentSupplier(BaseModel):
    id: UUID
    name: str | None
    last_purchase_at: datetime


class UsualProduct(BaseModel):
    item_id: UUID
    name: str
    unit_type: str
    times_bought: int
    last_quantity: Decimal
    last_unit_cost: Decimal


def _active_purchases(tenant: TenantContext):
    return (Purchase.business_id == tenant.business_id, Purchase.status != PurchaseStatus.cancelled)


@router.get("/catalog", response_model=list[PurchasingCatalogItem])
async def purchasing_catalog(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    """Active products with their last purchase cost, for the in-memory product search."""
    last_costs = (
        select(PurchaseItem.item_id, PurchaseItem.cost_price, Purchase.purchase_date)
        .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
        .where(PurchaseItem.item_id.isnot(None), *_active_purchases(tenant))
        .distinct(PurchaseItem.item_id)
        .order_by(PurchaseItem.item_id, Purchase.purchase_date.desc(), Purchase.created_at.desc())
    )
    last = {row.item_id: row for row in (await db.execute(last_costs)).all()}

    items = (
        await db.execute(
            select(Item)
            .where(Item.business_id == tenant.business_id, Item.is_deleted == False)  # noqa: E712
            .order_by(Item.name)
            .limit(MAX_CATALOG_ITEMS)
        )
    ).scalars().all()
    return [
        PurchasingCatalogItem(
            id=item.id,
            name=item.name,
            sku=item.sku,
            category=item.category,
            unit_type=item.unit_type.value if item.unit_type else "unit",
            price=item.price,
            stock=item.stock,
            min_stock=item.min_stock,
            last_unit_cost=last[item.id].cost_price if item.id in last else None,
            last_purchased_at=last[item.id].purchase_date if item.id in last else None,
        )
        for item in items
    ]


@router.get("/suppliers/recent", response_model=list[RecentSupplier])
async def recent_suppliers(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    last_purchase = func.max(Purchase.purchase_date).label("last_purchase_at")
    rows = (
        await db.execute(
            select(Supplier.id, Supplier.name, last_purchase)
            .join(Purchase, Purchase.supplier_id == Supplier.id)
            .where(Supplier.business_id == tenant.business_id, *_active_purchases(tenant))
            .group_by(Supplier.id, Supplier.name)
            .order_by(last_purchase.desc())
            .limit(RECENT_SUPPLIERS)
        )
    ).all()
    return [RecentSupplier(id=r.id, name=r.name, last_purchase_at=r.last_purchase_at) for r in rows]


@router.get("/suppliers/{supplier_id}/usual-products", response_model=list[UsualProduct])
async def usual_products(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    """What this supplier usually brings, with the last quantity and cost, for one-tap lines."""
    since = datetime.now(timezone.utc) - USUAL_PRODUCTS_WINDOW
    scope = (
        PurchaseItem.item_id.isnot(None),
        Purchase.supplier_id == supplier_id,
        Purchase.purchase_date >= since,
        *_active_purchases(tenant),
    )
    times = func.count(PurchaseItem.id).label("times_bought")
    top = (
        await db.execute(
            select(PurchaseItem.item_id, times)
            .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
            .where(*scope)
            .group_by(PurchaseItem.item_id)
            .order_by(times.desc(), func.max(Purchase.purchase_date).desc())
            .limit(USUAL_PRODUCTS)
        )
    ).all()
    if not top:
        return []
    ids = [row.item_id for row in top]

    latest = {
        row.item_id: row
        for row in (
            await db.execute(
                select(PurchaseItem.item_id, PurchaseItem.quantity, PurchaseItem.cost_price)
                .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
                .where(PurchaseItem.item_id.in_(ids), *scope)
                .distinct(PurchaseItem.item_id)
                .order_by(PurchaseItem.item_id, Purchase.purchase_date.desc(), Purchase.created_at.desc())
            )
        ).all()
    }
    items = {
        item.id: item
        for item in (
            await db.execute(
                select(Item).where(
                    Item.id.in_(ids), Item.business_id == tenant.business_id, Item.is_deleted == False  # noqa: E712
                )
            )
        ).scalars().all()
    }
    return [
        UsualProduct(
            item_id=row.item_id,
            name=items[row.item_id].name,
            unit_type=items[row.item_id].unit_type.value,
            times_bought=row.times_bought,
            last_quantity=latest[row.item_id].quantity,
            last_unit_cost=latest[row.item_id].cost_price,
        )
        for row in top
        if row.item_id in items and row.item_id in latest
    ]
