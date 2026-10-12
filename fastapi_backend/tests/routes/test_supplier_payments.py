"""Paying purchases later, past-dated purchases and the cashbox, and what's owed to suppliers."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import status
from sqlalchemy import select

from app.models import Business, CashboxTransaction, Item, User


async def _item(db_session, user):
    item = Item(name="Cola", stock=Decimal("0"), price=Decimal("12000"), user_id=user.id, business_id=user.business_id)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _open_cashbox(test_client, headers):
    response = await test_client.post("/cashbox/session/open", json={"opening_amount": "500000"}, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED


async def _cash(test_client, headers) -> tuple[Decimal, Decimal]:
    session = (await test_client.get("/cashbox/session/current", headers=headers)).json()
    return Decimal(session["cash_out"]), Decimal(session["expected_cash_balance"])


async def _purchase(test_client, headers, item, **extra):
    body = {
        "supplier": {"name": extra.pop("supplier_name", "Distri")},
        "items": [{"item_id": str(item.id), "item_name": "Cola", "quantity": "10", "total_cost_price": "100000"}],
        **extra,
    }
    response = await test_client.post("/purchases/", json=body, headers=headers)
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


async def _pay(test_client, headers, purchase_id, **body):
    return await test_client.post(f"/purchases/{purchase_id}/payments", json=body, headers=headers)


@pytest.mark.asyncio(loop_scope="function")
async def test_pay_a_purchase_in_parts(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    await _open_cashbox(test_client, headers)

    purchase = await _purchase(test_client, headers, item, payment_status="partial", paid_amount="40000")
    assert purchase["payment_status"] == "partial"
    assert [Decimal(p["amount"]) for p in purchase["payments"]] == [Decimal("40000")]
    assert (await _cash(test_client, headers))[0] == Decimal("40000")

    second = await _pay(test_client, headers, purchase["id"], amount="30000", method="cash")
    assert second.status_code == status.HTTP_201_CREATED, second.text
    assert second.json()["payment_status"] == "partial" and Decimal(second.json()["paid_amount"]) == Decimal("70000")

    last = await _pay(test_client, headers, purchase["id"], amount="30000", method="transfer")
    body = last.json()
    assert body["payment_status"] == "paid" and len(body["payments"]) == 3
    assert body["payments"][2]["method"] == "transfer"

    # Cash out counts only cash payments; transfers show up separately
    assert (await _cash(test_client, headers))[0] == Decimal("70000")


@pytest.mark.asyncio(loop_scope="function")
async def test_payment_guards(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    purchase = await _purchase(test_client, headers, item, payment_method="credit", payment_status="unpaid")

    too_much = await _pay(test_client, headers, purchase["id"], amount="100001")
    assert too_much.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    assert (await _pay(test_client, headers, purchase["id"], amount="10", paid_at=future)).status_code == 422
    assert (await _pay(test_client, headers, purchase["id"], amount="10", method="credit")).status_code == 422
    assert (await _pay(test_client, headers, purchase["id"], amount="0")).status_code == 422

    await test_client.post(f"/purchases/{purchase['id']}/cancel", json={}, headers=headers)
    assert (await _pay(test_client, headers, purchase["id"], amount="10")).status_code == status.HTTP_409_CONFLICT

    future_purchase = await test_client.post(
        "/purchases/",
        json={"items": [{"item_name": "X", "quantity": "1", "total_cost_price": "1"}], "purchase_date": future},
        headers=headers,
    )
    assert future_purchase.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio(loop_scope="function")
async def test_past_dated_purchase_does_not_touch_todays_cashbox(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    await _open_cashbox(test_client, headers)
    three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()

    # Paid back then (explicit): recorded as paid, cashbox untouched
    paid_back_then = await _purchase(
        test_client, headers, item, purchase_date=three_days_ago, payment_affects_cashbox=False
    )
    assert paid_back_then["payment_status"] == "paid"
    payment = paid_back_then["payments"][0]
    assert payment["affects_cashbox"] is False and payment["paid_at"].startswith(three_days_ago[:10])
    assert await _cash(test_client, headers) == (Decimal("0"), Decimal("500000"))

    # No flag on a past date: safe default is not to touch the cashbox
    await _purchase(test_client, headers, item, purchase_date=three_days_ago)
    assert (await _cash(test_client, headers))[0] == Decimal("0")

    # Paid today from the open cashbox for an old invoice (explicit)
    await _purchase(test_client, headers, item, purchase_date=three_days_ago, payment_affects_cashbox=True)
    assert (await _cash(test_client, headers))[0] == Decimal("100000")

    # Dated today with no flag: from today's cashbox, as before
    await _purchase(test_client, headers, item)
    assert (await _cash(test_client, headers))[0] == Decimal("200000")


@pytest.mark.asyncio(loop_scope="function")
async def test_delete_payment_and_cancel_reverse_the_cashbox(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    await _open_cashbox(test_client, headers)
    purchase = await _purchase(test_client, headers, item, payment_status="partial", paid_amount="40000")
    added = (await _pay(test_client, headers, purchase["id"], amount="20000")).json()
    assert (await _cash(test_client, headers))[0] == Decimal("60000")

    payment_id = added["payments"][1]["id"]
    deleted = await test_client.delete(f"/purchases/{purchase['id']}/payments/{payment_id}", headers=headers)
    assert deleted.status_code == status.HTTP_200_OK, deleted.text
    assert Decimal(deleted.json()["paid_amount"]) == Decimal("40000") and deleted.json()["payment_status"] == "partial"
    assert (await _cash(test_client, headers))[0] == Decimal("40000")
    reversal = (
        await db_session.execute(select(CashboxTransaction).where(CashboxTransaction.type == "supplier_payment_cancel"))
    ).scalar_one()
    assert reversal.direction.value == "in"

    await test_client.post(f"/purchases/{purchase['id']}/cancel", json={"force": True}, headers=headers)
    assert (await _cash(test_client, headers))[0] == Decimal("0")


@pytest.mark.asyncio(loop_scope="function")
async def test_payables_per_supplier(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    await _purchase(test_client, headers, item, supplier_name="Distri", payment_status="partial", paid_amount="40000")
    await _purchase(test_client, headers, item, supplier_name="Distri", payment_method="credit", payment_status="unpaid")
    await _purchase(test_client, headers, item, supplier_name="Otro", payment_method="credit", payment_status="unpaid")
    await _purchase(test_client, headers, item, supplier_name="Pagado")

    summary = (await test_client.get("/purchasing/payables", headers=headers)).json()
    assert Decimal(summary["total_owed"]) == Decimal("260000")
    assert summary["supplier_count"] == 2
    distri = summary["suppliers"][0]
    assert distri["supplier_name"] == "Distri" and Decimal(distri["total_owed"]) == Decimal("160000")
    assert [Decimal(i["remaining"]) for i in distri["invoices"]] == [Decimal("60000"), Decimal("100000")]

    # Another business sees nothing
    other_business = Business(id=uuid.uuid4(), name="Other")
    db_session.add(other_business)
    await db_session.flush()
    other = User(id=uuid.uuid4(), email="o@x.com", hashed_password="x", is_active=True, is_superuser=False,
                 is_verified=True, business_id=other_business.id)
    db_session.add(other)
    await db_session.commit()
    from app.users import get_jwt_strategy

    token = await get_jwt_strategy().write_token(other)
    other_summary = (await test_client.get("/purchasing/payables", headers={"Authorization": f"Bearer {token}"})).json()
    assert other_summary["supplier_count"] == 0


@pytest.mark.asyncio(loop_scope="function")
async def test_cashier_cannot_delete_payments(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    user = authenticated_user["user"]
    item = await _item(db_session, user)
    purchase = await _purchase(test_client, headers, item, payment_status="partial", paid_amount="40000")

    from fastapi_users.password import PasswordHelper

    from app.models import UserRole
    from app.users import get_jwt_strategy

    cashier = User(id=uuid.uuid4(), email="c@x.com", hashed_password=PasswordHelper().hash("x"), is_active=True,
                   is_superuser=False, is_verified=True, business_id=user.business_id, role=UserRole.cashier)
    db_session.add(cashier)
    await db_session.commit()
    cashier_headers = {"Authorization": f"Bearer {await get_jwt_strategy().write_token(cashier)}"}

    # Cashiers can pay…
    assert (await _pay(test_client, cashier_headers, purchase["id"], amount="1000")).status_code == 201
    # …but only owners can undo a payment
    payment_id = purchase["payments"][0]["id"]
    response = await test_client.delete(f"/purchases/{purchase['id']}/payments/{payment_id}", headers=cashier_headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio(loop_scope="function")
async def test_write_off_remaining_debt(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    item = await _item(db_session, authenticated_user["user"])
    await _open_cashbox(test_client, headers)
    purchase = await _purchase(test_client, headers, item, payment_status="partial", paid_amount="40000")

    response = await test_client.post(
        f"/purchases/{purchase['id']}/write-off", json={"reason": "El proveedor perdonó el saldo"}, headers=headers
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    body = response.json()
    assert body["payment_status"] == "paid" and body["status"] != "cancelled"
    write_off = body["payments"][-1]
    assert write_off["method"] == "write_off" and Decimal(write_off["amount"]) == Decimal("60000")
    assert write_off["affects_cashbox"] is False and write_off["notes"] == "El proveedor perdonó el saldo"
    # Only the real payment left the cashbox; nothing is owed any more
    assert (await _cash(test_client, headers))[0] == Decimal("40000")
    assert (await test_client.get("/purchasing/payables", headers=headers)).json()["supplier_count"] == 0
    # The reason is optional
    again = await test_client.post(f"/purchases/{purchase['id']}/write-off", json={}, headers=headers)
    assert again.status_code == status.HTTP_409_CONFLICT

    # Deleting the write-off brings the debt back
    restored = await test_client.delete(f"/purchases/{purchase['id']}/payments/{write_off['id']}", headers=headers)
    assert restored.json()["payment_status"] == "partial"
    assert (await _cash(test_client, headers))[0] == Decimal("40000")
