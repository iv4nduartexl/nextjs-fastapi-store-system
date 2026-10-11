"""Create (or repair) the platform superuser from SUPERUSER_EMAIL / SUPERUSER_PASSWORD.

Both values come from fastapi_backend/.env locally, or from the environment (GitHub secrets on deploy).

Usage, from fastapi_backend/ (or `make create-superuser` / `make reset-superuser-password`):
    uv run python -m commands.create_superuser               # create it if missing; asks for a password
                                                             # only when SUPERUSER_PASSWORD is empty
    uv run python -m commands.create_superuser --reset       # set the password (SUPERUSER_PASSWORD or prompt)
    uv run python -m commands.create_superuser --if-missing  # deploy: never prompts, never fails the deploy
"""
import argparse
import asyncio
import getpass
import sys

from fastapi_users import InvalidPasswordException
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.database import async_session_maker
from app.models import User
from app.schemas import UserCreate
from app.superuser import sync_superuser
from app.users import UserManager

PASSWORD_RULES = "8+ characters, one uppercase letter, one special character"

MESSAGES = {
    "skipped": "SUPERUSER_EMAIL not set, skipping superuser setup.",
    "exists": "Superuser {email} already exists; superuser rights verified.",
    "created": "Superuser {email} created.",
    "reset": "Password for superuser {email} updated; its existing sessions were signed out.",
    "not_found": "Superuser {email} doesn't exist yet; run `make create-superuser` first.",
    "missing_password": "WARNING: superuser {email} doesn't exist and SUPERUSER_PASSWORD is not set; not created.",
    "invalid_password": f"WARNING: the password doesn't meet the rules ({PASSWORD_RULES}); superuser {{email}} not changed.",
}


def _ask_password() -> str:
    while True:
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Repeat password: "):
            print("Passwords don't match, try again.")
            continue
        return password


def _manager(session: AsyncSession) -> UserManager:
    return UserManager(SQLAlchemyUserDatabase(session, User))


async def _find(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(func.lower(User.email) == email.lower()))
    return result.scalars().first()


async def _valid(manager: UserManager, email: str, password: str) -> bool:
    try:
        await manager.validate_password(password, UserCreate(email=email, password=password))
        return True
    except InvalidPasswordException:
        return False


async def ensure_superuser(session: AsyncSession, email: str | None, password: str | None) -> str:
    """Create the superuser only if missing. Never changes an existing password.

    Returns "skipped", "exists", "created", "missing_password" or "invalid_password".
    """
    email = (email or "").strip()
    if not email:
        return "skipped"
    manager = _manager(session)
    status = "exists"
    if await _find(session, email) is None:
        if not password:
            return "missing_password"
        if not await _valid(manager, email, password):
            return "invalid_password"
        user = await manager.create(UserCreate(email=email, password=password), safe=True)
        # The platform administrator belongs to no business
        await manager.user_db.update(user, {"business_id": None, "is_verified": True})
        status = "created"
    await sync_superuser(session)
    return status


async def reset_superuser_password(session: AsyncSession, email: str | None, password: str) -> str:
    """Set a new password for the existing superuser. Returns "skipped", "not_found", "invalid_password" or "reset"."""
    email = (email or "").strip()
    if not email:
        return "skipped"
    user = await _find(session, email)
    if user is None:
        return "not_found"
    manager = _manager(session)
    if not await _valid(manager, email, password):
        return "invalid_password"
    await manager.sign_out_everywhere(
        user, {"hashed_password": manager.password_helper.hash(password), "must_change_password": False}
    )
    await sync_superuser(session)
    return "reset"


async def run(mode: str) -> int:
    email = (settings.SUPERUSER_EMAIL or "").strip()
    password = settings.SUPERUSER_PASSWORD or None

    async with async_session_maker() as session:
        if mode == "if-missing":
            # Deploy: never prompt and never fail the pipeline
            status = await ensure_superuser(session, email, password)
            print(MESSAGES[status].format(email=email))
            return 0

        if not email:
            print("SUPERUSER_EMAIL is not set in fastapi_backend/.env (or the environment).")
            return 1

        if mode == "reset":
            status = await reset_superuser_password(session, email, password or _ask_password())
        else:
            # Local create: use SUPERUSER_PASSWORD, or ask only when the account is missing and it's empty
            if not password and await _find(session, email) is None:
                print(f"SUPERUSER_PASSWORD is empty; enter a password for {email} ({PASSWORD_RULES}).")
                password = _ask_password()
            status = await ensure_superuser(session, email, password)

    print(MESSAGES[status].format(email=email))
    return 0 if status in ("created", "exists", "reset") else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--reset", action="store_true", help="set the superuser's password (SUPERUSER_PASSWORD or prompt)")
    mode.add_argument(
        "--if-missing",
        action="store_true",
        help="non-interactive (deploy): create the superuser only if it doesn't exist; never fails",
    )
    args = parser.parse_args()
    selected = "reset" if args.reset else "if-missing" if args.if_missing else "create"
    sys.exit(asyncio.run(run(selected)))
