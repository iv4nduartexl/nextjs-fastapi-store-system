from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import User, get_async_session
from app.models import (
    CashboxSession,
    CashboxSessionStatus,
    CashboxTransaction,
    CashboxTransactionDirection,
    CashboxTransactionType,
)
from app.schemas import (
    CashboxManualTransaction,
    CashboxSessionClose,
    CashboxSessionCreate,
    CashboxSessionRead,
    CashboxTransactionRead,
)
from app.users import current_active_user

router = APIRouter(tags=["cashbox"])


# ─── Helper ──────────────────────────────────────────────────────────────────

def _build_session_read(session: CashboxSession) -> CashboxSessionRead:
    """Compute balance stats from a session's loaded transactions."""
    sr = CashboxSessionRead.model_validate(session)
    sr.transaction_count = len(session.transactions)

    cash_in = Decimal("0")
    cash_out = Decimal("0")
    card_in = Decimal("0")
    transfer_in = Decimal("0")
    credit_sales = Decimal("0")
    owner_withdrawals = Decimal("0")

    for tx in session.transactions:
        if tx.type == CashboxTransactionType.opening:
            continue  # opening balance counted separately
        method = tx.payment_method
        direction = tx.direction
        amount = tx.amount or Decimal("0")

        if direction == CashboxTransactionDirection.in_:
            if method == "cash":
                cash_in += amount
            elif method == "card":
                card_in += amount
            elif method == "transfer":
                transfer_in += amount
            elif method == "credit":
                credit_sales += amount
        else:  # out
            if method == "cash":
                cash_out += amount
            elif method == "internal":
                owner_withdrawals += amount

    opening = session.opening_amount or Decimal("0")
    expected = opening + cash_in - cash_out

    sr.cash_in = cash_in
    sr.cash_out = cash_out
    sr.card_in = card_in
    sr.transfer_in = transfer_in
    sr.credit_sales = credit_sales
    sr.owner_withdrawals = owner_withdrawals
    sr.expected_cash_balance = expected

    if session.closing_amount_counted is not None:
        sr.difference = session.closing_amount_counted - expected

    return sr


async def _get_open_session(db: AsyncSession, user_id: UUID) -> CashboxSession | None:
    result = await db.execute(
        select(CashboxSession)
        .where(CashboxSession.user_id == user_id, CashboxSession.status == CashboxSessionStatus.open)
        .options(selectinload(CashboxSession.transactions))
    )
    return result.scalars().first()


async def record_auto_transaction(
    db: AsyncSession,
    user_id: UUID,
    tx_type: CashboxTransactionType,
    direction: CashboxTransactionDirection,
    amount: Decimal,
    payment_method: str,
    reference_type: str,
    reference_id: UUID,
    description: str,
) -> None:
    """Auto-create a cashbox transaction if there's an open session. Silent if none."""
    result = await db.execute(
        select(CashboxSession).where(
            CashboxSession.user_id == user_id,
            CashboxSession.status == CashboxSessionStatus.open,
        )
    )
    session = result.scalars().first()

    tx = CashboxTransaction(
        session_id=session.id if session else None,
        user_id=user_id,
        type=tx_type,
        direction=direction,
        amount=amount,
        payment_method=payment_method,
        reference_type=reference_type,
        reference_id=reference_id,
        description=description,
    )
    db.add(tx)


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/session/current", response_model=CashboxSessionRead)
async def get_current_session(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await _get_open_session(db, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="No open cashbox session")
    return _build_session_read(session)


@router.post("/session/open", response_model=CashboxSessionRead, status_code=201)
async def open_session(
    data: CashboxSessionCreate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    existing = await _get_open_session(db, user.id)
    if existing:
        raise HTTPException(status_code=409, detail="A session is already open")

    session = CashboxSession(
        user_id=user.id,
        opening_amount=data.opening_amount,
        notes=data.notes,
        opened_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.flush()  # get session.id

    # Create the opening balance transaction
    opening_tx = CashboxTransaction(
        session_id=session.id,
        user_id=user.id,
        type=CashboxTransactionType.opening,
        direction=CashboxTransactionDirection.in_,
        amount=data.opening_amount,
        payment_method="cash",
        description=None,
    )
    db.add(opening_tx)
    await db.commit()

    result = await db.execute(
        select(CashboxSession)
        .where(CashboxSession.id == session.id)
        .options(selectinload(CashboxSession.transactions))
    )
    session = result.scalars().first()
    return _build_session_read(session)


@router.post("/session/close", response_model=CashboxSessionRead)
async def close_session(
    data: CashboxSessionClose,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    session = await _get_open_session(db, user.id)
    if not session:
        raise HTTPException(status_code=404, detail="No open cashbox session")

    session.status = CashboxSessionStatus.closed
    session.closed_at = datetime.now(timezone.utc)
    session.closing_amount_counted = data.closing_amount_counted
    if data.notes:
        session.notes = (session.notes or "") + (" | " if session.notes else "") + data.notes

    await db.commit()

    result = await db.execute(
        select(CashboxSession)
        .where(CashboxSession.id == session.id)
        .options(selectinload(CashboxSession.transactions))
    )
    session = result.scalars().first()
    return _build_session_read(session)


@router.post("/transactions", response_model=CashboxTransactionRead, status_code=201)
async def add_manual_transaction(
    data: CashboxManualTransaction,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if data.type not in ("income", "expense"):
        raise HTTPException(status_code=422, detail="type must be 'income' or 'expense'")
    if data.amount <= 0:
        raise HTTPException(status_code=422, detail="amount must be positive")

    session = await _get_open_session(db, user.id)
    if not session:
        raise HTTPException(status_code=409, detail="No open cashbox session. Open a session first.")

    direction = CashboxTransactionDirection.in_ if data.type == "income" else CashboxTransactionDirection.out
    tx_type = CashboxTransactionType.income if data.type == "income" else CashboxTransactionType.expense

    tx = CashboxTransaction(
        session_id=session.id,
        user_id=user.id,
        type=tx_type,
        direction=direction,
        amount=data.amount,
        payment_method=data.payment_method,
        description=data.description,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return CashboxTransactionRead.model_validate(tx)


@router.get("/transactions", response_model=list[CashboxTransactionRead])
async def list_transactions(
    session_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    q = select(CashboxTransaction).where(CashboxTransaction.user_id == user.id)
    if session_id:
        q = q.where(CashboxTransaction.session_id == session_id)
    q = q.order_by(CashboxTransaction.created_at.desc()).limit(limit)
    result = await db.execute(q)
    return [CashboxTransactionRead.model_validate(tx) for tx in result.scalars().all()]


@router.get("/sessions", response_model=list[CashboxSessionRead])
async def list_sessions(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(CashboxSession)
        .where(CashboxSession.user_id == user.id)
        .options(selectinload(CashboxSession.transactions))
        .order_by(CashboxSession.opened_at.desc())
        .limit(limit)
    )
    return [_build_session_read(s) for s in result.scalars().all()]


@router.get("/sessions/{session_id}", response_model=CashboxSessionRead)
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(CashboxSession)
        .where(CashboxSession.id == session_id, CashboxSession.user_id == user.id)
        .options(selectinload(CashboxSession.transactions))
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _build_session_read(session)
