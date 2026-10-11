"""Business isolation: a user must never read or change another business's data."""
import uuid
from decimal import Decimal

import pytest
import pytest_asyncio
from fastapi import status
from fastapi.routing import APIRoute
from fastapi_users.password import PasswordHelper
from sqlalchemy import select

from app.main import app
from app.models import Business, ChatConversation, Item, Supplier, User
from app.tenancy import SESSION_BUSINESS_KEY, TenantIsolationError, current_tenant, require_superuser
from app.users import get_jwt_strategy


async def _make_business_user(db_session, name: str):
    business = Business(id=uuid.uuid4(), name=name)
    db_session.add(business)
    await db_session.flush()
    user = User(
        id=uuid.uuid4(),
        email=f"{name.lower().replace(' ', '')}@example.com",
        hashed_password=PasswordHelper().hash("TestPassword123#"),
        is_active=True,
        is_superuser=False,
        is_verified=True,
        business_id=business.id,
    )
    db_session.add(user)
    await db_session.commit()
    token = await get_jwt_strategy().write_token(user)
    return {"business": business, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest_asyncio.fixture
async def two_businesses(test_client, db_session):
    """Business B with data in every module, created through the API; business A starts empty."""
    a = await _make_business_user(db_session, "Store A")
    b = await _make_business_user(db_session, "Store B")
    hb = b["headers"]

    async def post(path, payload, expected=(200, 201)):
        response = await test_client.post(path, json=payload, headers=hb)
        assert response.status_code in expected, (path, response.text)
        return response.json()

    session = await post("/cashbox/session/open", {"opening_amount": "100"})
    item = await post("/items/", {"name": "Secret Cola", "sku": "SKU-1", "price": "5", "stock": "10", "category": "Drinks"})
    customer = await post("/customers/", {"name": "Secret Customer", "credit_limit": "1000"})
    sale = await post(
        "/sales/",
        {"items": [{"item_id": item["id"], "quantity": "1"}], "payment_method": "credit", "customer_id": customer["id"]},
    )
    payment = await post(f"/customers/{customer['id']}/payments", {"amount": "1"})
    outcome = await post(f"/customers/{customer['id']}/outcomes", {"amount": "2", "description": "x"})
    purchase = await post(
        "/purchases/",
        {
            "supplier": {"name": "Secret Supplier"},
            "items": [{"item_id": item["id"], "item_name": "Secret Cola", "quantity": "5", "total_cost_price": "10"}],
        },
    )
    rule = await post(
        "/sales/discount-rules",
        {"name": "Secret rule", "scope": "item", "item_id": item["id"], "min_qty": "2", "rule_type": "percent", "percent_off": "10"},
    )
    await test_client.put(
        "/ai-settings",
        json={"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "secret-model", "api_key": "sk-secret"},
        headers=hb,
    )
    conversation = ChatConversation(business_id=b["business"].id, user_id=b["user"].id, title="Secret chat")
    db_session.add(conversation)
    await db_session.commit()

    b["ids"] = {
        "session": session["id"],
        "item": item["id"],
        "customer": customer["id"],
        "sale": sale["id"],
        "payment": payment["id"],
        "outcome": outcome["id"],
        "purchase": purchase["id"],
        "supplier": purchase["supplier"]["id"] if purchase.get("supplier") else None,
        "rule": rule["id"],
        "conversation": str(conversation.id),
    }
    return a, b


async def _item_state(db_session, item_id):
    result = await db_session.execute(
        select(Item).where(Item.id == uuid.UUID(item_id)).execution_options(populate_existing=True)
    )
    return result.scalar_one()


@pytest.mark.asyncio(loop_scope="function")
async def test_lists_and_searches_hide_other_business(test_client, two_businesses):
    a, b = two_businesses
    ha = a["headers"]

    list_endpoints = [
        "/items/",
        "/sales/",
        "/purchases/",
        "/customers/",
        "/cashbox/sessions",
        "/cashbox/transactions",
        "/sales/discount-rules",
        "/suppliers/",
        "/categories/",
        "/chat/conversations",
        "/assistant/products/search?q=secret",
        "/assistant/customers/search?q=secret",
    ]
    for path in list_endpoints:
        response = await test_client.get(path, headers=ha)
        assert response.status_code == status.HTTP_200_OK, (path, response.text)
        body = response.text
        for secret in ("Secret", "SKU-1", "Drinks", b["ids"]["item"], b["ids"]["customer"], b["ids"]["sale"]):
            assert secret not in body, f"{path} leaked {secret}"

    current = await test_client.get("/cashbox/session/current", headers=ha)
    assert current.status_code == status.HTTP_404_NOT_FOUND

    summary = (await test_client.get("/sales/analytics/summary?period=all", headers=ha)).json()
    assert summary["totalOrders"] == 0
    snapshot = (await test_client.get("/assistant/snapshot", headers=ha)).json()
    assert snapshot["sales_count"] == 0 and snapshot["cashbox_open"] is False

    settings = (await test_client.get("/ai-settings", headers=ha)).json()
    assert settings["model"] != "secret-model" and settings["is_custom"] is False


@pytest.mark.asyncio(loop_scope="function")
async def test_detail_endpoints_return_404(test_client, two_businesses):
    a, b = two_businesses
    ids = b["ids"]
    for path in [
        f"/sales/{ids['sale']}",
        f"/purchases/{ids['purchase']}",
        f"/customers/{ids['customer']}",
        f"/cashbox/sessions/{ids['session']}",
        f"/assistant/products/{ids['item']}",
        f"/chat/conversations/{ids['conversation']}",
    ]:
        response = await test_client.get(path, headers=a["headers"])
        assert response.status_code == status.HTTP_404_NOT_FOUND, (path, response.status_code)


@pytest.mark.asyncio(loop_scope="function")
async def test_writes_cannot_touch_other_business(test_client, db_session, two_businesses):
    a, b = two_businesses
    ha, ids = a["headers"], b["ids"]
    stock_before = (await _item_state(db_session, ids["item"])).stock

    attempts = [
        ("patch", f"/items/{ids['item']}", {"price": "1"}),
        ("delete", f"/items/{ids['item']}", None),
        ("post", f"/sales/{ids['sale']}/cancel", {}),
        ("post", f"/purchases/{ids['purchase']}/cancel", {"force": True}),
        ("patch", f"/customers/{ids['customer']}", {"name": "Hacked"}),
        ("post", f"/customers/{ids['customer']}/payments", {"amount": "999"}),
        ("post", f"/customers/{ids['customer']}/outcomes", {"amount": "1", "description": "x"}),
        ("delete", f"/customers/{ids['customer']}/payments/{ids['payment']}", None),
        ("delete", f"/customers/{ids['customer']}/outcomes/{ids['outcome']}", None),
        ("patch", f"/sales/discount-rules/{ids['rule']}", {"name": "Hacked"}),
        ("delete", f"/sales/discount-rules/{ids['rule']}", None),
        ("patch", f"/chat/conversations/{ids['conversation']}", {"title": "Hacked"}),
        ("delete", f"/chat/conversations/{ids['conversation']}", None),
        # Referencing another business's ids inside a payload
        ("post", "/sales/", {"items": [{"item_id": ids["item"], "quantity": "1"}]}),
        ("post", "/sales/", {"items": [], "payment_method": "credit", "customer_id": ids["customer"]}),
        ("post", "/sales/discount-rules", {"name": "x", "scope": "item", "item_id": ids["item"], "min_qty": "1", "rule_type": "percent", "percent_off": "5"}),
    ]
    for method, path, payload in attempts:
        kwargs = {"headers": ha}
        if payload is not None:
            kwargs["json"] = payload
        response = await getattr(test_client, method)(path, **kwargs)
        assert response.status_code in (404, 422), (method, path, response.status_code, response.text)

    item = await _item_state(db_session, ids["item"])
    assert item.price == Decimal("5.00") and item.is_deleted is False
    assert item.stock == stock_before

    # Business B's records are untouched
    hb = b["headers"]
    assert (await test_client.get(f"/sales/{ids['sale']}", headers=hb)).json()["status"] == "completed"
    assert (await test_client.get(f"/purchases/{ids['purchase']}", headers=hb)).json()["status"] == "received"
    customer = (await test_client.get(f"/customers/{ids['customer']}", headers=hb)).json()
    assert customer["name"] == "Secret Customer"


@pytest.mark.asyncio(loop_scope="function")
async def test_purchase_with_foreign_ids_does_not_touch_them(test_client, db_session, two_businesses):
    a, b = two_businesses
    ids = b["ids"]
    stock_before = (await _item_state(db_session, ids["item"])).stock

    response = await test_client.post(
        "/purchases/",
        json={
            "supplier": {"id": ids["supplier"], "name": "Renamed"},
            "items": [{"item_id": ids["item"], "item_name": "My Cola", "quantity": "3", "total_cost_price": "6"}],
        },
        headers=a["headers"],
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text

    assert (await _item_state(db_session, ids["item"])).stock == stock_before
    supplier = (
        await db_session.execute(
            select(Supplier).where(Supplier.id == uuid.UUID(ids["supplier"])).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert supplier.name == "Secret Supplier"
    # A got its own new product and supplier instead
    mine = (await test_client.get("/items/", headers=a["headers"])).json()["items"]
    assert [i["name"] for i in mine] == ["My Cola"]


@pytest.mark.asyncio(loop_scope="function")
async def test_same_sku_and_cashbox_per_business(test_client, two_businesses):
    a, _ = two_businesses
    ha = a["headers"]
    response = await test_client.post("/items/", json={"name": "Cola", "sku": "SKU-1"}, headers=ha)
    assert response.status_code == status.HTTP_200_OK, response.text
    # B's open session doesn't block A's shared cashbox
    response = await test_client.post("/cashbox/session/open", json={"opening_amount": "0"}, headers=ha)
    assert response.status_code == status.HTTP_201_CREATED, response.text


@pytest.mark.asyncio(loop_scope="function")
async def test_user_without_business_is_rejected(test_client, db_session):
    user = User(
        id=uuid.uuid4(), email="nobusiness@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    token = await get_jwt_strategy().write_token(user)
    response = await test_client.get("/items/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio(loop_scope="function")
async def test_inactive_business_is_rejected(test_client, db_session, two_businesses):
    a, _ = two_businesses
    a["business"].is_active = False
    await db_session.commit()
    response = await test_client.get("/items/", headers=a["headers"])
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio(loop_scope="function")
async def test_orm_safety_net(db_session, two_businesses):
    a, b = two_businesses
    db_session.info[SESSION_BUSINESS_KEY] = a["business"].id
    try:
        # Even an unfiltered query only sees the bound business
        names = (await db_session.execute(select(Item.name))).scalars().all()
        assert "Secret Cola" not in names
        assert (await db_session.get(Item, uuid.UUID(b["ids"]["item"]))) is None

        db_session.add(Item(name="Smuggled", business_id=b["business"].id, user_id=a["user"].id))
        with pytest.raises(TenantIsolationError):
            await db_session.flush()
        await db_session.rollback()
    finally:
        db_session.info.pop(SESSION_BUSINESS_KEY, None)


def _depends_on(dependant, target) -> bool:
    return any(d.call is target or _depends_on(d, target) for d in dependant.dependencies)


def test_every_business_route_requires_tenant():
    """New routes can't forget isolation: store routes need current_tenant, /admin needs require_superuser."""
    public_prefixes = ("/auth", "/users", "/mcp", "/docs", "/redoc", "/openapi", "/admin")
    missing = [
        f"{','.join(route.methods)} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute)
        and not route.path.startswith(public_prefixes)
        and not _depends_on(route.dependant, current_tenant)
    ]
    assert missing == []

    unprotected_admin = [
        route.path
        for route in app.routes
        if isinstance(route, APIRoute)
        and route.path.startswith("/admin")
        and not _depends_on(route.dependant, require_superuser)
    ]
    assert unprotected_admin == []
