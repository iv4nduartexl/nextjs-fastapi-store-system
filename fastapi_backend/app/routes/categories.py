from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_async_session
from app.models import Category
from app.tenancy import TenantContext, current_tenant

router = APIRouter(tags=["categories"])


async def upsert_category(name: str, tenant: TenantContext, db: AsyncSession) -> None:
    """Insert category if it doesn't exist in this business. Silent on conflict."""
    if not name or not name.strip():
        return
    stmt = (
        pg_insert(Category)
        .values(name=name.strip(), business_id=tenant.business_id, user_id=tenant.user_id)
        .on_conflict_do_nothing(constraint="uq_category_business_name")
    )
    await db.execute(stmt)


@router.get("/", response_model=list[str])
async def search_categories(
    q: str | None = Query(None, description="Search prefix"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    query = select(Category.name).filter(Category.business_id == tenant.business_id)
    if q and q.strip():
        query = query.filter(Category.name.ilike(f"%{q.strip()}%"))
    query = query.order_by(Category.name).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
