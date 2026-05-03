from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import (
    Customer,
    DiscountRuleScope,
    DiscountRuleType,
    Item,
    PaymentMethod,
    PricingSource,
    QuantityDiscountRule,
    Sale,
    SaleItem,
    SalePriceChangeLog,
    SaleStatus,
    UnitType,
)
from app.schemas import (
    QuantityDiscountRuleCreate,
    QuantityDiscountRuleRead,
    QuantityDiscountRuleUpdate,
    SaleCreate,
    SaleRead,
)
from app.users import current_active_user
from app.routes.cashbox import record_auto_transaction
from app.models import CashboxTransactionType, CashboxTransactionDirection

router = APIRouter(tags=["sales"])


def _to_sale_units(quantity: Decimal, unit_type: UnitType) -> Decimal:
    # Gram items are entered in grams; discounts operate on kilo-equivalent sale units.
    return quantity / Decimal("1000") if unit_type == UnitType.gram else quantity


def _line_subtotal(unit_price: Decimal, quantity: Decimal, unit_type: UnitType) -> Decimal:
    if unit_type == UnitType.gram:
        return (unit_price * quantity / Decimal("1000")).quantize(Decimal("0.01"))
    return (unit_price * quantity).quantize(Decimal("0.01"))


def _apply_rule(unit_price: Decimal, sale_units: Decimal, rule: QuantityDiscountRule) -> Decimal:
    if rule.rule_type == DiscountRuleType.percent and rule.percent_off is not None:
        effective = unit_price * (Decimal("1") - (rule.percent_off / Decimal("100")))
        return max(effective, Decimal("0")).quantize(Decimal("0.01"))

    if rule.rule_type == DiscountRuleType.fixed_price and rule.fixed_unit_price is not None:
        # fixed_price is treated as a fixed total for the rule threshold (min_qty),
        # then converted into an effective unit price so it scales by quantity tiers.
        if rule.min_qty <= 0:
            return unit_price
        effective = (rule.fixed_unit_price / rule.min_qty).quantize(Decimal("0.01"))
        return max(effective, Decimal("0"))

    if (
        rule.rule_type == DiscountRuleType.buy_x_get_y
        and rule.buy_qty is not None
        and rule.free_qty is not None
        and rule.buy_qty > 0
    ):
        group = rule.buy_qty + rule.free_qty
        if group <= 0:
            return unit_price
        groups = int(sale_units // group)
        free_units = Decimal(groups) * rule.free_qty
        payable_units = max(sale_units - free_units, Decimal("0"))
        if sale_units <= 0:
            return unit_price
        avg_effective = (unit_price * payable_units / sale_units).quantize(Decimal("0.01"))
        return max(avg_effective, Decimal("0"))

    return unit_price


async def _ensure_item_access(item_id: UUID, db: AsyncSession, user: User) -> None:
    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.user_id == user.id, Item.is_deleted == False)
    )
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Item not found")


