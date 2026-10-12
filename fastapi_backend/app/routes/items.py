from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page
from fastapi_pagination import Params as BaseParams
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.accounts import audit
from app.database import get_async_session
from app.models import Item
from app.schemas import ItemRead, ItemCreate, ItemUpdate
from app.tenancy import TenantContext, current_tenant, require_owner
from app.routes.categories import upsert_category

router = APIRouter(tags=["item"])

# Override default max_size of 100
class Params(BaseParams):
    size: int = Query(50, ge=1, le=500)


def transform_items(items):
    return [ItemRead.model_validate(item) for item in items]


@router.get("/", response_model=Page[ItemRead])
async def read_item(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
    params: Params = Depends(),
    q: str | None = Query(None, description="Search query (name, SKU, or category)"),
    category: str | None = Query(None, description="Filter by exact category name"),
    order: str | None = Query(None, description="Order by field (e.g., 'name', '-price')"),
):
    
    query = select(Item).filter(Item.business_id == tenant.business_id, Item.is_deleted == False)
    if q:
        query = query.filter(
            or_(
                Item.name.ilike(f"%{q}%"),
                Item.sku.ilike(f"%{q}%"),
                Item.category.ilike(f"%{q}%"),
            )
        )
    if category:
        query = query.filter(Item.category.ilike(category))
    
    if order:
        order_field = order.lstrip("-")
        if hasattr(Item, order_field):
            column = getattr(Item, order_field)
            query = query.order_by(column.desc() if order.startswith("-") else column.asc())

    print("Executing query:", query)  # Debugging line to check the generated SQL
    result = await apaginate(db, query, params, transformer=transform_items)
    print ("Query result:", result)  # Debugging line to check the results
    return await apaginate(db, query, params, transformer=transform_items)


@router.post("/", response_model=ItemRead)
async def create_item(
    item: ItemCreate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    values = item.model_dump(exclude={"source"})
    values["name"] = values["name"].strip()
    values["sku"] = (values["sku"] or "").strip() or None
    if not values["name"]:
        raise HTTPException(status_code=422, detail={"code": "name_required", "message": "Name is required"})
    if values["sku"]:
        existing = (
            await db.execute(select(Item).where(Item.business_id == tenant.business_id, Item.sku == values["sku"]))
        ).scalars().first()
        if existing:
            # The client can offer to use the existing product instead
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "sku_exists",
                    "message": "A product with this code already exists",
                    "item": ItemRead.model_validate(existing).model_dump(mode="json"),
                },
            )
    db_item = Item(**values, business_id=tenant.business_id, user_id=tenant.user_id)
    db.add(db_item)
    await db.flush()
    audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="item_created",
          business_id=tenant.business_id, target_type="item", target_id=db_item.id,
          details={"name": db_item.name, "source": item.source})
    await db.commit()
    if item.category:
        await upsert_category(item.category, tenant, db)
        await db.commit()
    await db.refresh(db_item)
    return db_item


@router.patch("/{item_id}", response_model=ItemRead)
async def update_item(
    item_id: UUID,
    data: ItemUpdate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    result = await db.execute(
        select(Item).filter(Item.id == item_id, Item.business_id == tenant.business_id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or not authorized")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    if data.category:
        await upsert_category(data.category, tenant, db)
        await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}")
async def delete_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    result = await db.execute(
        select(Item).filter(Item.id == item_id, Item.business_id == tenant.business_id)
    )
    item = result.scalars().first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found or not authorized")

    item.is_deleted = True
    await db.commit()

    return {"message": "Item successfully deleted"}
