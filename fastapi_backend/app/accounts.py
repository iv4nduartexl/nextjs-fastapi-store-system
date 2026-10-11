"""User account helpers shared by the owner team endpoints and the superuser admin panel."""
import secrets
import string
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from fastapi_users import exceptions
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models import AuditLog, User, UserRole
from app.schemas import UserCreate
from app.users import UserManager


def generate_temporary_password() -> str:
    """Readable random password that satisfies UserManager.validate_password."""
    alphabet = string.ascii_letters + string.digits
    body = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"{secrets.choice(string.ascii_uppercase)}{body}#{secrets.randbelow(90) + 10}"


def display_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.username or user.email


async def user_names(db: AsyncSession, user_ids) -> dict[UUID, str]:
    """{user_id: display name} for the given ids, in one query."""
    ids = {uid for uid in user_ids if uid is not None}
    if not ids:
        return {}
    result = await db.execute(select(User).where(User.id.in_(ids)))
    return {u.id: display_name(u) for u in result.scalars().all()}


def audit(
    db: AsyncSession,
    *,
    actor_id: UUID | None,
    action: str,
    business_id: UUID | None = None,
    target_type: str | None = None,
    target_id: Any = None,
    details: dict | None = None,
    impersonated_by: UUID | None = None,
) -> None:
    """Queue an audit entry; it is saved with the caller's commit."""
    db.add(
        AuditLog(
            actor_user_id=actor_id,
            impersonated_by=impersonated_by,
            business_id=business_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details,
        )
    )


async def create_account(
    db: AsyncSession,
    user_manager: UserManager,
    *,
    email: str,
    username: str | None,
    full_name: str | None,
    business_id: UUID | None,
    role: UserRole,
) -> tuple[User, str]:
    """Create a user with a temporary password they must change on first login."""
    username = (username or "").strip() or None
    if username:
        taken = await db.execute(select(User.id).where(func.lower(User.username) == username.lower()))
        if taken.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already in use")

    password = generate_temporary_password()
    try:
        user = await user_manager.create(
            UserCreate(email=email, password=password, username=username, is_verified=True),
            safe=True,
        )
    except exceptions.UserAlreadyExists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
    except exceptions.InvalidPasswordException as exc:  # pragma: no cover - generated passwords are valid
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc.reason))

    user = await user_manager.user_db.update(
        user,
        {
            "business_id": business_id,
            "role": role,
            "full_name": (full_name or "").strip() or None,
            "must_change_password": True,
        },
    )
    return user, password


async def reset_to_temporary_password(user_manager: UserManager, user: User) -> str:
    password = generate_temporary_password()
    await user_manager.user_db.update(
        user,
        {
            "hashed_password": user_manager.password_helper.hash(password),
            "must_change_password": True,
        },
    )
    return password


async def active_owner_count(db: AsyncSession, business_id: UUID) -> int:
    result = await db.execute(
        select(func.count(User.id)).where(
            User.business_id == business_id,
            User.role == UserRole.owner,
            User.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one()
