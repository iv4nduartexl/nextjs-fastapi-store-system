from decimal import Decimal

import pytest
from fastapi import status
from sqlalchemy import select

from app.models import CashboxTransaction, Item


async def _create_item(db_session, user, stock="10", price="5.00"):
    item = Item(name="Cola", stock=Decimal(stock), price=Decimal(price), user_id=user.id, business_id=user.business_id)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _open_session(test_client, headers):
    response = await test_client.post(
        "/cashbox/session/open", json={"opening_amount": "100"}, headers=headers
    )
    assert response.status_code == status.HTTP_201_CREATED


async def _current_session(test_client, headers):
    response = await test_client.get("/cashbox/session/current", headers=headers)
    assert response.status_code == status.HTTP_200_OK
    return response.json()


async def _stock(db_session, item_id):
    result = await db_session.execute(
        select(Item.stock).where(Item.id == item_id).execution_options(populate_existing=True)
    )
    return result.scalar_one()


class TestCancelSale:
    @pytest.mark.asyncio(loop_scope="function")
    async def test_cancel_cash_sale_restores_stock_and_cashbox(
        self, test_client, db_session, authenticated_user
    ):
        headers = authenticated_user["headers"]
        item = await _create_item(db_session, authenticated_user["user"])
        await _open_session(test_client, headers)

        sale = await test_client.post(
            "/sales/",
            json={"items": [{"item_id": str(item.id), "quantity": "2"}], "payment_method": "cash"},
            headers=headers,
        )
        assert sale.status_code == status.HTTP_200_OK
        sale_id = sale.json()["id"]
        assert await _stock(db_session, item.id) == Decimal("8")
        assert Decimal((await _current_session(test_client, headers))["cash_in"]) == Decimal("10")

        cancel = await test_client.post(
            f"/sales/{sale_id}/cancel", json={"reason": "wrong item"}, headers=headers
        )
        assert cancel.status_code == status.HTTP_200_OK
        body = cancel.json()
        assert body["status"] == "cancelled"
        assert body["cancel_reason"] == "wrong item"
        assert body["cancelled_at"] is not None

        assert await _stock(db_session, item.id) == Decimal("10")
        session = await _current_session(test_client, headers)
        assert Decimal(session["cash_in"]) == Decimal("0")
        assert Decimal(session["expected_cash_balance"]) == Decimal("100")

        reversal = (
            await db_session.execute(
                select(CashboxTransaction).where(
                    CashboxTransaction.reference_id == sale_id,
                    CashboxTransaction.type == "sale_cancel",
                )
            )
        ).scalar_one()
        assert reversal.direction.value == "out"
        assert reversal.amount == Decimal("10.00")

    @pytest.mark.asyncio(loop_scope="function")
    async def test_cancel_sale_twice_conflicts(self, test_client, db_session, authenticated_user):
        headers = authenticated_user["headers"]
        item = await _create_item(db_session, authenticated_user["user"])
        sale = await test_client.post(
            "/sales/",
            json={"items": [{"item_id": str(item.id), "quantity": "1"}], "payment_method": "card"},
            headers=headers,
        )
        sale_id = sale.json()["id"]

        first = await test_client.post(f"/sales/{sale_id}/cancel", headers=headers)
        assert first.status_code == status.HTTP_200_OK
        second = await test_client.post(f"/sales/{sale_id}/cancel", headers=headers)
        assert second.status_code == status.HTTP_409_CONFLICT
        assert await _stock(db_session, item.id) == Decimal("10")


class TestCancelPurchase:
    async def _purchase(self, test_client, headers, item, quantity="5"):
        response = await test_client.post(
            "/purchases/",
            json={
                "items": [
                    {
                        "item_id": str(item.id),
                        "item_name": item.name,
                        "quantity": quantity,
                        "total_cost_price": "20",
                    }
                ],
                "payment_status": "paid",
                "payment_method": "cash",
            },
            headers=headers,
        )
        assert response.status_code == status.HTTP_201_CREATED, response.text
        return response.json()["id"]

    @pytest.mark.asyncio(loop_scope="function")
    async def test_cancel_purchase_reduces_stock_and_reverses_cashbox(
        self, test_client, db_session, authenticated_user
    ):
        headers = authenticated_user["headers"]
        item = await _create_item(db_session, authenticated_user["user"], stock="0")
        await _open_session(test_client, headers)
        purchase_id = await self._purchase(test_client, headers, item)
        assert await _stock(db_session, item.id) == Decimal("5")
        assert Decimal((await _current_session(test_client, headers))["cash_out"]) == Decimal("20")

        cancel = await test_client.post(
            f"/purchases/{purchase_id}/cancel", json={"reason": "duplicate"}, headers=headers
        )
        assert cancel.status_code == status.HTTP_200_OK, cancel.text
        assert cancel.json()["status"] == "cancelled"
        assert cancel.json()["cancel_reason"] == "duplicate"

        assert await _stock(db_session, item.id) == Decimal("0")
        session = await _current_session(test_client, headers)
        assert Decimal(session["cash_out"]) == Decimal("0")
        assert Decimal(session["expected_cash_balance"]) == Decimal("100")

        again = await test_client.post(f"/purchases/{purchase_id}/cancel", headers=headers)
        assert again.status_code == status.HTTP_409_CONFLICT
        assert again.json()["detail"]["code"] == "already_cancelled"

    @pytest.mark.asyncio(loop_scope="function")
    async def test_cancel_purchase_negative_stock_requires_force(
        self, test_client, db_session, authenticated_user
    ):
        headers = authenticated_user["headers"]
        item = await _create_item(db_session, authenticated_user["user"], stock="0")
        purchase_id = await self._purchase(test_client, headers, item)

        # Sell 3 of the 5 purchased units
        sale = await test_client.post(
            "/sales/",
            json={"items": [{"item_id": str(item.id), "quantity": "3"}], "payment_method": "cash"},
            headers=headers,
        )
        assert sale.status_code == status.HTTP_200_OK
        assert await _stock(db_session, item.id) == Decimal("2")

        blocked = await test_client.post(f"/purchases/{purchase_id}/cancel", headers=headers)
        assert blocked.status_code == status.HTTP_409_CONFLICT
        detail = blocked.json()["detail"]
        assert detail["code"] == "negative_stock"
        assert detail["items"][0]["id"] == str(item.id)
        assert await _stock(db_session, item.id) == Decimal("2")

        forced = await test_client.post(
            f"/purchases/{purchase_id}/cancel", json={"force": True}, headers=headers
        )
        assert forced.status_code == status.HTTP_200_OK
        assert await _stock(db_session, item.id) == Decimal("0")  # never below 0
