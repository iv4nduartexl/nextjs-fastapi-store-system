"""Phase 2/3: owner/cashier roles, team management, superuser admin and impersonation."""
import uuid

import pytest
from fastapi import status
from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from app.config import settings
from app.models import AuditLog, Business, User, UserRole
from app.superuser import sync_superuser
from app.users import get_jwt_strategy

PASSWORD = "TestPassword123#"


async def _user(db_session, *, email, business=None, role=UserRole.owner, superuser=False):
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password=PasswordHelper().hash(PASSWORD),
        is_active=True,
        is_superuser=superuser,
        is_verified=True,
        business_id=business.id if business else None,
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    token = await get_jwt_strategy().write_token(user)
    return user, {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def store(db_session):
    business = Business(id=uuid.uuid4(), name="Store")
    db_session.add(business)
    await db_session.commit()
    owner, owner_h = await _user(db_session, email="owner@store.com", business=business)
    cashier, cashier_h = await _user(db_session, email="cashier@store.com", business=business, role=UserRole.cashier)
    admin, admin_h = await _user(db_session, email="admin@platform.com", superuser=True)
    return {
        "business": business,
        "owner": owner, "owner_h": owner_h,
        "cashier": cashier, "cashier_h": cashier_h,
        "admin": admin, "admin_h": admin_h,
    }


async def _login(test_client, email, password):
    response = await test_client.post("/auth/jwt/login", data={"username": email, "password": password})
    assert response.status_code == status.HTTP_200_OK, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _make_item_and_sale(test_client, headers):
    item = (await test_client.post("/items/", json={"name": "Cola", "price": "5", "stock": "10"}, headers=headers)).json()
    sale = await test_client.post(
        "/sales/", json={"items": [{"item_id": item["id"], "quantity": "1"}]}, headers=headers
    )
    assert sale.status_code == status.HTTP_200_OK, sale.text
    return item, sale.json()


# ─── Roles ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_cashier_is_limited_to_daily_operations(test_client, store):
    ch, oh = store["cashier_h"], store["owner_h"]
    item, sale = await _make_item_and_sale(test_client, ch)
    assert sale["user_name"] == "cashier@store.com"

    assert (await test_client.post("/cashbox/session/open", json={"opening_amount": "0"}, headers=ch)).status_code == 201

    forbidden = [
        ("post", f"/sales/{sale['id']}/cancel", {}),
        ("get", "/sales/analytics/summary", None),
        ("post", "/sales/discount-rules", {"name": "x", "scope": "global", "min_qty": "1", "rule_type": "percent", "percent_off": "5"}),
        ("delete", f"/items/{item['id']}", None),
        ("get", "/ai-settings", None),
        ("put", "/ai-settings", {"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "m"}),
        ("get", "/business/users", None),
        ("post", "/business/users", {"email": "x@store.com"}),
        ("patch", "/business", {"name": "Hacked"}),
    ]
    for method, path, payload in forbidden:
        kwargs = {"headers": ch} | ({"json": payload} if payload is not None else {})
        response = await getattr(test_client, method)(path, **kwargs)
        assert response.status_code == status.HTTP_403_FORBIDDEN, (method, path, response.status_code)

    # The owner can, and sees who made the sale
    assert (await test_client.get("/sales/analytics/summary", headers=oh)).status_code == 200
    cancel = await test_client.post(f"/sales/{sale['id']}/cancel", json={"reason": "x"}, headers=oh)
    assert cancel.status_code == 200
    assert cancel.json()["cancelled_by_name"] == "owner@store.com"
    assert cancel.json()["user_name"] == "cashier@store.com"

    mine = await test_client.get("/sales/", params={"user_id": str(store["owner"].id)}, headers=oh)
    assert mine.json()["items"] == []


def test_cashier_chat_has_no_owner_tools():
    from app.main import mcp
    from app.routes.chat import _tool_specs

    _, owner_tools = _tool_specs(mcp, is_owner=True)
    _, cashier_tools = _tool_specs(mcp, is_owner=False)
    assert "sales-cancel_sale" in owner_tools and "sales-cancel_sale" not in cashier_tools
    assert not any(name.startswith("sales-analytics_") for name in cashier_tools)
    assert "sales-create_sale" in cashier_tools


# ─── Team management ─────────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_owner_creates_cashier_who_must_change_password(test_client, store):
    oh = store["owner_h"]
    created = await test_client.post(
        "/business/users", json={"email": "new@store.com", "full_name": "Ana", "role": "cashier"}, headers=oh
    )
    assert created.status_code == status.HTTP_201_CREATED, created.text
    temp = created.json()["temporary_password"]

    headers = await _login(test_client, "new@store.com", temp)
    me = (await test_client.get("/users/me", headers=headers)).json()
    assert me["must_change_password"] is True
    assert me["role"] == "cashier" and me["business_name"] == "Store"

    wrong = await test_client.post(
        "/auth/change-password", json={"current_password": "nope", "new_password": "NewPassword1#"}, headers=headers
    )
    assert wrong.status_code == status.HTTP_400_BAD_REQUEST
    weak = await test_client.post(
        "/auth/change-password", json={"current_password": temp, "new_password": "weak"}, headers=headers
    )
    assert weak.status_code == status.HTTP_400_BAD_REQUEST
    ok = await test_client.post(
        "/auth/change-password", json={"current_password": temp, "new_password": "NewPassword1#"}, headers=headers
    )
    assert ok.status_code == status.HTTP_200_OK
    headers = await _login(test_client, "new@store.com", "NewPassword1#")
    assert (await test_client.get("/users/me", headers=headers)).json()["must_change_password"] is False

    team = (await test_client.get("/business/users", headers=oh)).json()
    assert {u["email"] for u in team} == {"owner@store.com", "cashier@store.com", "new@store.com"}

    duplicate = await test_client.post("/business/users", json={"email": "new@store.com"}, headers=oh)
    assert duplicate.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio(loop_scope="function")
async def test_owner_guardrails(test_client, db_session, store):
    oh, owner = store["owner_h"], store["owner"]
    me = await test_client.patch(f"/business/users/{owner.id}", json={"role": "cashier"}, headers=oh)
    assert me.status_code == status.HTTP_400_BAD_REQUEST
    me = await test_client.patch(f"/business/users/{owner.id}", json={"is_active": False}, headers=oh)
    assert me.status_code == status.HTTP_400_BAD_REQUEST

    # Deactivating a cashier blocks their access
    cashier = store["cashier"]
    response = await test_client.patch(f"/business/users/{cashier.id}", json={"is_active": False}, headers=oh)
    assert response.status_code == 200 and response.json()["is_active"] is False
    assert (await test_client.get("/items/", headers=store["cashier_h"])).status_code == status.HTTP_401_UNAUTHORIZED

    # Reset password returns a working temporary password
    await test_client.patch(f"/business/users/{cashier.id}", json={"is_active": True}, headers=oh)
    reset = await test_client.post(f"/business/users/{cashier.id}/reset-password", headers=oh)
    await _login(test_client, "cashier@store.com", reset.json()["temporary_password"])

    # Users of other businesses are invisible
    other_business = Business(id=uuid.uuid4(), name="Other")
    db_session.add(other_business)
    await db_session.commit()
    stranger, _ = await _user(db_session, email="stranger@other.com", business=other_business)
    for method, path, payload in [
        ("patch", f"/business/users/{stranger.id}", {"is_active": False}),
        ("post", f"/business/users/{stranger.id}/reset-password", None),
    ]:
        kwargs = {"headers": oh} | ({"json": payload} if payload is not None else {})
        assert (await getattr(test_client, method)(path, **kwargs)).status_code == status.HTTP_404_NOT_FOUND


# ─── Superuser admin ─────────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_admin_endpoints_are_superuser_only(test_client, store):
    for headers in (store["owner_h"], store["cashier_h"]):
        assert (await test_client.get("/admin/businesses", headers=headers)).status_code == status.HTTP_403_FORBIDDEN
        assert (
            await test_client.post(f"/admin/impersonate/{store['cashier'].id}", headers=headers)
        ).status_code == status.HTTP_403_FORBIDDEN
    # The superuser has no business, so store endpoints are closed to it
    assert (await test_client.get("/items/", headers=store["admin_h"])).status_code == status.HTTP_403_FORBIDDEN
    assert (await test_client.post("/auth/register", json={"email": "a@b.com", "password": PASSWORD})).status_code == 404


@pytest.mark.asyncio(loop_scope="function")
async def test_admin_creates_business_and_manages_users(test_client, store):
    ah = store["admin_h"]
    created = await test_client.post(
        "/admin/businesses", json={"name": "New Shop", "owner_email": "boss@newshop.com"}, headers=ah
    )
    assert created.status_code == status.HTTP_201_CREATED, created.text
    body = created.json()
    business_id = body["business"]["id"]
    owner_h = await _login(test_client, "boss@newshop.com", body["owner"]["temporary_password"])
    me = (await test_client.get("/users/me", headers=owner_h)).json()
    assert me["role"] == "owner" and me["business_name"] == "New Shop"

    businesses = {b["name"]: b for b in (await test_client.get("/admin/businesses", headers=ah)).json()}
    assert businesses["Store"]["user_count"] == 2 and businesses["New Shop"]["user_count"] == 1

    users = (await test_client.get("/admin/users", params={"business_id": business_id}, headers=ah)).json()
    assert [u["email"] for u in users] == ["boss@newshop.com"]

    # Move the existing cashier to the new business, then reset their password
    cashier = store["cashier"]
    moved = await test_client.patch(f"/admin/users/{cashier.id}", json={"business_id": business_id}, headers=ah)
    assert moved.json()["business_name"] == "New Shop"
    reset = await test_client.post(f"/admin/users/{cashier.id}/reset-password", headers=ah)
    await _login(test_client, "cashier@store.com", reset.json()["temporary_password"])

    # Deactivating a business locks out its users
    await test_client.patch(f"/admin/businesses/{business_id}", json={"is_active": False}, headers=ah)
    assert (await test_client.get("/items/", headers=owner_h)).status_code == status.HTTP_403_FORBIDDEN

    # The superuser can't be edited through the admin API
    assert (
        await test_client.patch(f"/admin/users/{store['admin'].id}", json={"is_active": False}, headers=ah)
    ).status_code == status.HTTP_400_BAD_REQUEST

    logs = (await test_client.get("/admin/audit-logs", headers=ah)).json()
    actions = {item["action"] for item in logs["items"]}
    assert {"business_created", "user_updated", "password_reset", "business_updated"} <= actions


@pytest.mark.asyncio(loop_scope="function")
async def test_impersonation(test_client, db_session, store):
    ah, cashier = store["admin_h"], store["cashier"]
    response = await test_client.post(f"/admin/impersonate/{cashier.id}", headers=ah)
    assert response.status_code == status.HTTP_200_OK, response.text
    imp_h = {"Authorization": f"Bearer {response.json()['access_token']}"}

    me = (await test_client.get("/users/me", headers=imp_h)).json()
    assert me["email"] == "cashier@store.com"
    assert me["impersonated_by"] == str(store["admin"].id)
    assert me["impersonator_email"] == "admin@platform.com"

    # Acts as the cashier, with every write attributed to the superuser in the audit log
    _, sale = await _make_item_and_sale(test_client, imp_h)
    assert sale["user_name"] == "cashier@store.com"
    writes = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "impersonated_write"))
    ).scalars().all()
    assert {w.target_id for w in writes} == {"POST /items/", "POST /sales/"}
    assert all(w.impersonated_by == store["admin"].id for w in writes)

    # It can't reach the admin panel or change the user's password
    assert (await test_client.get("/admin/businesses", headers=imp_h)).status_code == status.HTTP_403_FORBIDDEN
    assert (
        await test_client.post(
            "/auth/change-password", json={"current_password": PASSWORD, "new_password": "Other123#x"}, headers=imp_h
        )
    ).status_code == status.HTTP_403_FORBIDDEN

    # If the superuser loses the role, outstanding impersonation tokens stop working
    store["admin"].is_superuser = False
    await db_session.commit()
    assert (await test_client.get("/users/me", headers=imp_h)).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio(loop_scope="function")
