"""Stock never below 0, creating products while selling, and inventory counts."""
import uuid
from decimal import Decimal

import pytest
from fastapi import status
from sqlalchemy import select

from app.models import AuditLog, Item, User, UserRole


async def _item(db_session, user, stock="10", **extra):
    item = Item(name=extra.pop("name", "Cola"), stock=Decimal(stock), price=Decimal("5000"), user_id=user.id,
                business_id=user.business_id, **extra)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _stock(db_session, item) -> Decimal:
    return (
        await db_session.execute(
            select(Item.stock).where(Item.id == item.id).execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _cashier_headers(db_session, owner):
    from app.users import get_jwt_strategy

    cashier = User(id=uuid.uuid4(), email=f"c{uuid.uuid4().hex[:6]}@x.com", hashed_password="x", is_active=True,
                   is_superuser=False, is_verified=True, business_id=owner.business_id, role=UserRole.cashier)
    db_session.add(cashier)
    await db_session.commit()
    return {"Authorization": f"Bearer {await get_jwt_strategy().write_token(cashier)}"}


async def _sell(test_client, headers, item, quantity):
    response = await test_client.post(
        "/sales/", json={"items": [{"item_id": str(item.id), "quantity": quantity}]}, headers=headers
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    return response.json()


@pytest.mark.asyncio(loop_scope="function")
async def test_selling_out_of_stock_keeps_stock_at_zero(test_client, db_session, authenticated_user):
    headers, user = authenticated_user["headers"], authenticated_user["user"]
    item = await _item(db_session, user, stock="2")

    sale = await _sell(test_client, headers, item, "5")
    assert await _stock(db_session, item) == Decimal("0")
    # Selling with no stock at all still works
    other = await _sell(test_client, headers, item, "1")
    assert await _stock(db_session, item) == Decimal("0")

    # Cancelling gives back only what was really taken from stock
    await test_client.post(f"/sales/{other['id']}/cancel", json={}, headers=headers)
    assert await _stock(db_session, item) == Decimal("0")
    await test_client.post(f"/sales/{sale['id']}/cancel", json={}, headers=headers)
    assert await _stock(db_session, item) == Decimal("2")


@pytest.mark.asyncio(loop_scope="function")
async def test_create_product_while_selling(test_client, db_session, authenticated_user):
    headers, user = authenticated_user["headers"], authenticated_user["user"]
    cashier = await _cashier_headers(db_session, user)

    body = {"name": "  Galletitas  ", "price": "7000", "sku": " 7791234 ", "unit_type": "unit", "source": "pos"}
    created = await test_client.post("/items/", json=body, headers=cashier)
    assert created.status_code == status.HTTP_200_OK, created.text
    assert created.json()["name"] == "Galletitas" and created.json()["sku"] == "7791234"

    duplicate = await test_client.post("/items/", json={**body, "name": "Otra"}, headers=headers)
    assert duplicate.status_code == status.HTTP_409_CONFLICT
    detail = duplicate.json()["detail"]
    assert detail["code"] == "sku_exists" and detail["item"]["id"] == created.json()["id"]

    entry = (await db_session.execute(select(AuditLog).where(AuditLog.action == "item_created"))).scalar_one()
    assert entry.details == {"name": "Galletitas", "source": "pos"}

    assert (await test_client.post("/items/", json={"name": "  "}, headers=headers)).status_code == 422


@pytest.mark.asyncio(loop_scope="function")
async def test_inventory_count_applies_differences(test_client, db_session, authenticated_user):
    headers, user = authenticated_user["headers"], authenticated_user["user"]
    cola = await _item(db_session, user, stock="10", category="Bebidas")
    agua = await _item(db_session, user, stock="5", name="Agua", category="Bebidas")
    queso = await _item(db_session, user, stock="3000", name="Queso", category="Lácteos", unit_type="gram")
    jugo = await _item(db_session, user, stock="4", name="Jugo", category="Bebidas")

    # Counted 8 colas while the system said 10; then 1 was sold before applying
    await _sell(test_client, headers, cola, "1")
    body = {
        "category": "Bebidas",
        "lines": [
            {"item_id": str(cola.id), "counted": "8", "expected": "10"},
            {"item_id": str(agua.id), "counted": "5", "expected": "5"},
            {"item_id": str(queso.id), "counted": "2500", "expected": "3000"},
        ],
    }
    response = await test_client.post("/inventory/counts", json=body, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED, response.text
    count = response.json()
    assert count["lines_counted"] == 3 and count["lines_changed"] == 2

    assert await _stock(db_session, cola) == Decimal("7")  # 9 now, minus the 2 missing
    assert await _stock(db_session, agua) == Decimal("5")
    assert await _stock(db_session, queso) == Decimal("2500")
    assert await _stock(db_session, jugo) == Decimal("4")  # not counted: unchanged

    history = (await test_client.get("/inventory/counts", headers=headers)).json()
    assert [c["id"] for c in history] == [count["id"]]
    detail = (await test_client.get(f"/inventory/counts/{count['id']}", headers=headers)).json()
    assert {line["item_name"]: line["new_stock"] for line in detail["lines"]}["Cola"] in ("7", "7.000")


@pytest.mark.asyncio(loop_scope="function")
async def test_inventory_count_zero_uncounted_and_floor(test_client, db_session, authenticated_user):
    headers, user = authenticated_user["headers"], authenticated_user["user"]
    cola = await _item(db_session, user, stock="1", category="Bebidas")
    jugo = await _item(db_session, user, stock="4", name="Jugo", category="Bebidas")
    pan = await _item(db_session, user, stock="6", name="Pan", category="Panadería")

    # Counted 0 when the system said 3 (stock is 1 now): never below 0
    body = {"category": "Bebidas", "zero_uncounted": True,
            "lines": [{"item_id": str(cola.id), "counted": "0", "expected": "3"}]}
    response = await test_client.post("/inventory/counts", json=body, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED, response.text
    assert await _stock(db_session, cola) == Decimal("0")
    assert await _stock(db_session, jugo) == Decimal("0")
    assert await _stock(db_session, pan) == Decimal("6")  # other category untouched


@pytest.mark.asyncio(loop_scope="function")
async def test_inventory_guards(test_client, db_session, authenticated_user):
    headers, user = authenticated_user["headers"], authenticated_user["user"]
    item = await _item(db_session, user)
    line = {"item_id": str(item.id), "counted": "1", "expected": "10"}

    cashier = await _cashier_headers(db_session, user)
    assert (await test_client.post("/inventory/counts", json={"lines": [line]}, headers=cashier)).status_code == 403
    assert (await test_client.get("/inventory/counts", headers=cashier)).status_code == 403

    unknown = {"item_id": str(uuid.uuid4()), "counted": "1", "expected": "1"}
    assert (await test_client.post("/inventory/counts", json={"lines": [unknown]}, headers=headers)).status_code == 422
    negative = {**line, "counted": "-1"}
    assert (await test_client.post("/inventory/counts", json={"lines": [negative]}, headers=headers)).status_code == 422
    assert (await test_client.post("/inventory/counts", json={"lines": []}, headers=headers)).status_code == 422
    assert await _stock(db_session, item) == Decimal("10")
