from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi_pagination import Page, Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import func, distinct as sql_distinct, extract, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import (
    CashboxSession,
    CashboxTransaction,
    CashboxTransactionType,
    CashboxTransactionDirection,
    Customer,
    CustomerPayment,
    DiscountRuleScope,
    DiscountRuleType,
    Item,
    PaymentMethod,
    PricingSource,
    Purchase,
    PurchaseItem,
    QuantityDiscountRule,
    Sale,
    SaleItem,
    SalePriceChangeLog,
    SaleStatus,
    Supplier,
    UnitType,
)
from app.schemas import (
    AnalyticsSummarySchema,
    CategoryStatSchema,
    PaymentMethodStatSchema,
    TopProductSchema,
    CustomerInsightSchema,
    ProfitabilitySchema,
    RevenueTrendSchema,
    DayOfWeekSchema,
    PurchaseAnalyticsSchema,
    InventoryAnalyticsSchema,
    DiscountAnalyticsSchema,
    CustomersAdvancedSchema,
    CancellationAnalyticsSchema,
    CashboxAnalyticsSchema,
    PeakTimesSchema,
    BasketAnalysisSchema,
    QuantityDiscountRuleCreate,
    QuantityDiscountRuleRead,
    QuantityDiscountRuleUpdate,
    SaleCreate,
    SaleRead,
)
from app.users import current_active_user
from app.routes.cashbox import record_auto_transaction

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


@router.get("/analytics/summary", response_model=AnalyticsSummarySchema)
async def analytics_summary(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(
        func.sum(Sale.total).label("total_revenue"),
        func.count().label("total_orders"),
    ).filter(Sale.user_id == user.id, Sale.status == "completed")

    # Top category
    category_query = (
        select(Item.category, func.sum(SaleItem.subtotal).label("revenue"))
        .join(SaleItem, Item.id == SaleItem.item_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.user_id == user.id, Sale.status == "completed")
    )

    # Apply date filtering
    if start_date and end_date:
        query = query.filter(Sale.created_at >= start_date, Sale.created_at <= end_date)
        category_query = category_query.filter(Sale.created_at >= start_date, Sale.created_at <= end_date)
    elif start_date:
        query = query.filter(Sale.created_at >= start_date)
        category_query = category_query.filter(Sale.created_at >= start_date)
    elif end_date:
        query = query.filter(Sale.created_at <= end_date)
        category_query = category_query.filter(Sale.created_at <= end_date)
    elif period != "all":
        now = datetime.now(timezone.utc)
        if period == "7d":
            cutoff = now - timedelta(days=7)
        elif period == "30d":
            cutoff = now - timedelta(days=30)
        elif period == "90d":
            cutoff = now - timedelta(days=90)
        elif period == "1y":
            cutoff = now - timedelta(days=365)
        else:
            cutoff = None
        if cutoff is not None:
            query = query.filter(Sale.created_at >= cutoff)
            category_query = category_query.filter(Sale.created_at >= cutoff)

    result = await db.execute(query)
    row = result.one()
    total_revenue = Decimal(str(row.total_revenue or 0))
    total_orders = row.total_orders or 0

    category_query = (
        category_query
        .group_by(Item.category)
        .order_by(func.sum(SaleItem.subtotal).desc())
        .limit(1)
    )
    category_result = await db.execute(category_query)
    top_category_row = category_result.first()
    top_category = (
        {"name": top_category_row.category or "N/A", "revenue": float(top_category_row.revenue or 0)}
        if top_category_row
        else None
    )

    avg_order_value = (total_revenue / total_orders) if total_orders > 0 else Decimal("0")

    response = {
        "totalRevenue": float(total_revenue.quantize(Decimal("0.01"))),
        "totalOrders": total_orders,
        "avgOrderValue": float(avg_order_value.quantize(Decimal("0.01"))),
        "topCategory": top_category,
    }
    return response


@router.get("/analytics/by-category", response_model=list[CategoryStatSchema])
async def analytics_by_category(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(Item.category, func.sum(SaleItem.subtotal).label("revenue"), func.sum(SaleItem.quantity).label("quantity"), func.count(sql_distinct(Sale.id)).label("orderCount"))\
        .select_from(SaleItem)\
        .join(Sale, Sale.id == SaleItem.sale_id)\
        .join(Item, Item.id == SaleItem.item_id)\
        .filter(Sale.user_id == user.id, Sale.status == "completed")
    if start_date:
        query = query.filter(Sale.created_at >= start_date)
    if end_date:
        query = query.filter(Sale.created_at <= end_date)

    # Apply period-based filtering if no custom dates
    if not start_date and not end_date and period != "all":
        now = datetime.now(timezone.utc)
        if period == "7d":
            start_date = now - timedelta(days=7)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "30d":
            start_date = now - timedelta(days=30)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "90d":
            start_date = now - timedelta(days=90)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "1y":
            start_date = now - timedelta(days=365)
            query = query.filter(Sale.created_at >= start_date)

    query = query.group_by(Item.category).order_by(func.sum(SaleItem.subtotal).desc())

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "category": row.category or "Uncategorized",
            "revenue": float(Decimal(str(row.revenue or 0)).quantize(Decimal("0.01"))),
            "quantity": int(row.quantity or 0),
            "orderCount": int(row.orderCount or 0),
        }
        for row in rows
    ]


