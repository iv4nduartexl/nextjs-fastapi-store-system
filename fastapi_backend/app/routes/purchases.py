from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from app.database import get_async_session
from app.models import Item, Purchase, PurchaseItem, PurchaseStatus, Supplier, UnitType
from app.models import CashboxTransactionType, CashboxTransactionDirection
from app.schemas import PurchaseCancelRequest, PurchaseCreate, PurchaseRead
from app.accounts import audit
from app.tenancy import TenantContext, current_tenant, require_owner
from app.routes.cashbox import record_auto_transaction, reverse_auto_transactions
from app.routes.categories import upsert_category
from app.routes.suppliers import upsert_supplier

router = APIRouter(tags=["purchases"])


def transform_purchases(purchases):
    return [PurchaseRead.model_validate(p) for p in purchases]


@router.post("/", response_model=PurchaseRead, status_code=201)
async def create_purchase(
    data: PurchaseCreate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    if not data.items:
        raise HTTPException(status_code=422, detail="Purchase must have at least one item")

    # Resolve item references for items that link to existing catalog entries
    item_ids = [i.item_id for i in data.items if i.item_id is not None]
    items_map: dict[UUID, Item] = {}
    if item_ids:
        result = await db.execute(
            select(Item).filter(Item.id.in_(item_ids), Item.business_id == tenant.business_id)
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
                price=line.sell_price if line.sell_price is not None else None,
                business_id=tenant.business_id, user_id=tenant.user_id,
            )
            db.add(new_item)
            new_catalog_items[idx] = new_item

    if new_catalog_items:
        await db.flush()  # assigns IDs without committing

    for idx, line in enumerate(data.items):
        quantity = line.quantity
        total_cost_price = line.total_cost_price.quantize(Decimal("0.01"))
        cost_price = Decimal("0")
        # Gram: cost_price is per 1000g (per kg). Subtotal = cost_price * 1000 / qty
        if (line.unit_type or UnitType.unit) == UnitType.gram:
            cost_price = (1000 * total_cost_price / quantity).quantize(Decimal("0.01"))
        else:
            cost_price = (total_cost_price / quantity).quantize(Decimal("0.01"))
        subtotal += total_cost_price

        # Determine item name, unit_type, and resolved item_id
        if line.item_id and line.item_id in items_map:
            db_item = items_map[line.item_id]
            item_name = db_item.name
            unit_type = db_item.unit_type if not line.overwrite_previous_value else UnitType(line.unit_type) if line.unit_type else db_item.unit_type
            resolved_item_id = line.item_id
        elif idx in new_catalog_items:
            db_item = new_catalog_items[idx]
            item_name = db_item.name
            unit_type = db_item.unit_type
            resolved_item_id = db_item.id
        else:
            item_name = line.item_name
            unit_type = UnitType(line.unit_type) if line.unit_type else UnitType.unit
            resolved_item_id = None

        line_objs.append(
            PurchaseItem(
                item_id=resolved_item_id,
                item_name=item_name,
                unit_type=unit_type,
                quantity=quantity,
                cost_price=cost_price,
                subtotal=total_cost_price,
            )
        )

    total_cost = (subtotal + tax).quantize(Decimal("0.01"))
    
    supplier = await upsert_supplier(data.supplier, tenant, db)

    purchase = Purchase(
        business_id=tenant.business_id, user_id=tenant.user_id,
        supplier_id=supplier.id if supplier else None,
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
    # Also update sell price when requested
    for line in data.items:
        if line.item_id and line.item_id in items_map:
            db_item = items_map[line.item_id]
            db_item.stock += line.quantity
            if line.sell_price is not None:
                # If no stock (before this purchase), always overwrite
                # If stock existed and user confirmed, overwrite too
                if db_item.stock <= line.quantity or line.overwrite_previous_value:
                    db_item.price = line.sell_price
            if line.sku is not None:
                if db_item.sku is None or line.overwrite_previous_value:
                    db_item.sku = line.sku
            if line.category is not None:
                if db_item.category is None or line.overwrite_previous_value:
                    db_item.category = line.category
            if line.unit_type is not None:
                if db_item.unit_type is None or line.overwrite_previous_value:
                    db_item.unit_type = UnitType(line.unit_type)

    await db.commit()
    await db.refresh(purchase)

    # Upsert categories for all lines that have one
    for line in data.items:
        if line.category:
            await upsert_category(line.category, tenant, db)
    await db.commit()

    # Auto-record in cashbox (only for paid purchases, silent if no session open)
    from app.models import PurchasePaymentStatus
    if purchase.payment_status == PurchasePaymentStatus.paid:
        method_map = {"cash": "cash", "card": "card", "transfer": "transfer", "credit": "credit"}
        pmethod = method_map.get(purchase.payment_method.value, "cash")
        if pmethod != "credit":
            await record_auto_transaction(
                db=db,
                business_id=tenant.business_id, user_id=tenant.user_id,
                tx_type=CashboxTransactionType.purchase,
                direction=CashboxTransactionDirection.out,
                amount=purchase.total_cost,
                payment_method=pmethod,
                reference_type="purchase",
                reference_id=purchase.id,
                description=f"Purchase{' - ' + supplier.name if supplier else ''}",
            )
            await db.commit()

    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.purchase_items))
        .filter(Purchase.id == purchase.id)
    )
    return PurchaseRead.model_validate(result.scalars().first())


