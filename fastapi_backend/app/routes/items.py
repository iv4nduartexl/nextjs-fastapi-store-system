from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page
from fastapi_pagination import Params as BaseParams
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import User, get_async_session
from app.models import Item
from app.schemas import ItemRead, ItemCreate, ItemUpdate
from app.users import current_active_user
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
    user: User = Depends(current_active_user),
    params: Params = Depends(),
    q: str | None = Query(None, description="Search query (name, SKU, or category)"),
    category: str | None = Query(None, description="Filter by exact category name"),
):
    query = select(Item).filter(Item.user_id == user.id, Item.is_deleted is False)
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
    return await apaginate(db, query, params, transformer=transform_items)


@router.post("/", response_model=ItemRead)
async def create_item(
    item: ItemCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    db_item = Item(**item.model_dump(), user_id=user.id)
    db.add(db_item)
    await db.commit()
    if item.category:
        await upsert_category(item.category, user.id, db)
        await db.commit()
    await db.refresh(db_item)
    return db_item


@router.patch("/{item_id}", response_model=ItemRead)
async def update_item(
    item_id: UUID,
    data: ItemUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Item).filter(Item.id == item_id, Item.user_id == user.id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or not authorized")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    if data.category:
        await upsert_category(data.category, user.id, db)
        await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}")
async def delete_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Item).filter(Item.id == item_id, Item.user_id == user.id)
    )
    item = result.scalars().first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found or not authorized")

    item.is_deleted = True
    await db.commit()

    return {"message": "Item successfully deleted"}
