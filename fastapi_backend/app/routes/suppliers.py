from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_async_session
from app.models import Supplier
from app.schemas import SupplierCreate, SupplierRead

router = APIRouter(tags=["suppliers"])

async def upsert_supplier(supplier: SupplierCreate | None, db: AsyncSession) -> Supplier | None:
    # 1. Fixed condition using explicit parentheses
    if not supplier or (not supplier.name and not supplier.id):
        return None

    # Case A: ID is provided -> Check if it exists or use it for upsert
    if supplier.id:
        stmt = (
            pg_insert(Supplier)
            .values(id=supplier.id, name=supplier.name)
            .on_conflict_do_update(
                index_elements=[Supplier.id], # Conflict target is now ID
                set_={Supplier.name: supplier.name} # Update name if ID matched
            )
            .returning(Supplier)
        )
        result = await db.execute(stmt)
        await db.commit()
        return result.scalar_one_or_none()

    # Case B: ID is None, Name is present creates a new one)
    if supplier.name:        
        # Create a brand new item since it didn't exist by name
        new_supplier = Supplier(name=supplier.name)
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
):
    query = select(Supplier.id, Supplier.name)
    if q and q.strip():
        query = query.filter(Supplier.name.ilike(f"%{q.strip()}%"))
    query = query.order_by(Supplier.name).limit(limit)
    result = await db.execute(query)
    return [SupplierRead.model_validate(row) for row in result.mappings().all()]
