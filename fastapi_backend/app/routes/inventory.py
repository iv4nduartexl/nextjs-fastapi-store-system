"""Stock counts: an owner counts the shelves and the differences are applied in one go."""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.accounts import audit
from app.database import get_async_session
from app.models import InventoryCount, InventoryCountLine, Item
from app.schemas import InventoryCountCreate, InventoryCountRead, InventoryCountSummary
from app.tenancy import TenantContext, require_owner

router = APIRouter(tags=["inventory"])

HISTORY_LIMIT = 100


@router.post("/counts", response_model=InventoryCountRead, status_code=201)
async def apply_count(
    data: InventoryCountCreate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    """Apply a count. Each product moves by (counted − stock seen when counting), never below 0,
    so sales made while counting are not lost."""
    category = (data.category or "").strip() or None
    counted_by_item = {line.item_id: line for line in data.lines}

    active = (Item.business_id == tenant.business_id, Item.is_deleted == False)  # noqa: E712
    ids = set(counted_by_item)
    if data.zero_uncounted:
        scope = select(Item.id).where(*active)
        if category:
            scope = scope.where(Item.category == category)
        ids |= set((await db.execute(scope)).scalars().all())
    items = (
        await db.execute(select(Item).where(*active, Item.id.in_(ids)).order_by(Item.id).with_for_update())
    ).scalars().all()

    unknown = set(counted_by_item) - {item.id for item in items}
    if unknown:
        raise HTTPException(status_code=422, detail={"code": "unknown_items", "items": sorted(map(str, unknown))})

    count = InventoryCount(business_id=tenant.business_id, user_id=tenant.user_id, category=category, notes=(data.notes or "").strip() or None)
    changed = 0
    for item in items:
        line = counted_by_item.get(item.id)
        previous = item.stock
        if line is not None:
            expected, counted = line.expected, line.counted
            new_stock = max(Decimal("0"), previous + (counted - expected))
        elif data.zero_uncounted and previous > 0:
            expected, counted, new_stock = previous, Decimal("0"), Decimal("0")
        else:
            continue
        if new_stock != previous:
            changed += 1
        item.stock = new_stock
        count.lines.append(
            InventoryCountLine(
                item_id=item.id, item_name=item.name, unit_type=item.unit_type,
                expected=expected, counted=counted, previous_stock=previous, new_stock=new_stock,
            )
        )

    count.lines_counted = len(count.lines)
    count.lines_changed = changed
    db.add(count)
    await db.flush()
    audit(db, actor_id=tenant.user_id, impersonated_by=tenant.impersonated_by, action="inventory_count_applied",
          business_id=tenant.business_id, target_type="inventory_count", target_id=count.id,
          details={"category": category, "counted": count.lines_counted, "changed": changed})
    await db.commit()
    return await _get_count(db, tenant, count.id)


@router.get("/counts", response_model=list[InventoryCountSummary])
async def list_counts(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    result = await db.execute(
        select(InventoryCount)
        .where(InventoryCount.business_id == tenant.business_id)
        .order_by(InventoryCount.applied_at.desc())
        .limit(HISTORY_LIMIT)
    )
    return result.scalars().unique().all()


@router.get("/counts/{count_id}", response_model=InventoryCountRead)
async def get_count(
    count_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(require_owner),
):
    return await _get_count(db, tenant, count_id)


async def _get_count(db: AsyncSession, tenant: TenantContext, count_id: UUID) -> InventoryCount:
    count = (
        await db.execute(
            select(InventoryCount)
            .where(InventoryCount.id == count_id, InventoryCount.business_id == tenant.business_id)
            .execution_options(populate_existing=True)
        )
    ).scalars().first()
    if count is None:
        raise HTTPException(status_code=404, detail="Count not found")
    return count
