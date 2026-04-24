from datetime import datetime, timezone
from decimal import Decimal
from math import ceil
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import Customer, CustomerPayment, Sale, PaymentMethod, SaleStatus
from app.models import CashboxTransactionType, CashboxTransactionDirection
from app.schemas import (
    CustomerCreate,
    CustomerDetailRead,
    CustomerPage,
    CustomerPaymentCreate,
    CustomerPaymentRead,
    CustomerRead,
    CustomerUpdate,
    SaleRead,
)
from app.users import current_active_user

router = APIRouter(tags=["customers"])


async def _build_customer_read(
    customer: Customer,
    db: AsyncSession,
) -> CustomerRead:
    """Compute balance fields for a single customer."""
    credit_result = await db.execute(
        select(func.coalesce(func.sum(Sale.total), 0))
        .where(Sale.customer_id == customer.id)
        .where(Sale.payment_method == PaymentMethod.credit)
        .where(Sale.status != SaleStatus.cancelled)
    )
    total_credit = Decimal(str(credit_result.scalar()))

    paid_result = await db.execute(
        select(func.coalesce(func.sum(CustomerPayment.amount), 0))
        .where(CustomerPayment.customer_id == customer.id)
    )
    total_paid = Decimal(str(paid_result.scalar()))

    cr = CustomerRead.model_validate(customer)
    cr.total_credit = total_credit
    cr.total_paid = total_paid
    cr.balance = total_credit - total_paid
    return cr


async def _batch_balances(customer_ids: list[UUID], db: AsyncSession) -> dict:
    """Return {customer_id: {total_credit, total_paid}} for a list of IDs in 2 queries."""
    credit_result = await db.execute(
        select(Sale.customer_id, func.coalesce(func.sum(Sale.total), 0).label("tc"))
        .where(Sale.customer_id.in_(customer_ids))
        .where(Sale.payment_method == PaymentMethod.credit)
        .where(Sale.status != SaleStatus.cancelled)
        .group_by(Sale.customer_id)
    )
    credits = {row.customer_id: Decimal(str(row.tc)) for row in credit_result}

    paid_result = await db.execute(
        select(CustomerPayment.customer_id, func.coalesce(func.sum(CustomerPayment.amount), 0).label("tp"))
        .where(CustomerPayment.customer_id.in_(customer_ids))
        .group_by(CustomerPayment.customer_id)
    )
    paid = {row.customer_id: Decimal(str(row.tp)) for row in paid_result}

    return {
        cid: {
            "total_credit": credits.get(cid, Decimal("0")),
            "total_paid": paid.get(cid, Decimal("0")),
        }
        for cid in customer_ids
    }


@router.get("/", response_model=CustomerPage)
async def list_customers(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    q: str | None = Query(None),
    show_inactive: bool = Query(False),
):
    base = select(Customer).where(Customer.user_id == user.id)
    if not show_inactive:
        base = base.where(Customer.is_active == True)
    if q:
        base = base.where(
            or_(
                Customer.name.ilike(f"%{q}%"),
                Customer.phone.ilike(f"%{q}%"),
                Customer.id_number.ilike(f"%{q}%"),
                Customer.email.ilike(f"%{q}%"),
            )
        )

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar()
    pages = max(1, ceil(total / size))

    result = await db.execute(
        base.order_by(Customer.name).offset((page - 1) * size).limit(size)
    )
    customers = result.scalars().all()

    if not customers:
        return CustomerPage(items=[], total=total, page=page, size=size, pages=pages)

    balances = await _batch_balances([c.id for c in customers], db)

    items = []
    for c in customers:
        b = balances[c.id]
        cr = CustomerRead.model_validate(c)
        cr.total_credit = b["total_credit"]
        cr.total_paid = b["total_paid"]
        cr.balance = b["total_credit"] - b["total_paid"]
        items.append(cr)

    # Sort: highest balance first within the page
    items.sort(key=lambda x: x.balance, reverse=True)
    return CustomerPage(items=items, total=total, page=page, size=size, pages=pages)


@router.post("/", response_model=CustomerRead, status_code=201)
async def create_customer(
    data: CustomerCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    customer = Customer(**data.model_dump(), user_id=user.id)
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    cr = CustomerRead.model_validate(customer)
    # New customer has zero balance
    return cr


@router.get("/{customer_id}", response_model=CustomerDetailRead)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Customer)
        .where(Customer.id == customer_id, Customer.user_id == user.id)
        .options(
            selectinload(Customer.sales).selectinload(Sale.sale_items),
            selectinload(Customer.credit_payments),
        )
    )
    customer = result.scalars().first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    credit_sales = [
        s for s in customer.sales
        if s.payment_method == PaymentMethod.credit and s.status != SaleStatus.cancelled
    ]
    total_credit = sum(s.total for s in credit_sales) or Decimal("0")
    total_paid = sum(p.amount for p in customer.credit_payments) or Decimal("0")

    detail = CustomerDetailRead.model_validate(customer)
    detail.total_credit = Decimal(str(total_credit))
    detail.total_paid = Decimal(str(total_paid))
    detail.balance = detail.total_credit - detail.total_paid
    detail.credit_sales = [
        _sale_read_with_customer(s, customer.name)
        for s in sorted(credit_sales, key=lambda x: x.created_at, reverse=True)
    ]
    detail.payments = [
        CustomerPaymentRead.model_validate(p)
        for p in sorted(customer.credit_payments, key=lambda x: x.payment_date, reverse=True)
    ]
    return detail


def _sale_read_with_customer(sale: Sale, customer_name: str) -> SaleRead:
    sr = SaleRead.model_validate(sale)
    sr.customer_name = customer_name
    return sr


@router.patch("/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.user_id == user.id)
    )
    customer = result.scalars().first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)

    await db.commit()
    await db.refresh(customer)
    return await _build_customer_read(customer, db)


@router.post("/{customer_id}/payments", response_model=CustomerPaymentRead, status_code=201)
async def record_payment(
    customer_id: UUID,
    data: CustomerPaymentCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.user_id == user.id)
    )
    customer = result.scalars().first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Compute current balance and reject over-payment
    balance_result = await db.execute(
        select(
            func.coalesce(func.sum(Sale.total), 0).label("total_credit"),
        ).where(
            Sale.customer_id == customer_id,
            Sale.payment_method == "credit",
            Sale.status != "cancelled",
        )
    )
    paid_result = await db.execute(
        select(func.coalesce(func.sum(CustomerPayment.amount), 0)).where(
            CustomerPayment.customer_id == customer_id
        )
    )
    total_credit = balance_result.scalar() or Decimal("0")
    total_paid = paid_result.scalar() or Decimal("0")
    current_balance = total_credit - total_paid
    if data.amount > current_balance:
        raise HTTPException(
            status_code=422,
            detail=f"Payment amount exceeds outstanding balance of {current_balance}.",
        )

    payment = CustomerPayment(
        customer_id=customer_id,
        user_id=user.id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_date=data.payment_date or datetime.now(timezone.utc),
        notes=data.notes,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    # Auto-record in cashbox
    from app.routes.cashbox import record_auto_transaction
    await record_auto_transaction(
        db=db,
        user_id=user.id,
        tx_type=CashboxTransactionType.customer_payment,
        direction=CashboxTransactionDirection.in_,
        amount=data.amount,
        payment_method=data.payment_method,
        reference_type="customer_payment",
        reference_id=customer.id,
        description=f"Payment from {customer.name}",
    )
    await db.commit()

    return CustomerPaymentRead.model_validate(payment)