@router.get("/analytics/by-payment-method", response_model=list[PaymentMethodStatSchema])
async def analytics_by_payment_method(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(Sale.payment_method, func.sum(Sale.total).label("revenue"), func.count().label("count"))\
        .filter(Sale.user_id == user.id, Sale.status == "completed")
    if start_date:
        query = query.filter(Sale.created_at >= start_date)
    if end_date:
        query = query.filter(Sale.created_at <= end_date)

    # Apply period-based filtering if no custom dates
    if not start_date and not end_date and period != "all":
        now = datetime.now(timezone.utc)
        if period == "7d":
            start_date = now - timedelta(days=7)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "30d":
            start_date = now - timedelta(days=30)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "90d":
            start_date = now - timedelta(days=90)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "1y":
            start_date = now - timedelta(days=365)
            query = query.filter(Sale.created_at >= start_date)

    query = query.group_by(Sale.payment_method).order_by(func.sum(Sale.total).desc())

    result = await db.execute(query)
    rows = result.all()

    total_revenue = sum(float(row.revenue or 0) for row in rows)
    return [
        {
            "method": row.payment_method,
            "revenue": float(Decimal(str(row.revenue or 0)).quantize(Decimal("0.01"))),
            "count": int(row.count or 0),
            "percentage": round((float(row.revenue or 0) / total_revenue * 100) if total_revenue > 0 else 0, 1),
        }
        for row in rows
    ]


@router.get("/analytics/top-products", response_model=list[TopProductSchema])
async def analytics_top_products(
    limit: int = Query(10, ge=1, le=50),
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(SaleItem.item_id, SaleItem.item_name, Item.category,
                   func.sum(SaleItem.subtotal).label("revenue"),
                   func.sum(SaleItem.quantity).label("quantity"),
                   func.count(sql_distinct(Sale.id)).label("orderCount"))\
        .select_from(SaleItem)\
        .join(Sale, Sale.id == SaleItem.sale_id)\
        .join(Item, Item.id == SaleItem.item_id)\
        .filter(Sale.user_id == user.id, Sale.status == "completed")
    if start_date:
        query = query.filter(Sale.created_at >= start_date)
    if end_date:
        query = query.filter(Sale.created_at <= end_date)

    # Apply period-based filtering if no custom dates
    if not start_date and not end_date and period != "all":
        now = datetime.now(timezone.utc)
        if period == "7d":
            start_date = now - timedelta(days=7)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "30d":
            start_date = now - timedelta(days=30)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "90d":
            start_date = now - timedelta(days=90)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "1y":
            start_date = now - timedelta(days=365)
            query = query.filter(Sale.created_at >= start_date)

    query = query.group_by(SaleItem.item_id, SaleItem.item_name, Item.category)\
        .order_by(func.sum(SaleItem.subtotal).desc())\
        .limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "itemId": str(row.item_id),
            "name": row.item_name or "Unknown",
            "revenue": float(Decimal(str(row.revenue or 0)).quantize(Decimal("0.01"))),
            "quantity": int(row.quantity or 0),
            "orderCount": int(row.orderCount or 0),
            "category": row.category or "Uncategorized",
        }
        for row in rows
    ]


