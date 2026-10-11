"""The signed-in user's own account: profile and password."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi_users import InvalidPasswordException
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts import audit
from app.database import get_async_session
from app.models import Business, User
from app.schemas import ChangePasswordRequest, MeRead, MeUpdate
from app.users import UserManager, current_active_user, get_user_manager, request_impersonator_id

router = APIRouter(tags=["account"])


async def _me(db: AsyncSession, user: User, request: Request) -> MeRead:
    business = await db.get(Business, user.business_id) if user.business_id else None
    impersonator_id = request_impersonator_id(request)
    impersonator = await db.get(User, impersonator_id) if impersonator_id else None
    return MeRead(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        is_superuser=user.is_superuser,
        must_change_password=user.must_change_password,
        business_id=user.business_id,
        business_name=business.name if business else None,
        impersonated_by=impersonator_id,
        impersonator_email=impersonator.email if impersonator else None,
    )


@router.get("/users/me", response_model=MeRead)
async def read_me(
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    return await _me(db, user, request)


@router.patch("/users/me", response_model=MeRead)
async def update_me(
    data: MeUpdate,
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    user = await user_manager.user_db.update(user, {"full_name": (data.full_name or "").strip() or None})
    return await _me(db, user, request)


@router.post("/auth/change-password", status_code=204)
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    if request_impersonator_id(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can't change a user's password while viewing as them; use the admin reset instead",
        )
    verified, _ = user_manager.password_helper.verify_and_update(data.current_password, user.hashed_password)
    if not verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="current_password_incorrect")
    if data.new_password == data.current_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password_unchanged")
    try:
        await user_manager.validate_password(data.new_password, user)
    except InvalidPasswordException as exc:
        reason = exc.reason if isinstance(exc.reason, list) else [exc.reason]
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "invalid_password", "reasons": reason})

    await user_manager.user_db.update(
        user,
        {"hashed_password": user_manager.password_helper.hash(data.new_password), "must_change_password": False},
    )
    audit(db, actor_id=user.id, action="password_changed", business_id=user.business_id, target_type="user", target_id=user.id)
    await db.commit()
