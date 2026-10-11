"""Endpoints for the point-of-sale screen (available to owners and cashiers)."""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_async_session
from app.models import Item
from app.tenancy import TenantContext, current_tenant

router = APIRouter(tags=["pos"])

# Generous ceiling for a single store's catalog; the POS searches it in memory
MAX_CATALOG_ITEMS = 10000


class CatalogItem(BaseModel):
    id: UUID
    name: str
    sku: str | None
    category: str | None
    unit_type: str
    price: Decimal | None
    stock: Decimal
    min_stock: Decimal | None


@router.get("/catalog", response_model=list[CatalogItem])
async def pos_catalog(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    """The business's active products with only the fields the POS needs, in one request."""
    result = await db.execute(
        select(
            Item.id, Item.name, Item.sku, Item.category, Item.unit_type, Item.price, Item.stock, Item.min_stock
        )
        .where(Item.business_id == tenant.business_id, Item.is_deleted == False)  # noqa: E712
        .order_by(Item.name)
        .limit(MAX_CATALOG_ITEMS)
    )
    return [
        CatalogItem(
            id=row.id,
            name=row.name,
            sku=row.sku,
            category=row.category,
            unit_type=row.unit_type.value if row.unit_type else "unit",
            price=row.price,
            stock=row.stock,
            min_stock=row.min_stock,
        )
        for row in result.all()
    ]
