"""Checkout safety: no duplicate sales, credit sale + down payment together, purchase payment rules."""
from decimal import Decimal

import pytest
from fastapi import status
from sqlalchemy import func, select

from app.models import CashboxTransaction, Customer, CustomerPayment, Item, Sale


async def _item(db_session, user, stock="10", price="5000"):
    item = Item(name="Cola", stock=Decimal(stock), price=Decimal(price), user_id=user.id, business_id=user.business_id)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _count(db_session, model):
    return (await db_session.execute(select(func.count()).select_from(model))).scalar_one()


async def _open_cashbox(test_client, headers):
    response = await test_client.post("/cashbox/session/open", json={"opening_amount": "0"}, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.asyncio(loop_scope="function")
async def test_same_checkout_twice_creates_one_sale(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    payload = {"items": [{"item_id": str(item.id), "quantity": "2"}], "request_id": "checkout-123"}

    first = await test_client.post("/sales/", json=payload, headers=headers)
    second = await test_client.post("/sales/", json=payload, headers=headers)
    assert first.status_code == second.status_code == status.HTTP_200_OK
    assert first.json()["id"] == second.json()["id"]
    assert await _count(db_session, Sale) == 1

    stock = (await db_session.execute(select(Item.stock).where(Item.id == item.id).execution_options(populate_existing=True))).scalar_one()
    assert stock == Decimal("8")

    # A different checkout id is a different sale
    other = await test_client.post("/sales/", json={**payload, "request_id": "checkout-456"}, headers=headers)
    assert other.json()["id"] != first.json()["id"]


@pytest.mark.asyncio(loop_scope="function")
async def test_credit_sale_with_down_payment_is_saved_together(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    user = authenticated_user["user"]
    item = await _item(db_session, user)
    customer = Customer(name="Juan", user_id=user.id, business_id=user.business_id)
    db_session.add(customer)
    await db_session.commit()
    await _open_cashbox(test_client, headers)

    base = {
        "items": [{"item_id": str(item.id), "quantity": "2"}],
        "payment_method": "credit",
        "customer_id": str(customer.id),
    }
    # A down payment bigger than the sale is rejected and nothing is saved
    too_much = await test_client.post("/sales/", json={**base, "partial_payment": "20000"}, headers=headers)
    assert too_much.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert await _count(db_session, Sale) == 0 and await _count(db_session, CustomerPayment) == 0

    ok = await test_client.post(
        "/sales/", json={**base, "partial_payment": "4000", "partial_payment_method": "card"}, headers=headers
    )
    assert ok.status_code == status.HTTP_200_OK, ok.text
    payment = (await db_session.execute(select(CustomerPayment))).scalar_one()
    assert payment.amount == Decimal("4000.00") and payment.payment_method == "card"
    types = sorted(t.type.value for t in (await db_session.execute(select(CashboxTransaction))).scalars().all())
    assert types == ["customer_payment", "opening", "sale"]

    detail = (await test_client.get(f"/customers/{customer.id}", headers=headers)).json()
    assert Decimal(detail["balance"]) == Decimal("6000")


@pytest.mark.asyncio(loop_scope="function")
async def test_down_payment_only_on_credit_sales(test_client, db_session, authenticated_user):
    item = await _item(db_session, authenticated_user["user"])
    response = await test_client.post(
        "/sales/",
        json={"items": [{"item_id": str(item.id), "quantity": "1"}], "payment_method": "cash", "partial_payment": "100"},
        headers=authenticated_user["headers"],
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def _purchase(item, **extra):
    return {
        "items": [{"item_id": str(item.id), "item_name": "Cola", "quantity": "10", "total_cost_price": "30000"}],
        **extra,
    }


async def _purchase_outflow(db_session):
    rows = (
        await db_session.execute(select(CashboxTransaction).where(CashboxTransaction.type == "supplier_payment"))
    ).scalars().all()
    return sum((r.amount for r in rows), Decimal("0"))


@pytest.mark.asyncio(loop_scope="function")
async def test_purchase_payment_rules(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    await _open_cashbox(test_client, headers)

    bad = [
        _purchase(item, payment_method="credit", payment_status="paid"),
        _purchase(item, payment_status="partial"),
        _purchase(item, payment_status="partial", paid_amount="30000"),
    ]
    for payload in bad:
        response = await test_client.post("/purchases/", json=payload, headers=headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, payload

    partial = await test_client.post(
        "/purchases/", json=_purchase(item, payment_status="partial", paid_amount="10000"), headers=headers
    )
    assert partial.status_code == status.HTTP_201_CREATED, partial.text
    assert Decimal(partial.json()["paid_amount"]) == Decimal("10000")
    assert await _purchase_outflow(db_session) == Decimal("10000")

    unpaid = await test_client.post(
        "/purchases/", json=_purchase(item, payment_method="credit", payment_status="unpaid"), headers=headers
    )
    assert unpaid.status_code == status.HTTP_201_CREATED
    assert Decimal(unpaid.json()["paid_amount"]) == Decimal("0")
    assert await _purchase_outflow(db_session) == Decimal("10000")

    paid = await test_client.post("/purchases/", json=_purchase(item), headers=headers)
    assert Decimal(paid.json()["paid_amount"]) == Decimal("30000")
    assert await _purchase_outflow(db_session) == Decimal("40000")