@router.get("/analytics/customer-insights", response_model=list[CustomerInsightSchema])
async def analytics_customer_insights(
    limit: int = Query(5, ge=1, le=20),
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    from app.models import Customer

    query = select(Sale.customer_id, Customer.name,
                   func.sum(Sale.total).label("totalSpent"),
                   func.count().label("orderCount"),
                   func.avg(Sale.total).label("avgOrder"),
                   func.max(Sale.created_at).label("lastOrder"))\
        .select_from(Sale)\
        .join(Customer, Customer.id == Sale.customer_id)\
        .filter(Sale.user_id == user.id, Sale.status == "completed", Sale.customer_id.isnot(None))
    if start_date:
        query = query.filter(Sale.created_at >= start_date)
    if end_date:
        query = query.filter(Sale.created_at <= end_date)

    # Apply period-based filtering if no custom dates
    if not start_date and not end_date and period != "all":
        now = datetime.now(timezone.utc)
        if period == "7d":
            start_date = now - timedelta(days=7)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "30d":
            start_date = now - timedelta(days=30)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "90d":
            start_date = now - timedelta(days=90)
            query = query.filter(Sale.created_at >= start_date)
        elif period == "1y":
            start_date = now - timedelta(days=365)
            query = query.filter(Sale.created_at >= start_date)

    query = query.group_by(Sale.customer_id, Customer.name)\
        .order_by(func.sum(Sale.total).desc())\
        .limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "customerId": str(row.customer_id) if row.customer_id else "",
            "name": row.name or "Unknown",
            "totalSpent": float(Decimal(str(row.totalSpent or 0)).quantize(Decimal("0.01"))),
            "orderCount": int(row.orderCount or 0),
            "avgOrder": float(Decimal(str(row.avgOrder or 0)).quantize(Decimal("0.01"))),
            "lastOrder": row.lastOrder.strftime("%Y-%m-%d") if row.lastOrder else "",
        }
        for row in rows
    ]


def _apply_period_filter(query, model, period, start_date, end_date):
    if start_date and end_date:
        return query.filter(model.created_at >= start_date, model.created_at <= end_date)
    elif start_date:
        return query.filter(model.created_at >= start_date)
    elif end_date:
        return query.filter(model.created_at <= end_date)
    elif period != "all":
        now = datetime.now(timezone.utc)
        if period == "7d":
            cutoff = now - timedelta(days=7)
        elif period == "30d":
            cutoff = now - timedelta(days=30)
        elif period == "90d":
            cutoff = now - timedelta(days=90)
        elif period == "1y":
            cutoff = now - timedelta(days=365)
        else:
            return query
        return query.filter(model.created_at >= cutoff)
    return query


# --- Profitability ---