def _validate_discount_rule_payload(
    data,
    existing_scope=None,
    existing_item_id=None,
    existing_category=None,
    existing_rule_type=None,
):
    scope = data.scope if getattr(data, "scope", None) is not None else existing_scope
    item_id = getattr(data, "item_id", None)
    category = getattr(data, "category", None)
    rule_type = getattr(data, "rule_type", None) or existing_rule_type

    if scope == DiscountRuleScope.item and item_id is None and existing_item_id is None:
        raise HTTPException(status_code=422, detail="item_id is required for item discount rules")
    if scope == DiscountRuleScope.category and not ((category or existing_category or "").strip()):
        raise HTTPException(status_code=422, detail="category is required for category discount rules")

    if rule_type == DiscountRuleType.percent:
        if getattr(data, "percent_off", None) is None:
            raise HTTPException(status_code=422, detail="percent_off is required for percent rules")
    elif rule_type == DiscountRuleType.fixed_price:
        if getattr(data, "fixed_unit_price", None) is None:
            raise HTTPException(status_code=422, detail="fixed_unit_price is required for fixed price rules")
    elif rule_type == DiscountRuleType.buy_x_get_y:
        if getattr(data, "buy_qty", None) is None or getattr(data, "free_qty", None) is None:
            raise HTTPException(status_code=422, detail="buy_qty and free_qty are required for buy_x_get_y rules")


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
        select(Item).filter(Item.id.in_(item_ids), Item.user_id == user.id, Item.is_deleted == False)
    )
    items_map = {item.id: item for item in result.scalars().all()}

    for si in sale_data.items:
        if si.item_id not in items_map:
            raise HTTPException(status_code=404, detail=f"Item {si.item_id} not found")

    total = Decimal("0")
    original_total = Decimal("0")
    sale_item_objs = []

    discount_rules_result = await db.execute(
        select(QuantityDiscountRule)
        .where(QuantityDiscountRule.user_id == user.id, QuantityDiscountRule.is_active == True)
        .order_by(QuantityDiscountRule.priority.asc(), QuantityDiscountRule.created_at.asc())
    )
    discount_rules = discount_rules_result.scalars().all()

    for si in sale_data.items:
        item = items_map[si.item_id]
        if item.price is None:
            raise HTTPException(
                status_code=422,
                detail=f"Item '{item.name}' has no price set",
            )
        base_unit_price = item.price.quantize(Decimal("0.01"))
        quantity = si.quantity
        sale_units = _to_sale_units(quantity, item.unit_type)

        pricing_source = PricingSource.base
        discount_rule_name = None
        unit_price = base_unit_price
        manual_override_reason = None
        manual_overridden_by = None
        manual_overridden_at = None

        if si.unit_price_override is not None:
            if si.unit_price_override < 0:
                raise HTTPException(status_code=422, detail="unit_price_override cannot be negative")
            if not (si.manual_override_reason or "").strip():
                raise HTTPException(status_code=422, detail="manual_override_reason is required when overriding price")
            unit_price = si.unit_price_override.quantize(Decimal("0.01"))
            pricing_source = PricingSource.manual_override
            manual_override_reason = si.manual_override_reason.strip()
            manual_overridden_by = user.id
            manual_overridden_at = datetime.now(timezone.utc)
        else:
            applicable_rules = []
            for rule in discount_rules:
                if sale_units < rule.min_qty:
                    continue
                if rule.scope == DiscountRuleScope.item and rule.item_id != item.id:
                    continue
                if rule.scope == DiscountRuleScope.category and rule.category != item.category:
                    continue
                applicable_rules.append(rule)

            best_unit_price = base_unit_price
            best_rule = None
            for rule in applicable_rules:
                candidate = _apply_rule(base_unit_price, sale_units, rule)
                if candidate < best_unit_price:
                    best_unit_price = candidate
                    best_rule = rule

            if best_rule is not None:
                unit_price = best_unit_price
                pricing_source = PricingSource.quantity_discount
                discount_rule_name = best_rule.name

        subtotal = _line_subtotal(unit_price, quantity, item.unit_type)
        base_subtotal = _line_subtotal(base_unit_price, quantity, item.unit_type)
        discount_amount = max(base_subtotal - subtotal, Decimal("0")).quantize(Decimal("0.01"))

        total += subtotal
        original_total += base_subtotal
        item.stock = item.stock - quantity
        sale_item_objs.append(
            SaleItem(
                item_id=item.id,
                item_name=item.name,
                unit_type=item.unit_type,
                base_unit_price=base_unit_price,
                unit_price=unit_price,
                quantity=quantity,
                subtotal=subtotal,
                pricing_source=pricing_source,
                discount_rule_name=discount_rule_name,
                discount_amount=discount_amount,
                manual_override_reason=manual_override_reason,
                manual_overridden_by=manual_overridden_by,
                manual_overridden_at=manual_overridden_at,
            )
        )

    change_given = None

    # Validate customer for credit sales
    if sale_data.payment_method == PaymentMethod.credit:
        if not sale_data.customer_id:
            raise HTTPException(status_code=422, detail="customer_id is required for credit sales")
        cust_result = await db.execute(
            select(Customer).filter(Customer.id == sale_data.customer_id, Customer.user_id == user.id)
        )
        if not cust_result.scalars().first():
            raise HTTPException(status_code=404, detail="Customer not found")

    final_total = total
    subtotal_override = sale_data.subtotal_override
    if subtotal_override is not None:
        if subtotal_override < 0:
            raise HTTPException(status_code=422, detail="subtotal_override cannot be negative")
        if not (sale_data.subtotal_override_reason or "").strip():
            raise HTTPException(status_code=422, detail="subtotal_override_reason is required when overriding subtotal")
        final_total = subtotal_override.quantize(Decimal("0.01"))

    if (
        sale_data.payment_method == PaymentMethod.cash
        and sale_data.amount_tendered is not None
    ):
        change_given = (sale_data.amount_tendered - final_total).quantize(Decimal("0.01"))

    sale = Sale(
        user_id=user.id,
        total=final_total,
        payment_method=sale_data.payment_method,
        amount_tendered=sale_data.amount_tendered,
        change_given=change_given,
        notes=sale_data.notes,
        customer_id=sale_data.customer_id,
        sale_items=sale_item_objs,
    )

    db.add(sale)
    await db.flush()

    for sale_item in sale.sale_items:
        if sale_item.pricing_source == PricingSource.manual_override:
            db.add(
                SalePriceChangeLog(
                    sale_id=sale.id,
                    sale_item_id=sale_item.id,
                    change_scope="item",
                    source="manual",
                    old_value=sale_item.base_unit_price,
                    new_value=sale_item.unit_price,
                    reason=sale_item.manual_override_reason,
                    user_id=user.id,
                )
            )
        elif sale_item.pricing_source == PricingSource.quantity_discount:
            db.add(
                SalePriceChangeLog(
                    sale_id=sale.id,
                    sale_item_id=sale_item.id,
                    change_scope="item",
                    source="system_discount",
                    old_value=sale_item.base_unit_price,
                    new_value=sale_item.unit_price,
                    reason=sale_item.discount_rule_name,
                    user_id=user.id,
                )
            )

    if subtotal_override is not None:
        db.add(
            SalePriceChangeLog(
                sale_id=sale.id,
                sale_item_id=None,
                change_scope="subtotal",
                source="manual",
                old_value=total,
                new_value=final_total,
                reason=sale_data.subtotal_override_reason,
                user_id=user.id,
            )
        )

    await db.commit()

    # Auto-record in cashbox (silent if no session open)
    if sale_data.payment_method != PaymentMethod.credit:
        method_map = {
            PaymentMethod.cash: "cash",
            PaymentMethod.card: "card",
            PaymentMethod.other: "transfer",
            PaymentMethod.internal: "internal",
        }
        tx_type = CashboxTransactionType.sale
        direction = CashboxTransactionDirection.in_
        if sale_data.payment_method == PaymentMethod.internal:
            tx_type = CashboxTransactionType.owner_withdrawal
            direction = CashboxTransactionDirection.out

        await record_auto_transaction(
            db=db,
            user_id=user.id,
            tx_type=tx_type,
            direction=direction,
            amount=final_total,
            payment_method=method_map.get(sale_data.payment_method, "other"),
            reference_type="sale",
            reference_id=sale.id,
            description=None,
        )
    else:
        await record_auto_transaction(
            db=db,
            user_id=user.id,
            tx_type=CashboxTransactionType.sale,
            direction=CashboxTransactionDirection.in_,
            amount=final_total,
            payment_method="credit",
            reference_type="sale",
            reference_id=sale.id,
            description=None,
        )
    await db.commit()

    result = await db.execute(
        select(Sale)
        .filter(Sale.id == sale.id)
        .options(selectinload(Sale.sale_items), selectinload(Sale.customer))
    )
    sale = result.scalars().first()
    sr = SaleRead.model_validate(sale)
    if sale.customer:
        sr.customer_name = sale.customer.name
    return sr


