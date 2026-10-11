"""Platform administration for the superuser (SUPERUSER_EMAIL): businesses, users, impersonation, audit."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.accounts import SESSION_ENDING_FIELDS, audit, create_account, display_name, reset_to_temporary_password
from app.config import settings
from app.database import get_async_session
from app.models import AuditLog, Business, Sale, User, UserRole
from app.schemas import (
    AdminBusinessCreate,
    AdminBusinessCreated,
    AdminBusinessRead,
    AdminBusinessUpdate,
    AdminUserCreate,
    AdminUserRead,
    AdminUserUpdate,
    AuditLogPage,
    AuditLogRead,
    ImpersonationResponse,
    TemporaryPasswordResponse,
)
from app.tenancy import require_superuser
from app.users import UserManager, get_jwt_strategy, get_user_manager, request_impersonator_id

router = APIRouter(tags=["admin"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _business_reads(db: AsyncSession, businesses: list[Business]) -> list[AdminBusinessRead]:
    ids = [b.id for b in businesses]
    if not ids:
        return []
    users = dict(
        (await db.execute(
            select(User.business_id, func.count(User.id)).where(User.business_id.in_(ids)).group_by(User.business_id)
        )).all()
    )
    last_login = dict(
        (await db.execute(
            select(User.business_id, func.max(User.last_login_at)).where(User.business_id.in_(ids)).group_by(User.business_id)
        )).all()
    )
    # Admin queries are not tenant-bound, so they can aggregate across businesses
    sales = {
        row[0]: (row[1], row[2])
        for row in (await db.execute(
            select(Sale.business_id, func.count(Sale.id), func.max(Sale.created_at))
            .where(Sale.business_id.in_(ids))
            .group_by(Sale.business_id)
        )).all()
    }
    reads = []
    for b in businesses:
        sales_count, last_sale = sales.get(b.id, (0, None))
        activity = [d for d in (last_sale, last_login.get(b.id)) if d is not None]
        reads.append(
            AdminBusinessRead(
                id=b.id,
                name=b.name,
                is_active=b.is_active,
                currency_symbol=b.currency_symbol,
                created_at=b.created_at,
                user_count=users.get(b.id, 0),
                sales_count=sales_count,
                last_activity_at=max(activity) if activity else None,
            )
        )
    return reads


async def _user_read(db: AsyncSession, user: User) -> AdminUserRead:
    business = await db.get(Business, user.business_id) if user.business_id else None
    return AdminUserRead(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        is_superuser=user.is_superuser,
        business_id=user.business_id,
        business_name=business.name if business else None,
    )


async def _get_business(db: AsyncSession, business_id: UUID) -> Business:
    business = await db.get(Business, business_id)
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return business


async def _get_user(db: AsyncSession, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _ensure_not_superuser(user: User) -> None:
    if user.is_superuser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The superuser account can't be changed here")


# ─── Businesses ──────────────────────────────────────────────────────────────

@router.get("/businesses", response_model=list[AdminBusinessRead])
async def list_businesses(
    q: str | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    query = select(Business).order_by(Business.name)
    if q and q.strip():
        query = query.where(Business.name.ilike(f"%{q.strip()}%"))
    return await _business_reads(db, list((await db.execute(query)).scalars().all()))


@router.get("/businesses/{business_id}", response_model=AdminBusinessRead)
async def get_business(
    business_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    return (await _business_reads(db, [await _get_business(db, business_id)]))[0]


@router.post("/businesses", response_model=AdminBusinessCreated, status_code=201)
async def create_business(
    data: AdminBusinessCreate,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
    user_manager: UserManager = Depends(get_user_manager),
):
    business = Business(name=data.name.strip())
    db.add(business)
    await db.flush()
    owner, password = await create_account(
        db,
        user_manager,
        email=data.owner_email,
        username=data.owner_username,
        full_name=data.owner_full_name,
        business_id=business.id,
        role=UserRole.owner,
    )
    audit(db, actor_id=admin.id, action="business_created", business_id=business.id,
          target_type="business", target_id=business.id, details={"name": business.name, "owner": owner.email})
    await db.commit()
    await db.refresh(business)
    return AdminBusinessCreated(
        business=(await _business_reads(db, [business]))[0],
        owner=TemporaryPasswordResponse(user_id=owner.id, email=owner.email, temporary_password=password),
    )


@router.patch("/businesses/{business_id}", response_model=AdminBusinessRead)
async def update_business(
    business_id: UUID,
    data: AdminBusinessUpdate,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    business = await _get_business(db, business_id)
    changes = {}
    if data.name is not None:
        business.name = changes["name"] = data.name.strip()
    if data.is_active is not None:
        business.is_active = changes["is_active"] = data.is_active
    if changes:
        audit(db, actor_id=admin.id, action="business_updated", business_id=business.id,
              target_type="business", target_id=business.id, details=changes)
        await db.commit()
        await db.refresh(business)
    return (await _business_reads(db, [business]))[0]


# ─── Users ───────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserRead])
async def list_users(
    q: str | None = Query(None, description="Email, username or name"),
    business_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    query = select(User).order_by(User.email).limit(200)
    if business_id:
        query = query.where(User.business_id == business_id)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.where(or_(User.email.ilike(term), User.username.ilike(term), User.full_name.ilike(term)))
    users = (await db.execute(query)).scalars().all()
    return [await _user_read(db, u) for u in users]


@router.post("/users", response_model=TemporaryPasswordResponse, status_code=201)
async def create_user(
    data: AdminUserCreate,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
    user_manager: UserManager = Depends(get_user_manager),
):
    await _get_business(db, data.business_id)
    user, password = await create_account(
        db,
        user_manager,
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        business_id=data.business_id,
        role=UserRole(data.role),
    )
    audit(db, actor_id=admin.id, action="user_created", business_id=data.business_id,
          target_type="user", target_id=user.id, details={"email": user.email, "role": data.role})
    await db.commit()
    return TemporaryPasswordResponse(user_id=user.id, email=user.email, temporary_password=password)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def update_user(
    user_id: UUID,
    data: AdminUserUpdate,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
    user_manager: UserManager = Depends(get_user_manager),
):
    user = await _get_user(db, user_id)
    _ensure_not_superuser(user)
    changes: dict = {}
    if data.full_name is not None:
        changes["full_name"] = data.full_name.strip() or None
    if data.role is not None:
        changes["role"] = UserRole(data.role)
    if data.is_active is not None:
        changes["is_active"] = data.is_active
    if data.business_id is not None and data.business_id != user.business_id:
        await _get_business(db, data.business_id)
        changes["business_id"] = data.business_id
    if changes:
        previous_business = user.business_id
        if SESSION_ENDING_FIELDS & changes.keys():
            user = await user_manager.sign_out_everywhere(user, changes)
        else:
            user = await user_manager.user_db.update(user, changes)
        audit(db, actor_id=admin.id, action="user_updated", business_id=previous_business,
              target_type="user", target_id=user.id,
              details={k: (v.value if isinstance(v, UserRole) else str(v) if isinstance(v, UUID) else v)
                       for k, v in changes.items()})
        await db.commit()
    return await _user_read(db, user)


@router.post("/users/{user_id}/reset-password", response_model=TemporaryPasswordResponse)
async def reset_user_password(
    user_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
    user_manager: UserManager = Depends(get_user_manager),
):
    user = await _get_user(db, user_id)
    _ensure_not_superuser(user)
    password = await reset_to_temporary_password(user_manager, user)
    audit(db, actor_id=admin.id, action="password_reset", business_id=user.business_id,
          target_type="user", target_id=user.id)
    await db.commit()
    return TemporaryPasswordResponse(user_id=user.id, email=user.email, temporary_password=password)


# ─── Impersonation ───────────────────────────────────────────────────────────

@router.post("/impersonate/{user_id}", response_model=ImpersonationResponse)
async def impersonate(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    if request_impersonator_id(request):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already viewing as another user")
    user = await _get_user(db, user_id)
    _ensure_not_superuser(user)
    if not user.is_active or user.business_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is inactive or has no business")
    token = get_jwt_strategy().write_impersonation_token(user, admin.id)
    audit(db, actor_id=admin.id, action="impersonation_started", business_id=user.business_id,
          target_type="user", target_id=user.id, details={"email": user.email})
    await db.commit()
    return ImpersonationResponse(
        access_token=token,
        expires_in=settings.IMPERSONATION_TOKEN_EXPIRE_SECONDS,
        user=await _user_read(db, user),
    )


@router.post("/impersonate/{user_id}/stop", status_code=204)
async def stop_impersonation(
    user_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    user = await _get_user(db, user_id)
    audit(db, actor_id=admin.id, action="impersonation_stopped", business_id=user.business_id,
          target_type="user", target_id=user.id)
    await db.commit()


# ─── Audit log ───────────────────────────────────────────────────────────────

@router.get("/audit-logs", response_model=AuditLogPage)
async def list_audit_logs(
    business_id: UUID | None = Query(None),
    user_id: UUID | None = Query(None, description="Actor or impersonator"),
    action: str | None = Query(None),
    since: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_session),
    admin: User = Depends(require_superuser),
):
    query = select(AuditLog)
    if business_id:
        query = query.where(AuditLog.business_id == business_id)
    if user_id:
        query = query.where(or_(AuditLog.actor_user_id == user_id, AuditLog.impersonated_by == user_id))
    if action:
        query = query.where(AuditLog.action == action)
    if since:
        query = query.where(AuditLog.created_at >= since)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (
        await db.execute(query.order_by(AuditLog.created_at.desc()).offset((page - 1) * size).limit(size))
    ).scalars().all()

    user_ids = {r.actor_user_id for r in rows} | {r.impersonated_by for r in rows}
    users = {
        u.id: display_name(u)
        for u in (await db.execute(select(User).where(User.id.in_([i for i in user_ids if i])))).scalars().all()
    }
    business_ids = {r.business_id for r in rows if r.business_id}
    businesses = {
        b.id: b.name
        for b in (await db.execute(select(Business).where(Business.id.in_(business_ids)))).scalars().all()
    }
    items = []
    for r in rows:
        item = AuditLogRead.model_validate(r)
        item.actor_name = users.get(r.actor_user_id)
        item.impersonator_name = users.get(r.impersonated_by)
        item.business_name = businesses.get(r.business_id)
        items.append(item)
    return AuditLogPage(items=items, total=total, page=page, size=size)