@router.get("/analytics/profitability", response_model=ProfitabilitySchema)
async def analytics_profitability(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    sale_query = (
        select(
            SaleItem.item_id,
            Item.name,
            Item.category,
            func.sum(SaleItem.subtotal).label("revenue"),
            func.sum(SaleItem.quantity).label("quantity"),
        )
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .join(Item, Item.id == SaleItem.item_id)
        .filter(Sale.user_id == user.id, Sale.status == "completed")
    )
    sale_query = _apply_period_filter(sale_query, Sale, period, start_date, end_date)
    sale_query = sale_query.group_by(SaleItem.item_id, Item.name, Item.category)

    sale_result = await db.execute(sale_query)
    sale_rows = sale_result.all()

    item_revenues = {}
    for row in sale_rows:
        item_revenues[row.item_id] = {
            "itemId": str(row.item_id),
            "name": row.name,
            "category": row.category or "Uncategorized",
            "revenue": float(Decimal(str(row.revenue or 0)).quantize(Decimal("0.01"))),
            "quantity": int(row.quantity or 0),
        }

    cost_query = (
        select(
            PurchaseItem.item_id,
            func.sum(PurchaseItem.subtotal).label("cost"),
        )
        .select_from(PurchaseItem)
        .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
        .filter(Purchase.user_id == user.id, Purchase.status == "received")
    )
    cost_query = _apply_period_filter(cost_query, Purchase, period, start_date, end_date)
    cost_query = cost_query.group_by(PurchaseItem.item_id)

    cost_result = await db.execute(cost_query)
    cost_rows = cost_result.all()

    item_costs = {}
    for row in cost_rows:
        item_costs[row.item_id] = float(Decimal(str(row.cost or 0)).quantize(Decimal("0.01")))

    products = []
    for item_id_str, data in item_revenues.items():
        cost = item_costs.get(item_id_str, 0)
        profit = data["revenue"] - cost
        margin = (profit / data["revenue"] * 100) if data["revenue"] > 0 else 0
        products.append({
            "itemId": data["itemId"],
            "name": data["name"],
            "category": data["category"],
            "revenue": data["revenue"],
            "cost": cost,
            "profit": round(profit, 2),
            "margin": round(margin, 1),
            "quantity": data["quantity"],
        })

    products.sort(key=lambda x: x["profit"], reverse=True)

    total_revenue = sum(p["revenue"] for p in products)
    total_cogs = sum(p["cost"] for p in products)
    gross_profit = total_revenue - total_cogs
    margin_pct = (gross_profit / total_revenue * 100) if total_revenue > 0 else 0

    return {
        "totalRevenue": round(total_revenue, 2),
        "totalCOGS": round(total_cogs, 2),
        "grossProfit": round(gross_profit, 2),
        "grossMarginPercent": round(margin_pct, 1),
        "topProfitableProducts": products[:10],
        "leastProfitableProducts": [p for p in reversed(products[-10:]) if p["revenue"] > 0],
    }


# --- Revenue Trend ---

@router.get("/analytics/revenue-trend", response_model=RevenueTrendSchema)
async def analytics_revenue_trend(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(
        func.date(Sale.created_at).label("day"),
        func.sum(Sale.total).label("revenue"),
        func.count().label("orders"),
    ).filter(Sale.user_id == user.id, Sale.status == "completed")
    query = _apply_period_filter(query, Sale, period, start_date, end_date)
    query = query.group_by(func.date(Sale.created_at)).order_by(func.date(Sale.created_at))

    result = await db.execute(query)
    rows = result.all()

    data = []
    for row in rows:
        rev = float(Decimal(str(row.revenue or 0)).quantize(Decimal("0.01")))
        orders = row.orders or 0
        data.append({
            "period": str(row.day),
            "revenue": rev,
            "orders": orders,
            "avgOrderValue": round(rev / orders, 2) if orders > 0 else 0,
        })

    return {"data": data}


# --- Day of Week ---

@router.get("/analytics/day-of-week", response_model=list[DayOfWeekSchema])
async def analytics_day_of_week(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(
        extract("dow", Sale.created_at).label("dow"),
        func.sum(Sale.total).label("revenue"),
        func.count().label("orders"),
    ).filter(Sale.user_id == user.id, Sale.status == "completed")
    query = _apply_period_filter(query, Sale, period, start_date, end_date)
    query = query.group_by("dow").order_by("dow")

    result = await db.execute(query)
    rows = result.all()

    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    data = []
    for row in rows:
        dow = int(row.dow)
        rev = float(Decimal(str(row.revenue or 0)).quantize(Decimal("0.01")))
        orders = row.orders or 0
        data.append({
            "day": day_names[dow],
            "revenue": rev,
            "orders": orders,
            "avgOrderValue": round(rev / orders, 2) if orders > 0 else 0,
        })

    return data


# --- Purchase Analytics ---

@router.get("/analytics/purchases", response_model=PurchaseAnalyticsSchema)
async def analytics_purchases(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    base_query = select(Purchase).filter(Purchase.user_id == user.id)
    base_query = _apply_period_filter(base_query, Purchase, period, start_date, end_date)

    result = await db.execute(base_query)
    purchases = result.scalars().all()

    total_spend = sum((Decimal(str(p.total_cost or 0)) for p in purchases), Decimal("0"))
    total_count = len(purchases)
    avg_value = (total_spend / total_count) if total_count > 0 else Decimal("0")

    supplier_query = (
        select(
            Purchase.supplier_id,
            Supplier.name,
            func.sum(Purchase.total_cost).label("totalSpend"),
            func.count().label("purchaseCount"),
        )
        .select_from(Purchase)
        .outerjoin(Supplier, Supplier.id == Purchase.supplier_id)
        .filter(Purchase.user_id == user.id)
    )
    supplier_query = _apply_period_filter(supplier_query, Purchase, period, start_date, end_date)
    supplier_query = supplier_query.group_by(Purchase.supplier_id, Supplier.name).order_by(func.sum(Purchase.total_cost).desc())

    supplier_result = await db.execute(supplier_query)
    supplier_rows = supplier_result.all()

    by_supplier = [
        {
            "supplierId": str(row.supplier_id) if row.supplier_id else "",
            "name": row.name or "Unknown",
            "totalSpend": float(Decimal(str(row.totalSpend or 0)).quantize(Decimal("0.01"))),
            "purchaseCount": int(row.purchaseCount or 0),
        }
        for row in supplier_rows
    ]

    status_query = (
        select(
            Purchase.payment_status.label("status"),
            func.count().label("count"),
            func.sum(Purchase.total_cost).label("total"),
        )
        .filter(Purchase.user_id == user.id)
    )
    status_query = _apply_period_filter(status_query, Purchase, period, start_date, end_date)
    status_query = status_query.group_by(Purchase.payment_status)

    status_result = await db.execute(status_query)
    status_rows = status_result.all()

    by_status = [
        {
            "status": row.status.value if row.status else "unknown",
            "count": int(row.count or 0),
            "total": float(Decimal(str(row.total or 0)).quantize(Decimal("0.01"))),
        }
        for row in status_rows
    ]

    return {
        "totalSpend": float(total_spend.quantize(Decimal("0.01"))),
        "totalPurchases": total_count,
        "avgPurchaseValue": float(avg_value.quantize(Decimal("0.01"))),
        "bySupplier": by_supplier,
        "byPaymentStatus": by_status,
    }


# --- Inventory Analytics ---

@router.get("/analytics/inventory", response_model=InventoryAnalyticsSchema)
async def analytics_inventory(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    items_result = await db.execute(
        select(Item).filter(Item.user_id == user.id, Item.is_deleted == False)
    )
    items = items_result.scalars().all()

    low_stock = []
    total_value = Decimal("0")
    for item in items:
        stock = Decimal(str(item.stock or 0))
        price = Decimal(str(item.price or 0))
        total_value += stock * price

        if item.min_stock is not None and stock <= Decimal(str(item.min_stock)):
            low_stock.append({
                "itemId": str(item.id),
                "name": item.name,
                "stock": float(stock),
                "minStock": float(item.min_stock) if item.min_stock is not None else None,
                "category": item.category or "Uncategorized",
                "unitType": item.unit_type.value,
            })

    sold_items_result = await db.execute(
        select(SaleItem.item_id, func.max(Sale.created_at).label("last_sold"))
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.user_id == user.id, Sale.status == "completed")
        .group_by(SaleItem.item_id)
    )
    sold_items = {row.item_id: row.last_sold for row in sold_items_result.all()}

    dead_stock = []
    for item in items:
        stock = Decimal(str(item.stock or 0))
        if stock > 0 and item.id not in sold_items:
            dead_stock.append({
                "itemId": str(item.id),
                "name": item.name,
                "stock": float(stock),
                "category": item.category or "Uncategorized",
                "lastSold": None,
            })

    return {
        "totalInventoryValue": float(total_value.quantize(Decimal("0.01"))),
        "totalItems": len(items),
        "lowStockItems": low_stock,
        "deadStockItems": dead_stock,
    }


# --- Discount Analytics ---

@router.get("/analytics/discounts", response_model=DiscountAnalyticsSchema)
async def analytics_discounts(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    base = (
        select(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.user_id == user.id, Sale.status == "completed")
    )
    base = _apply_period_filter(base, Sale, period, start_date, end_date)

    result = await db.execute(base)
    items = result.scalars().all()

    total_discount = sum((Decimal(str(si.discount_amount or 0)) for si in items), Decimal("0"))
    discounted_count = sum(1 for si in items if si.discount_amount and Decimal(str(si.discount_amount)) > 0)
    total_count = len(items)

    rule_stats = {}
    for si in items:
        if si.discount_rule_name and si.discount_amount and Decimal(str(si.discount_amount)) > 0:
            if si.discount_rule_name not in rule_stats:
                rule_stats[si.discount_rule_name] = {"count": 0, "discount": Decimal("0")}
            rule_stats[si.discount_rule_name]["count"] += 1
            rule_stats[si.discount_rule_name]["discount"] += Decimal(str(si.discount_amount))

    by_rule = [
        {
            "ruleName": name,
            "usageCount": stats["count"],
            "totalDiscount": float(stats["discount"].quantize(Decimal("0.01"))),
        }
        for name, stats in sorted(rule_stats.items(), key=lambda x: x[1]["discount"], reverse=True)
    ]

    return {
        "totalDiscountAmount": float(total_discount.quantize(Decimal("0.01"))),
        "discountedSaleCount": discounted_count,
        "totalSalesCount": total_count,
        "discountRate": round((discounted_count / total_count * 100) if total_count > 0 else 0, 1),
        "byRule": by_rule,
    }


# --- Advanced Customer Analytics ---

@router.get("/analytics/customers-advanced", response_model=CustomersAdvancedSchema)
async def analytics_customers_advanced(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    all_customers_result = await db.execute(
        select(func.count()).select_from(Customer).filter(Customer.user_id == user.id, Customer.is_active == True)
    )
    total_customers = all_customers_result.scalar() or 0

    period_query = (
        select(Sale.customer_id, func.sum(Sale.total).label("totalSpent"), func.count().label("orderCount"))
        .filter(Sale.user_id == user.id, Sale.status == "completed", Sale.customer_id.isnot(None))
    )
    period_query = _apply_period_filter(period_query, Sale, period, start_date, end_date)
    period_query = period_query.group_by(Sale.customer_id)

    period_result = await db.execute(period_query)
    period_rows = period_result.all()

    active_customer_ids = set()
    customer_data = {}
    for row in period_rows:
        cid = row.customer_id
        active_customer_ids.add(cid)
        customer_data[cid] = {
            "customerId": str(cid),
            "totalSpent": float(Decimal(str(row.totalSpent or 0)).quantize(Decimal("0.01"))),
            "orderCount": int(row.orderCount or 0),
        }

    all_time_query = (
        select(Sale.customer_id, func.sum(Sale.total).label("totalSpent"), func.count().label("orderCount"))
        .filter(Sale.user_id == user.id, Sale.status == "completed", Sale.customer_id.isnot(None))
        .group_by(Sale.customer_id)
    )
    all_time_result = await db.execute(all_time_query)
    all_time_rows = all_time_result.all()

    repeat_customers = sum(1 for row in all_time_rows if (row.orderCount or 0) > 1)

    credit_query = (
        select(func.coalesce(func.sum(Sale.total), 0).label("credit_total"))
        .filter(
            Sale.user_id == user.id,
            Sale.status == "completed",
            Sale.payment_method == PaymentMethod.credit,
            Sale.customer_id.isnot(None),
        )
    )
    credit_query = _apply_period_filter(credit_query, Sale, period, start_date, end_date)
    credit_result = await db.execute(credit_query)
    credit_total = Decimal(str(credit_result.scalar() or 0))

    paid_query = (
        select(func.coalesce(func.sum(CustomerPayment.amount), 0).label("paid_total"))
        .join(Customer, Customer.id == CustomerPayment.customer_id)
        .filter(Customer.user_id == user.id)
    )
    paid_query = _apply_period_filter(paid_query, CustomerPayment, period, start_date, end_date)
    paid_result = await db.execute(paid_query)
    paid_total = Decimal(str(paid_result.scalar() or 0))

    credit_outstanding = float((credit_total - paid_total).quantize(Decimal("0.01")))

    names_result = await db.execute(
        select(Customer.id, Customer.name).filter(Customer.user_id == user.id)
    )
    names_map = {row.id: row.name for row in names_result.all()}

    top_by_value = sorted(
        [
            {
                "customerId": data["customerId"],
                "name": names_map.get(UUID(data["customerId"]), "Unknown") if data["customerId"] else "Unknown",
                "totalSpent": data["totalSpent"],
                "orderCount": data["orderCount"],
                "creditOwed": 0,
            }
            for data in customer_data.values()
        ],
        key=lambda x: x["totalSpent"],
        reverse=True,
    )[:10]

    return {
        "totalCustomers": total_customers,
        "activeCustomers": len(active_customer_ids),
        "repeatCustomers": repeat_customers,
        "repeatRate": round((repeat_customers / total_customers * 100) if total_customers > 0 else 0, 1),
        "creditOutstanding": credit_outstanding,
        "topByValue": top_by_value,
    }


# --- Cancellation/Refund Analytics ---

@router.get("/analytics/cancellations", response_model=CancellationAnalyticsSchema)
async def analytics_cancellations(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    total_query = select(func.count()).select_from(Sale).filter(Sale.user_id == user.id, Sale.status == "completed")
    total_query = _apply_period_filter(total_query, Sale, period, start_date, end_date)
    total_result = await db.execute(total_query)
    total_completed = total_result.scalar() or 0

    cancel_query = select(
        func.count().label("count"),
        func.coalesce(func.sum(Sale.total), 0).label("revenue"),
    ).filter(Sale.user_id == user.id, Sale.status == "cancelled")
    cancel_query = _apply_period_filter(cancel_query, Sale, period, start_date, end_date)
    cancel_result = await db.execute(cancel_query)
    cancel_row = cancel_result.one()

    refund_query = select(
        func.count().label("count"),
        func.coalesce(func.sum(Sale.total), 0).label("revenue"),
    ).filter(Sale.user_id == user.id, Sale.status == "refunded")
    refund_query = _apply_period_filter(refund_query, Sale, period, start_date, end_date)
    refund_result = await db.execute(refund_query)
    refund_row = refund_result.one()

    cancelled_count = cancel_row.count or 0
    cancelled_revenue = float(Decimal(str(cancel_row.revenue or 0)).quantize(Decimal("0.01")))
    refunded_count = refund_row.count or 0
    refunded_revenue = float(Decimal(str(refund_row.revenue or 0)).quantize(Decimal("0.01")))
    total_lost = cancelled_revenue + refunded_revenue
    total_non_completed = cancelled_count + refunded_count
    total_all = total_completed + total_non_completed
    refund_rate = round((total_non_completed / total_all * 100) if total_all > 0 else 0, 1)

    return {
        "cancelledCount": cancelled_count,
        "cancelledRevenue": cancelled_revenue,
        "refundedCount": refunded_count,
        "refundedRevenue": refunded_revenue,
        "totalLostRevenue": round(total_lost, 2),
        "refundRate": refund_rate,
    }


# --- Cashbox Analytics ---

@router.get("/analytics/cashbox", response_model=CashboxAnalyticsSchema)
async def analytics_cashbox(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(CashboxTransaction).filter(CashboxTransaction.user_id == user.id)
    query = _apply_period_filter(query, CashboxTransaction, period, start_date, end_date)

    result = await db.execute(query)
    transactions = result.scalars().all()

    total_inflow = Decimal("0")
    total_outflow = Decimal("0")
    by_type = {}

    for t in transactions:
        amt = Decimal(str(t.amount or 0))
        if t.direction == CashboxTransactionDirection.in_:
            total_inflow += amt
        else:
            total_outflow += amt

        key = (t.type.value if t.type else "unknown", t.direction.value if t.direction else "unknown")
        if key not in by_type:
            by_type[key] = {"amount": Decimal("0"), "count": 0}
        by_type[key]["amount"] += amt
        by_type[key]["count"] += 1

    return {
        "totalInflow": float(total_inflow.quantize(Decimal("0.01"))),
        "totalOutflow": float(total_outflow.quantize(Decimal("0.01"))),
        "netCashflow": float((total_inflow - total_outflow).quantize(Decimal("0.01"))),
        "byType": [
            {
                "type": k[0],
                "direction": k[1],
                "amount": float(v["amount"].quantize(Decimal("0.01"))),
                "count": v["count"],
            }
            for k, v in sorted(by_type.items(), key=lambda x: x[1]["amount"], reverse=True)
        ],
    }


# --- Peak Sales Times ---

@router.get("/analytics/peak-times", response_model=PeakTimesSchema)
async def analytics_peak_times(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    base = select(Sale).filter(Sale.user_id == user.id, Sale.status == "completed")
    base = _apply_period_filter(base, Sale, period, start_date, end_date)

    result = await db.execute(base)
    sales = result.scalars().all()

    time_blocks = {
        "morning": {"block": "morning", "label": "morning", "revenue": Decimal("0"), "orders": 0},
        "afternoon": {"block": "afternoon", "label": "afternoon", "revenue": Decimal("0"), "orders": 0},
        "evening": {"block": "evening", "label": "evening", "revenue": Decimal("0"), "orders": 0},
        "night": {"block": "night", "label": "night", "revenue": Decimal("0"), "orders": 0},
    }

    for sale in sales:
        hour = sale.created_at.hour
        revenue = Decimal(str(sale.total or 0))
        if 6 <= hour < 12:
            key = "morning"
        elif 12 <= hour < 18:
            key = "afternoon"
        elif hour >= 18:
            key = "evening"
        else:
            key = "night"
        time_blocks[key]["revenue"] += revenue
        time_blocks[key]["orders"] += 1

    total_revenue = sum(b["revenue"] for b in time_blocks.values())
    by_time_block = []
    for b in time_blocks.values():
        pct = float((b["revenue"] / total_revenue * 100)) if total_revenue > 0 else 0
        by_time_block.append({
            "block": b["block"],
            "label": b["label"],
            "revenue": float(b["revenue"].quantize(Decimal("0.01"))),
            "orders": b["orders"],
            "percentage": round(pct, 1),
        })

    by_time_block.sort(key=lambda x: x["revenue"], reverse=True)

    day_names = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
    day_data: dict[int, dict] = {}
    for sale in sales:
        dow = sale.created_at.weekday()
        if dow not in day_data:
            day_data[dow] = {"revenue": Decimal("0"), "orders": 0}
        day_data[dow]["revenue"] += Decimal(str(sale.total or 0))
        day_data[dow]["orders"] += 1

    by_day_of_week = []
    for dow in range(7):
        if dow in day_data:
            d = day_data[dow]
            by_day_of_week.append({
                "day": day_names[dow],
                "revenue": float(d["revenue"].quantize(Decimal("0.01"))),
                "orders": d["orders"],
            })

    return {
        "byTimeBlock": by_time_block,
        "byDayOfWeek": by_day_of_week,
    }


# --- Basket Analysis (Category Pairs) ---

@router.get("/analytics/basket", response_model=BasketAnalysisSchema)
async def analytics_basket(
    period: str = Query("30d", regex="^(7d|30d|90d|1y|all)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    sale_items_query = (
        select(SaleItem.sale_id, Item.category)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .join(Item, Item.id == SaleItem.item_id)
        .filter(
            Sale.user_id == user.id,
            Sale.status == "completed",
            Item.category.isnot(None),
            Item.category != "",
        )
    )
    sale_items_query = _apply_period_filter(sale_items_query, Sale, period, start_date, end_date)

    result = await db.execute(sale_items_query)
    rows = result.all()

    sale_categories: dict[str, set[str]] = {}
    for sale_id, category in rows:
        sid = str(sale_id)
        if sid not in sale_categories:
            sale_categories[sid] = set()
        sale_categories[sid].add(category)

    pair_counts: dict[tuple[str, str], int] = {}
    pair_revenue: dict[tuple[str, str], Decimal] = {}
    multi_category_sales = 0
    total_items_in_baskets = 0

    for sid, categories in sale_categories.items():
        cats = sorted(categories)
        if len(cats) >= 2:
            multi_category_sales += 1
            total_items_in_baskets += len(cats)
            for i in range(len(cats)):
                for j in range(i + 1, len(cats)):
                    pair = (cats[i], cats[j])
                    pair_counts[pair] = pair_counts.get(pair, 0) + 1
                    if pair not in pair_revenue:
                        pair_revenue[pair] = Decimal("0")

    if multi_category_sales > 0:
        revenue_query = (
            select(Sale.id, func.sum(SaleItem.subtotal).label("sale_revenue"))
            .join(SaleItem, SaleItem.sale_id == Sale.id)
            .filter(
                Sale.user_id == user.id,
                Sale.status == "completed",
            )
        )
        revenue_query = _apply_period_filter(revenue_query, Sale, period, start_date, end_date)
        revenue_query = revenue_query.group_by(Sale.id)

        rev_result = await db.execute(revenue_query)
        sale_revenues = {str(row.id): Decimal(str(row.sale_revenue or 0)) for row in rev_result.all()}

        for sid_str in sale_categories:
            if sid_str in sale_revenues:
                cats = sorted(sale_categories[sid_str])
                for i in range(len(cats)):
                    for j in range(i + 1, len(cats)):
                        pair = (cats[i], cats[j])
                        if pair in pair_revenue:
                            pair_revenue[pair] += sale_revenues[sid_str] / Decimal(str(len(cats) * (len(cats) - 1) // 2))

    total_pairs = sum(pair_counts.values())

    top_pairs = []
    for pair, count in sorted(pair_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
        pct = (count / multi_category_sales * 100) if multi_category_sales > 0 else 0
        top_pairs.append({
            "categoryA": pair[0],
            "categoryB": pair[1],
            "count": count,
            "percentage": round(pct, 1),
            "totalRevenue": float(pair_revenue.get(pair, Decimal("0")).quantize(Decimal("0.01"))),
        })

    avg_items = (total_items_in_baskets / multi_category_sales) if multi_category_sales > 0 else 0

    return {
        "topPairs": top_pairs,
        "totalBaskets": multi_category_sales,
        "avgItemsPerBasket": round(avg_items, 1),
    }