async def test_superuser_role_follows_superuser_email(db_session, store, monkeypatch):
    monkeypatch.setattr(settings, "SUPERUSER_EMAIL", "OWNER@store.com")
    await sync_superuser(db_session)
    users = {
        u.email: u.is_superuser
        for u in (await db_session.execute(select(User).execution_options(populate_existing=True))).scalars().all()
    }
    assert users == {"owner@store.com": True, "cashier@store.com": False, "admin@platform.com": False}


# ─── Sessions and sign-in throttling ─────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_reset_deactivate_and_password_change_end_sessions(test_client, store):
    oh, cashier = store["owner_h"], store["cashier"]
    old_session = await _login(test_client, "cashier@store.com", PASSWORD)
    assert (await test_client.get("/users/me", headers=old_session)).status_code == 200

    # Owner resets the password: the cashier's open sessions stop working at once
    temp = (await test_client.post(f"/business/users/{cashier.id}/reset-password", headers=oh)).json()["temporary_password"]
    assert (await test_client.get("/users/me", headers=old_session)).status_code == status.HTTP_401_UNAUTHORIZED

    # Changing the password signs out other devices but returns a fresh token for this one
    device_a = await _login(test_client, "cashier@store.com", temp)
    device_b = await _login(test_client, "cashier@store.com", temp)
    changed = await test_client.post(
        "/auth/change-password", json={"current_password": temp, "new_password": "BrandNew1#"}, headers=device_a
    )
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert (await test_client.get("/users/me", headers=device_b)).status_code == status.HTTP_401_UNAUTHORIZED
    assert (await test_client.get("/users/me", headers=fresh)).status_code == 200

    # Role changes and deactivation also end sessions
    await test_client.patch(f"/business/users/{cashier.id}", json={"role": "owner"}, headers=oh)
    assert (await test_client.get("/users/me", headers=fresh)).status_code == status.HTTP_401_UNAUTHORIZED

    # Renaming doesn't
    session = await _login(test_client, "cashier@store.com", "BrandNew1#")
    await test_client.patch(f"/business/users/{cashier.id}", json={"full_name": "Carla"}, headers=oh)
    assert (await test_client.get("/users/me", headers=session)).status_code == 200


@pytest.mark.asyncio(loop_scope="function")
async def test_too_many_failed_logins_are_blocked(test_client, store):
    for _ in range(10):
        response = await test_client.post(
            "/auth/jwt/login", data={"username": "owner@store.com", "password": "wrong"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    blocked = await test_client.post("/auth/jwt/login", data={"username": "owner@store.com", "password": PASSWORD})
    assert blocked.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert blocked.json()["detail"] == "LOGIN_TOO_MANY_ATTEMPTS"

    # Other accounts are unaffected
    await _login(test_client, "cashier@store.com", PASSWORD)


@pytest.mark.asyncio(loop_scope="function")
async def test_successful_login_clears_failures(test_client, store):
    for _ in range(9):
        await test_client.post("/auth/jwt/login", data={"username": "owner@store.com", "password": "wrong"})
    await _login(test_client, "owner@store.com", PASSWORD)
    for _ in range(9):
        await test_client.post("/auth/jwt/login", data={"username": "owner@store.com", "password": "wrong"})
    await _login(test_client, "owner@store.com", PASSWORD)
