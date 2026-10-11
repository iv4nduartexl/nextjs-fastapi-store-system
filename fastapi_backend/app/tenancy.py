"""Business (tenant) isolation.

Layers, so a single forgotten filter can't leak another business's data:
1. Routes depend on `current_tenant` and filter explicitly by `tenant.business_id`.
2. `current_tenant` binds the business to the DB session; the listeners below then
   - add `business_id = <current business>` to every ORM SELECT on a TenantMixin model, and
   - refuse to flush a TenantMixin row belonging to another business (and stamp new rows).
"""
from dataclasses import dataclass
from typing import AsyncGenerator
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.database import get_async_session
from app.models import AuditLog, Business, TenantMixin, User, UserRole
from app.users import current_active_user, current_superuser, request_impersonator_id

SESSION_BUSINESS_KEY = "business_id"


class TenantIsolationError(RuntimeError):
    """Raised when code tries to write a row that belongs to another business."""


@dataclass(frozen=True)
class TenantContext:
    user: User
    business_id: UUID
    role: UserRole
    # Superuser id when this request uses a "view as" token
    impersonated_by: UUID | None = None

    @property
    def user_id(self) -> UUID:
        return self.user.id

    @property
    def is_owner(self) -> bool:
        return self.role == UserRole.owner


async def current_tenant(
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
) -> AsyncGenerator[TenantContext, None]:
    """The authenticated user's business. 403 for users without an active business."""
    if user.business_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User does not belong to a business")
    business = await db.get(Business, user.business_id)
    if business is None or not business.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Business is inactive")

    impersonated_by = request_impersonator_id(request)
    if impersonated_by and request.method not in ("GET", "HEAD", "OPTIONS"):
        # Every change made while "viewing as" a user is attributed to the superuser too
        db.add(
            AuditLog(
                actor_user_id=user.id,
                impersonated_by=impersonated_by,
                business_id=user.business_id,
                action="impersonated_write",
                target_type="request",
                target_id=f"{request.method} {request.url.path}",
            )
        )

    previous = db.info.get(SESSION_BUSINESS_KEY)
    db.info[SESSION_BUSINESS_KEY] = user.business_id
    try:
        yield TenantContext(
            user=user, business_id=user.business_id, role=user.role, impersonated_by=impersonated_by
        )
    finally:
        # Restore instead of clearing: the chat runs tools as nested requests on the same session in tests
        if previous is None:
            db.info.pop(SESSION_BUSINESS_KEY, None)
        else:
            db.info[SESSION_BUSINESS_KEY] = previous


async def require_owner(tenant: TenantContext = Depends(current_tenant)) -> TenantContext:
    """Owner-only operations (cancellations, statistics, team, settings)."""
    if not tenant.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners can do this")
    return tenant


async def require_superuser(user: User = Depends(current_superuser)) -> User:
    """Platform administrator. Impersonation tokens never grant this (they belong to the target user)."""
    return user


# ─── ORM safety net ──────────────────────────────────────────────────────────

@event.listens_for(Session, "do_orm_execute")
def _scope_selects_to_business(execute_state: ORMExecuteState) -> None:
    business_id = execute_state.session.info.get(SESSION_BUSINESS_KEY)
    if business_id is None or not execute_state.is_select or execute_state.is_column_load:
        return
    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            TenantMixin,
            lambda cls: cls.business_id == business_id,
            include_aliases=True,
        )
    )


@event.listens_for(Session, "before_flush")
def _guard_tenant_writes(session: Session, flush_context, instances) -> None:
    business_id = session.info.get(SESSION_BUSINESS_KEY)
    if business_id is None:
        return
    for obj in session.new:
        if isinstance(obj, TenantMixin):
            if obj.business_id is None:
                obj.business_id = business_id
            elif obj.business_id != business_id:
                raise TenantIsolationError(
                    f"Refusing to create {type(obj).__name__} for another business"
                )
    for obj in list(session.dirty) + list(session.deleted):
        if isinstance(obj, TenantMixin) and obj.business_id != business_id:
            raise TenantIsolationError(
                f"Refusing to modify {type(obj).__name__} of another business"
            )


async def get_business(db: AsyncSession, business_id: UUID) -> Business | None:
    result = await db.execute(select(Business).where(Business.id == business_id))
    return result.scalars().first()
