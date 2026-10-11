"""Create (or repair) the platform superuser defined by SUPERUSER_EMAIL.

Usage, from fastapi_backend/:
    uv run python -m commands.create_superuser            # create it, asking for a password
    uv run python -m commands.create_superuser --reset    # set a new password if it already exists
"""
import argparse
import asyncio
import getpass
import sys

from fastapi_users import InvalidPasswordException, exceptions
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy import func
from sqlalchemy.future import select

from app.config import settings
from app.database import async_session_maker
from app.models import User
from app.schemas import UserCreate
from app.superuser import sync_superuser
from app.users import UserManager


def _ask_password() -> str:
    while True:
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Repeat password: "):
            print("Passwords don't match, try again.")
            continue
        return password


async def main(reset: bool) -> int:
    email = (settings.SUPERUSER_EMAIL or "").strip()
    if not email:
        print("SUPERUSER_EMAIL is not set in the environment / .env")
        return 1

    async with async_session_maker() as session:
        manager = UserManager(SQLAlchemyUserDatabase(session, User))
        existing = (
            await session.execute(select(User).where(func.lower(User.email) == email.lower()))
        ).scalars().first()

        if existing and not reset:
            print(f"{email} already exists; making sure it is the superuser. Use --reset to set a new password.")
        else:
            print(f"{'Reset password for' if existing else 'Creating'} superuser {email}")
            while True:
                password = _ask_password()
                try:
                    await manager.validate_password(password, existing or UserCreate(email=email, password=password))
                    break
                except InvalidPasswordException as exc:
                    print("Invalid password:", exc.reason)
            if existing:
                await manager.user_db.update(
                    existing,
                    {"hashed_password": manager.password_helper.hash(password), "must_change_password": False},
                )
            else:
                try:
                    user = await manager.create(UserCreate(email=email, password=password), safe=True)
                except exceptions.UserAlreadyExists:  # pragma: no cover - checked above
                    print("User already exists")
                    return 1
                # The platform administrator belongs to no business
                await manager.user_db.update(user, {"business_id": None, "is_verified": True})

        await sync_superuser(session)
    print("Done. Log in with this email to open the admin panel.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="set a new password for an existing superuser")
    sys.exit(asyncio.run(main(parser.parse_args().reset)))