@router.get("/", response_model=Page[PurchaseRead])
async def list_purchases(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    q: str | None = Query(None),
    payment_status: str | None = Query(None),
    status: str | None = Query(None),
    user_id: UUID | None = Query(None, description="Only records made by this user"),
):
    params = Params(page=page, size=size)
    query = (
        select(Purchase)
        .options(selectinload(Purchase.purchase_items), selectinload(Purchase.supplier))
        .filter(Purchase.business_id == tenant.business_id)
        .order_by(Purchase.purchase_date.desc(), Purchase.created_at.desc(), Purchase.id.desc())
    )
    if q:
        query = query.filter(
            or_(
                Purchase.supplier.name.has(Supplier.name.ilike(f"%{q}%")),
                Purchase.reference_number.ilike(f"%{q}%"),
            )
        )
    if payment_status:
        query = query.filter(Purchase.payment_status == payment_status)
    if status:
        query = query.filter(Purchase.status == status)
    if user_id:
        query = query.filter(Purchase.user_id == user_id)
    return await apaginate(db, query, params, transformer=transform_purchases)


@router.get("/{purchase_id}", response_model=PurchaseRead)
async def get_purchase(
    purchase_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.purchase_items), selectinload(Purchase.supplier))
        .filter(Purchase.id == purchase_id, Purchase.business_id == tenant.business_id)
    )
    purchase = result.scalars().first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return PurchaseRead.model_validate(purchase)


@router.post("/{purchase_id}/cancel", response_model=PurchaseRead)
async def cancel_purchase(
    purchase_id: UUID,
    data: PurchaseCancelRequest | None = None,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    data = data or PurchaseCancelRequest()
    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.purchase_items), selectinload(Purchase.supplier))
        .filter(Purchase.id == purchase_id, Purchase.business_id == tenant.business_id)
    )
    purchase = result.scalars().first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    if purchase.status == PurchaseStatus.cancelled:
        raise HTTPException(
            status_code=409,
            detail={"code": "already_cancelled", "message": "Purchase already cancelled"},
        )

    # Total quantity to take back out of stock, per catalog item
    qty_by_item: dict[UUID, Decimal] = {}
    for line in purchase.purchase_items:
        if line.item_id is not None:
            qty_by_item[line.item_id] = qty_by_item.get(line.item_id, Decimal("0")) + line.quantity

    items_map: dict[UUID, Item] = {}
    if qty_by_item:
        item_result = await db.execute(
            select(Item).filter(Item.id.in_(qty_by_item.keys()), Item.business_id == tenant.business_id)
        )
        items_map = {item.id: item for item in item_result.scalars().all()}

    short_items = [
        {
            "id": str(item.id),
            "name": item.name,
            "stock": float(item.stock),
            "quantity": float(qty_by_item[item.id]),
        }
        for item in items_map.values()
        if item.stock - qty_by_item[item.id] < 0
    ]
    if short_items and not data.force:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "negative_stock",
                "message": "Cancelling this purchase would leave some products with negative stock",
                "items": short_items,
            },
        )

    for item_id, qty in qty_by_item.items():
        if item_id in items_map:
            items_map[item_id].stock = items_map[item_id].stock - qty

    reason = (data.reason or "").strip() or None
    purchase.status = PurchaseStatus.cancelled
    purchase.cancelled_at = datetime.now(timezone.utc)
    purchase.cancelled_by = tenant.user_id
    purchase.cancel_reason = reason

    await reverse_auto_transactions(
        db=db,
        business_id=tenant.business_id, user_id=tenant.user_id,
        reference_type="purchase",
        reference_id=purchase.id,
        reversal_type=CashboxTransactionType.purchase_cancel,
        description=reason,
    )
    audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="purchase_cancelled",
          business_id=tenant.business_id, target_type="purchase", target_id=purchase.id, details={"reason": reason})
    await db.commit()

    result = await db.execute(
        select(Purchase)
        .options(selectinload(Purchase.purchase_items), selectinload(Purchase.supplier))
        .filter(Purchase.id == purchase.id)
        .execution_options(populate_existing=True)
    )
    return PurchaseRead.model_validate(result.scalars().first())