@router.get("/discount-rules", response_model=list[QuantityDiscountRuleRead])
async def list_discount_rules(
    item_id: UUID | None = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(QuantityDiscountRule).where(QuantityDiscountRule.user_id == user.id)
    if not include_inactive:
        query = query.where(QuantityDiscountRule.is_active == True)
    if item_id is not None:
        query = query.where(
            QuantityDiscountRule.scope == DiscountRuleScope.item,
            QuantityDiscountRule.item_id == item_id,
        )
    result = await db.execute(
        query.order_by(QuantityDiscountRule.priority.asc(), QuantityDiscountRule.created_at.asc())
    )
    return [QuantityDiscountRuleRead.model_validate(r) for r in result.scalars().all()]


@router.post("/discount-rules", response_model=QuantityDiscountRuleRead)
async def create_discount_rule(
    payload: QuantityDiscountRuleCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    _validate_discount_rule_payload(payload)
    if payload.item_id is not None:
        await _ensure_item_access(payload.item_id, db, user)

    rule = QuantityDiscountRule(**payload.model_dump(), user_id=user.id)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return QuantityDiscountRuleRead.model_validate(rule)


@router.patch("/discount-rules/{rule_id}", response_model=QuantityDiscountRuleRead)
async def update_discount_rule(
    rule_id: UUID,
    payload: QuantityDiscountRuleUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(QuantityDiscountRule).where(QuantityDiscountRule.id == rule_id, QuantityDiscountRule.user_id == user.id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Discount rule not found")

    _validate_discount_rule_payload(
        payload,
        existing_scope=rule.scope,
        existing_item_id=rule.item_id,
        existing_category=rule.category,
        existing_rule_type=rule.rule_type,
    )

    next_item_id = payload.item_id if payload.item_id is not None else rule.item_id
    if next_item_id is not None:
        await _ensure_item_access(next_item_id, db, user)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return QuantityDiscountRuleRead.model_validate(rule)


@router.delete("/discount-rules/{rule_id}", status_code=204)
async def delete_discount_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(QuantityDiscountRule).where(QuantityDiscountRule.id == rule_id, QuantityDiscountRule.user_id == user.id)
    )
    rule = result.scalars().first()
    if not rule:
        raise HTTPException(status_code=404, detail="Discount rule not found")

    await db.delete(rule)
    await db.commit()
    return Response(status_code=204)


@router.get("/", response_model=Page[SaleRead])
async def list_sales(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    payment_method: str | None = Query(None),
    status: str | None = Query(None),
):
    params = Params(page=page, size=size)
    query = (
        select(Sale)
        .filter(Sale.user_id == user.id)
        .order_by(Sale.created_at.desc())
        .options(selectinload(Sale.sale_items), selectinload(Sale.customer))
    )
    if payment_method:
        query = query.filter(Sale.payment_method == payment_method)
    if status:
        query = query.filter(Sale.status == status)

    def _transform(sales):
        result = []
        for s in sales:
            sr = SaleRead.model_validate(s)
            if s.customer:
                sr.customer_name = s.customer.name
            result.append(sr)
        return result

    return await apaginate(db, query, params, transformer=_transform)


@router.get("/{sale_id}", response_model=SaleRead)
async def get_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Sale)
        .filter(Sale.id == sale_id, Sale.user_id == user.id)
        .options(selectinload(Sale.sale_items), selectinload(Sale.customer))
    )
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    sr = SaleRead.model_validate(sale)
    if sale.customer:
        sr.customer_name = sale.customer.name
    return sr


@router.post("/{sale_id}/cancel", response_model=SaleRead)
async def cancel_sale(
    sale_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Sale)
        .filter(Sale.id == sale_id, Sale.user_id == user.id)
        .options(selectinload(Sale.sale_items), selectinload(Sale.customer))
    )
    sale = result.scalars().first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    if sale.status == SaleStatus.cancelled:
        raise HTTPException(status_code=409, detail="Sale already cancelled")

    if sale.payment_method != PaymentMethod.credit:
        raise HTTPException(
            status_code=422,
            detail="Only credit sales can be cancelled from customer audit.",
        )

    item_ids = [si.item_id for si in sale.sale_items if si.item_id is not None]
    if item_ids:
        item_result = await db.execute(
            select(Item).filter(Item.id.in_(item_ids), Item.user_id == user.id)
        )
        items_map = {item.id: item for item in item_result.scalars().all()}

        for sale_item in sale.sale_items:
            if sale_item.item_id and sale_item.item_id in items_map:
                items_map[sale_item.item_id].stock = (
                    items_map[sale_item.item_id].stock + sale_item.quantity
                )

    sale.status = SaleStatus.cancelled
    await db.commit()

    refreshed = await db.execute(
        select(Sale)
        .filter(Sale.id == sale.id)
        .options(selectinload(Sale.sale_items), selectinload(Sale.customer))
    )
    sale = refreshed.scalars().first()

    sr = SaleRead.model_validate(sale)
    if sale.customer:
        sr.customer_name = sale.customer.name
    return sr
