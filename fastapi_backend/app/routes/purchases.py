from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import Item, Purchase, PurchaseItem, PurchaseStatus, UnitType
from app.schemas import PurchaseCreate, PurchaseRead
from app.users import current_active_user

router = APIRouter(tags=["purchases"])


def transform_purchases(purchases):
    return [PurchaseRead.model_validate(p) for p in purchases]


@router.post("/", response_model=PurchaseRead, status_code=201)
async def create_purchase(
    data: PurchaseCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not data.items:
        raise HTTPException(status_code=422, detail="Purchase must have at least one item")

    # Resolve item references for items that link to existing catalog entries
    item_ids = [i.item_id for i in data.items if i.item_id is not None]
    items_map: dict[UUID, Item] = {}
    if item_ids:
        result = await db.execute(
            select(Item).filter(Item.id.in_(item_ids), Item.user_id == user.id)
        )
        items_map = {item.id: item for item in result.scalars().all()}

    subtotal = Decimal("0")
    tax = (data.tax or Decimal("0")).quantize(Decimal("0.01"))
    line_objs: list[PurchaseItem] = []

    # Auto-create catalog items for unlinked lines and flush to get their IDs
    new_catalog_items: dict[int, Item] = {}  # line index → new Item
    for idx, line in enumerate(data.items):
        is_existing = line.item_id is not None and line.item_id in items_map
        if not is_existing and line.item_name:
            unit = UnitType(line.unit_type) if line.unit_type else UnitType.unit
            new_item = Item(
                name=line.item_name,
                unit_type=unit,
                stock=line.quantity,
                sku=line.sku or None,
                category=line.category or None,
                user_id=user.id,
            )
            db.add(new_item)
            new_catalog_items[idx] = new_item

    if new_catalog_items:
        await db.flush()  # assigns IDs without committing

    for idx, line in enumerate(data.items):
        quantity = line.quantity
        cost_price = line.cost_price.quantize(Decimal("0.01"))
        # Gram unit type: cost_price is the TOTAL cost for the batch, not per unit
        if (line.unit_type or unit_type) == "gram":
            line_subtotal = cost_price
        else:
            line_subtotal = (quantity * cost_price).quantize(Decimal("0.01"))
        subtotal += line_subtotal

        # Determine item name, unit_type, and resolved item_id
        if line.item_id and line.item_id in items_map:
            db_item = items_map[line.item_id]
            item_name = db_item.name
            unit_type = db_item.unit_type.value
            resolved_item_id = line.item_id
        elif idx in new_catalog_items:
            db_item = new_catalog_items[idx]
            item_name = db_item.name
            unit_type = db_item.unit_type.value
            resolved_item_id = db_item.id
        else:
            item_name = line.item_name
            unit_type = line.unit_type
            resolved_item_id = None

        line_objs.append(
            PurchaseItem(
                item_id=resolved_item_id,
                item_name=item_name,
                unit_type=unit_type,
                quantity=quantity,
                cost_price=cost_price,
                subtotal=line_subtotal,
            )
        )

    total_cost = (subtotal + tax).quantize(Decimal("0.01"))

    purchase = Purchase(
        user_id=user.id,
        supplier_name=data.supplier_name,
        reference_number=data.reference_number,
        purchase_date=data.purchase_date or datetime.now(timezone.utc),
        status=PurchaseStatus.received,
        payment_status=data.payment_status,
        payment_method=data.payment_method,
        subtotal=subtotal,
        tax=tax,
        total_cost=total_cost,
        notes=data.notes,
        purchase_items=line_objs,
    )
    db.add(purchase)

    # Increase stock for existing catalog items (new items already have stock set at creation)
    for line in data.items:
        if line.item_id and line.item_id in items_map:
            items_map[line.item_id].stock += line.quantity

    await db.commit()
    await db.refresh(purchase)

    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.purchase_items))
        .filter(Purchase.id == purchase.id)
    )
    return PurchaseRead.model_validate(result.scalars().first())


@router.get("/", response_model=Page[PurchaseRead])
async def list_purchases(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    params = Params(page=page, size=size)
    query = (
        select(Purchase)
        .options(selectinload(Purchase.purchase_items))
        .filter(Purchase.user_id == user.id)
        .order_by(Purchase.purchase_date.desc())
    )
    return await apaginate(db, query, params, transformer=transform_purchases)


@router.get("/{purchase_id}", response_model=PurchaseRead)
async def get_purchase(
    purchase_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.purchase_items))
        .filter(Purchase.id == purchase_id, Purchase.user_id == user.id)
    )
    purchase = result.scalars().first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return PurchaseRead.model_validate(purchase)
