"""commands/create_superuser.py --if-missing: the non-interactive mode used by the deploy."""
import uuid

import pytest
from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from app.config import settings
from app.models import User
from commands.create_superuser import ensure_superuser, reset_superuser_password

PASSWORD = "SuperPass1#"


async def _users(db_session):
    result = await db_session.execute(select(User).execution_options(populate_existing=True))
    return {u.email: u for u in result.scalars().all()}


@pytest.mark.asyncio(loop_scope="function")
async def test_no_email_does_nothing(db_session, monkeypatch):
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", None)
    assert await ensure_superuser(db_session, None, PASSWORD) == "skipped"
    assert await _users(db_session) == {}


@pytest.mark.asyncio(loop_scope="function")
async def test_creates_missing_superuser(db_session, monkeypatch):
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", "admin@platform.com")
    assert await ensure_superuser(db_session, "admin@platform.com", PASSWORD) == "created"
    admin = (await _users(db_session))["admin@platform.com"]
    assert admin.is_superuser and admin.is_active and admin.business_id is None
    assert PasswordHelper().verify_and_update(PASSWORD, admin.hashed_password)[0]


@pytest.mark.asyncio(loop_scope="function")
async def test_existing_superuser_password_is_untouched(db_session, monkeypatch):
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", "admin@platform.com")
    await ensure_superuser(db_session, "admin@platform.com", PASSWORD)
    before = (await _users(db_session))["admin@platform.com"].hashed_password

    # A later deploy with a different secret doesn't change the password
    assert await ensure_superuser(db_session, "admin@platform.com", "OtherPass1#") == "exists"
    after = (await _users(db_session))["admin@platform.com"]
    assert after.hashed_password == before and after.is_superuser


@pytest.mark.asyncio(loop_scope="function")
async def test_missing_or_weak_password_does_not_create(db_session, monkeypatch):
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", "admin@platform.com")
    assert await ensure_superuser(db_session, "admin@platform.com", None) == "missing_password"
    assert await ensure_superuser(db_session, "admin@platform.com", "weak") == "invalid_password"
    assert await _users(db_session) == {}


@pytest.mark.asyncio(loop_scope="function")
async def test_other_superusers_lose_the_flag(db_session, monkeypatch):
    db_session.add(
        User(id=uuid.uuid4(), email="old@platform.com", hashed_password="x", is_active=True, is_superuser=True, is_verified=True)
    )
    await db_session.commit()
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", "admin@platform.com")
    await ensure_superuser(db_session, "admin@platform.com", PASSWORD)
    users = await _users(db_session)
    assert users["admin@platform.com"].is_superuser is True
    assert users["old@platform.com"].is_superuser is False


@pytest.mark.asyncio(loop_scope="function")
async def test_reset_sets_password_and_signs_out(db_session, monkeypatch):
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", "admin@platform.com")
    await ensure_superuser(db_session, "admin@platform.com", PASSWORD)
    version = (await _users(db_session))["admin@platform.com"].token_version

    assert await reset_superuser_password(db_session, "admin@platform.com", "weak") == "invalid_password"
    assert await reset_superuser_password(db_session, "admin@platform.com", "NewSuper1#") == "reset"
    admin = (await _users(db_session))["admin@platform.com"]
    assert PasswordHelper().verify_and_update("NewSuper1#", admin.hashed_password)[0]
    assert admin.token_version == version + 1

    assert await reset_superuser_password(db_session, "missing@platform.com", "NewSuper1#") == "not_found"
