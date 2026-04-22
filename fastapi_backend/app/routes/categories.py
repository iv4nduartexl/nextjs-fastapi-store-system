from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import User, get_async_session
from app.models import Category
from app.users import current_active_user

router = APIRouter(tags=["categories"])


async def upsert_category(name: str, user_id, db: AsyncSession) -> None:
    """Insert category if it doesn't exist for this user. Silent on conflict."""
    if not name or not name.strip():
        return
    stmt = (
        pg_insert(Category)
        .values(name=name.strip(), user_id=user_id)
        .on_conflict_do_nothing(constraint="uq_category_name_user")
    )
    await db.execute(stmt)


@router.get("/", response_model=list[str])
async def search_categories(
    q: str | None = Query(None, description="Search prefix"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    query = select(Category.name).filter(Category.user_id == user.id)
    if q and q.strip():
        query = query.filter(Category.name.ilike(f"%{q.strip()}%"))
    query = query.order_by(Category.name).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()
