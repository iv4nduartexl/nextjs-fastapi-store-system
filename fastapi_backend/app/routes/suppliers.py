from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_async_session
from app.models import Supplier
from app.schemas import SupplierCreate, SupplierRead
from app.tenancy import TenantContext, current_tenant

router = APIRouter(tags=["suppliers"])


async def upsert_supplier(
    supplier: SupplierCreate | None, tenant: TenantContext, db: AsyncSession
) -> Supplier | None:
    """Return the business's supplier for this id (renaming it if needed), or create a new one by name."""
    if not supplier or (not supplier.name and not supplier.id):
        return None

    if supplier.id:
        result = await db.execute(
            select(Supplier).where(
                Supplier.id == supplier.id, Supplier.business_id == tenant.business_id
            )
        )
        existing = result.scalars().first()
        if existing:
            if supplier.name and supplier.name != existing.name:
                existing.name = supplier.name
                await db.commit()
            return existing
        # An id from another business (or a stale one) is never reused; fall back to the name

    if supplier.name:
        new_supplier = Supplier(
            name=supplier.name, business_id=tenant.business_id, user_id=tenant.user_id
        )
        db.add(new_supplier)
        await db.commit()
        await db.refresh(new_supplier)
        return new_supplier
    return None


@router.get("/", response_model=list[SupplierRead])
async def search_suppliers(
    q: str | None = Query(None, description="Search prefix"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    query = select(Supplier.id, Supplier.name).where(Supplier.business_id == tenant.business_id)
    if q and q.strip():
        query = query.filter(Supplier.name.ilike(f"%{q.strip()}%"))
    query = query.order_by(Supplier.name).limit(limit)
    result = await db.execute(query)
    return [SupplierRead.model_validate(row) for row in result.mappings().all()]
