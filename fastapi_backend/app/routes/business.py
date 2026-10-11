"""The current business and its team. Owners manage users; everyone can read the business name."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.accounts import (
    SESSION_ENDING_FIELDS,
    active_owner_count,
    audit,
    create_account,
    reset_to_temporary_password,
)
from app.database import get_async_session
from app.models import Business, User, UserRole
from app.schemas import (
    BusinessRead,
    BusinessUpdate,
    TeamUserCreate,
    TeamUserRead,
    TeamUserUpdate,
    TemporaryPasswordResponse,
)
from app.tenancy import TenantContext, current_tenant, require_owner
from app.users import UserManager, get_user_manager

router = APIRouter(tags=["business"])


async def _team_member(db: AsyncSession, tenant: TenantContext, user_id: UUID) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id, User.business_id == tenant.business_id)
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return member


@router.get("", response_model=BusinessRead)
async def get_business(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    return await db.get(Business, tenant.business_id)


@router.patch("", response_model=BusinessRead)
async def update_business(
    data: BusinessUpdate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    business = await db.get(Business, tenant.business_id)
    business.name = data.name.strip()
    audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="business_renamed",
          business_id=tenant.business_id, target_type="business", target_id=business.id, details={"name": business.name})
    await db.commit()
    await db.refresh(business)
    return business


@router.get("/users", response_model=list[TeamUserRead])
async def list_team(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    result = await db.execute(
        select(User).where(User.business_id == tenant.business_id).order_by(User.role, User.email)
    )
    return result.scalars().all()


@router.post("/users", response_model=TemporaryPasswordResponse, status_code=201)
async def create_team_member(
    data: TeamUserCreate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
    user_manager: UserManager = Depends(get_user_manager),
):
    user, password = await create_account(
        db,
        user_manager,
        email=data.email,
        username=data.username,
        full_name=data.full_name,
        business_id=tenant.business_id,
        role=UserRole(data.role),
    )
    audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="user_created",
          business_id=tenant.business_id, target_type="user", target_id=user.id,
          details={"email": user.email, "role": data.role})
    await db.commit()
    return TemporaryPasswordResponse(user_id=user.id, email=user.email, temporary_password=password)


@router.patch("/users/{user_id}", response_model=TeamUserRead)
async def update_team_member(
    user_id: UUID,
    data: TeamUserUpdate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
    user_manager: UserManager = Depends(get_user_manager),
):
    member = await _team_member(db, tenant, user_id)
    changes: dict = {}
    if data.full_name is not None:
        changes["full_name"] = data.full_name.strip() or None
    if data.role is not None and data.role != member.role.value:
        changes["role"] = UserRole(data.role)
    if data.is_active is not None and data.is_active != member.is_active:
        changes["is_active"] = data.is_active

    removes_owner = member.role == UserRole.owner and member.is_active and (
        changes.get("role") == UserRole.cashier or changes.get("is_active") is False
    )
    if removes_owner:
        if member.id == tenant.user_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_demote_yourself")
        if await active_owner_count(db, tenant.business_id) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="last_owner")
    if changes.get("is_active") is False and member.id == tenant.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_deactivate_yourself")

    if changes:
        if SESSION_ENDING_FIELDS & changes.keys():
            member = await user_manager.sign_out_everywhere(member, changes)
        else:
            member = await user_manager.user_db.update(member, changes)
        audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="user_updated",
              business_id=tenant.business_id, target_type="user", target_id=member.id,
              details={k: (v.value if isinstance(v, UserRole) else v) for k, v in changes.items()})
        await db.commit()
    return member


@router.post("/users/{user_id}/reset-password", response_model=TemporaryPasswordResponse)
async def reset_team_member_password(
    user_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
    user_manager: UserManager = Depends(get_user_manager),
):
    member = await _team_member(db, tenant, user_id)
    password = await reset_to_temporary_password(user_manager, member)
    audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="password_reset",
          business_id=tenant.business_id, target_type="user", target_id=member.id)
    await db.commit()
    return TemporaryPasswordResponse(user_id=member.id, email=member.email, temporary_password=password)
