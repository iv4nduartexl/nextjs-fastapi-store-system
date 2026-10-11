"""Purchase wizard helpers: last costs, recent suppliers, usual products, unit cost and invoice total."""
import uuid
from decimal import Decimal

import pytest
from fastapi import status
from sqlalchemy import select

from app.models import Business, Item, PurchaseItem


async def _item(db_session, user, name, unit_type="unit", price="12000"):
    item = Item(name=name, price=Decimal(price), stock=Decimal("0"), unit_type=unit_type, user_id=user.id, business_id=user.business_id)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _buy(test_client, headers, supplier, lines, **extra):
    response = await test_client.post(
        "/purchases/",
        json={"supplier": supplier, "items": lines, **extra},
        headers=headers,
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio(loop_scope="function")
async def test_catalog_has_last_cost_and_ignores_cancelled(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    cola = await _item(db_session, authenticated_user["user"], "Coca Cola")
    line = lambda cost: [{"item_id": str(cola.id), "item_name": "Coca Cola", "quantity": "10", "unit_cost": cost}]  # noqa: E731

    await _buy(test_client, headers, {"name": "Distri"}, line("8000"), purchase_date="2026-01-01T12:00:00Z")
    later = await _buy(test_client, headers, {"name": "Distri"}, line("9000"), purchase_date="2026-02-01T12:00:00Z")

    catalog = {p["name"]: p for p in (await test_client.get("/purchasing/catalog", headers=headers)).json()}
    assert Decimal(catalog["Coca Cola"]["last_unit_cost"]) == Decimal("9000")

    # Cancelling the latest purchase brings back the previous cost
    await test_client.post(f"/purchases/{later['id']}/cancel", json={"force": True}, headers=headers)
    catalog = {p["name"]: p for p in (await test_client.get("/purchasing/catalog", headers=headers)).json()}
    assert Decimal(catalog["Coca Cola"]["last_unit_cost"]) == Decimal("8000")


@pytest.mark.asyncio(loop_scope="function")
async def test_recent_suppliers_and_usual_products(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    user = authenticated_user["user"]
    cola = await _item(db_session, user, "Coca Cola")
    agua = await _item(db_session, user, "Agua")

    first = await _buy(
        test_client, headers, {"name": "Distri"},
        [
            {"item_id": str(cola.id), "item_name": "Coca Cola", "quantity": "24", "unit_cost": "8000"},
            {"item_id": str(agua.id), "item_name": "Agua", "quantity": "12", "unit_cost": "3000"},
        ],
    )
    supplier_id = first["supplier"]["id"] if first.get("supplier") else None
    if supplier_id is None:
        supplier_id = (await test_client.get("/purchasing/suppliers/recent", headers=headers)).json()[0]["id"]
    await _buy(
        test_client, headers, {"id": supplier_id, "name": "Distri"},
        [{"item_id": str(cola.id), "item_name": "Coca Cola", "quantity": "30", "unit_cost": "8500"}],
    )
    await _buy(test_client, headers, {"name": "Otro"}, [{"item_name": "Pan", "quantity": "5", "total_cost_price": "5000"}])

    recent = (await test_client.get("/purchasing/suppliers/recent", headers=headers)).json()
    assert {s["name"] for s in recent} == {"Distri", "Otro"}

    usual = (await test_client.get(f"/purchasing/suppliers/{supplier_id}/usual-products", headers=headers)).json()
    assert [u["name"] for u in usual] == ["Coca Cola", "Agua"]
    assert Decimal(usual[0]["last_quantity"]) == Decimal("30") and Decimal(usual[0]["last_unit_cost"]) == Decimal("8500")
    assert usual[0]["times_bought"] == 2


@pytest.mark.asyncio(loop_scope="function")
async def test_purchasing_data_is_per_business(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    cola = await _item(db_session, authenticated_user["user"], "Coca Cola")
    await _buy(test_client, headers, {"name": "Distri"}, [{"item_id": str(cola.id), "item_name": "Coca Cola", "quantity": "1", "unit_cost": "1"}])

    from fastapi_users.password import PasswordHelper

    from app.models import User
    from app.users import get_jwt_strategy

    other_business = Business(id=uuid.uuid4(), name="Other")
    db_session.add(other_business)
    await db_session.flush()
    other = User(
        id=uuid.uuid4(), email="o@x.com", hashed_password=PasswordHelper().hash("x"),
        is_active=True, is_superuser=False, is_verified=True, business_id=other_business.id,
    )
    db_session.add(other)
    await db_session.commit()
    other_headers = {"Authorization": f"Bearer {await get_jwt_strategy().write_token(other)}"}

    assert (await test_client.get("/purchasing/catalog", headers=other_headers)).json() == []
    assert (await test_client.get("/purchasing/suppliers/recent", headers=other_headers)).json() == []


@pytest.mark.asyncio(loop_scope="function")
async def test_unit_cost_and_invoice_total(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    queso = await _item(db_session, authenticated_user["user"], "Queso", unit_type="gram", price="80000")
    purchase = await _buy(
        test_client, headers, None,
        [{"item_id": str(queso.id), "item_name": "Queso", "unit_type": "gram", "quantity": "2500", "unit_cost": "60000"}],
        invoice_total="150000",
    )
    assert Decimal(purchase["total_cost"]) == Decimal("150000")
    assert Decimal(purchase["invoice_total"]) == Decimal("150000")
    line = (await db_session.execute(select(PurchaseItem))).scalar_one()
    assert line.cost_price == Decimal("60000.00")  # per kg

    mismatch = await test_client.post(
        "/purchases/",
        json={"items": [{"item_name": "X", "quantity": "2", "unit_cost": "100", "total_cost_price": "999"}]},
        headers=headers,
    )
    assert mismatch.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    zero = await test_client.post(
        "/purchases/", json={"items": [{"item_name": "X", "quantity": "0", "total_cost_price": "10"}]}, headers=headers
    )
    assert zero.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
