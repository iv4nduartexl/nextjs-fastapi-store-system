from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import Item, Sale, SaleItem, PaymentMethod
from app.schemas import SaleCreate, SaleRead
from app.users import current_active_user

router = APIRouter(tags=["sales"])


@router.post("/", response_model=SaleRead)
async def create_sale(
    sale_data: SaleCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not sale_data.items:
        raise HTTPException(status_code=422, detail="Sale must have at least one item")

    item_ids = [si.item_id for si in sale_data.items]
    result = await db.execute(
        select(Item).filter(Item.id.in_(item_ids), Item.user_id == user.id)
    )
    items_map = {item.id: item for item in result.scalars().all()}

    for si in sale_data.items:
        if si.item_id not in items_map:
            raise HTTPException(status_code=404, detail=f"Item {si.item_id} not found")

    total = Decimal("0")
    sale_item_objs = []

    for si in sale_data.items:
        item = items_map[si.item_id]
        if item.price is None:
            raise HTTPException(
                status_code=422,
                detail=f"Item '{item.name}' has no price set",
            )
        unit_price = item.price
        quantity = si.quantity
        subtotal = (unit_price * quantity).quantize(Decimal("0.01"))
        total += subtotal
        item.stock = item.stock - quantity
        sale_item_objs.append(
            SaleItem(
                item_id=item.id,
                item_name=item.name,
                unit_type=item.unit_type.value,
                unit_price=unit_price,
                quantity=quantity,
                subtotal=subtotal,
            )
        )

    change_given = None
    if (
        sale_data.payment_method == PaymentMethod.cash
        and sale_data.amount_tendered is not None
    ):
        change_given = (sale_data.amount_tendered - total).quantize(Decimal("0.01"))

    sale = Sale(
        user_id=user.id,
        total=total,
        payment_method=sale_data.payment_method,
        amount_tendered=sale_data.amount_tendered,
        change_given=change_given,
        notes=sale_data.notes,
        sale_items=sale_item_objs,
    )

    db.add(sale)
    await db.commit()

    result = await db.execute(
        select(Sale)
        .filter(Sale.id == sale.id)
        .options(selectinload(Sale.sale_items))
    )
    sale = result.scalars().first()
    return sale


@router.get("/", response_model=Page[SaleRead])
async def list_sales(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    params = Params(page=page, size=size)
    query = (
        select(Sale)
        .filter(Sale.user_id == user.id)
        .order_by(Sale.created_at.desc())
        .options(selectinload(Sale.sale_items))
    )
    return await apaginate(
        db,
        query,
        params,
        transformer=lambda sales: [SaleRead.model_validate(s) for s in sales],
    )


@router.get("/{sale_id}", response_model=SaleRead)
async def get_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Sale)
        .filter(Sale.id == sale_id, Sale.user_id == user.id)
        .options(selectinload(Sale.sale_items))
    )
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale
