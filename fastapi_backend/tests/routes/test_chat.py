import json
import re
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import status
from sqlalchemy import select

from app.ai_provider import decrypt_api_key
from app.config import settings
from app.models import AISettings, Business, ChatMessage, Item, Sale, User
from app.routes import chat as chat_module


# ─── Fake model ──────────────────────────────────────────────────────────────

def _tool_call(name, args, call_id=None):
    return SimpleNamespace(
        id=call_id or f"call_{uuid.uuid4().hex[:8]}",
        function=SimpleNamespace(name=name, arguments=json.dumps(args)),
    )


def _reply(content=None, tool_calls=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=tool_calls))]
    )


class FakeLLM:
    """Returns scripted responses and records the messages each call received."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


@pytest.fixture
def fake_llm(monkeypatch):
    holder = {}

    def install(responses):
        holder["llm"] = FakeLLM(responses)
        monkeypatch.setattr(chat_module, "build_client", lambda config: holder["llm"])
        return holder["llm"]

    return install


async def _configure_ai(test_client, headers, api_key="sk-test-1234567890"):
    response = await test_client.put(
        "/ai-settings",
        json={
            "provider": "openrouter",
            "base_url": "https://openrouter.ai/api/v1",
            "model": "test/model",
            "api_key": api_key,
        },
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    return response.json()


async def _create_item(db_session, user, name="Coca Cola 2L", stock="10", price="5.00"):
    item = Item(name=name, stock=Decimal(stock), price=Decimal(price), user_id=user.id, business_id=user.business_id)
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    return item


async def _stock(db_session, item_id):
    result = await db_session.execute(
        select(Item.stock).where(Item.id == item_id).execution_options(populate_existing=True)
    )
    return result.scalar_one()


# ─── Tools ───────────────────────────────────────────────────────────────────

def test_tools_exclude_auth_users_and_chat():
    from app.main import mcp

    names = [tool.name for tool in mcp.tools]
    assert names, "expected MCP tools"
    for name in names:
        assert re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", name), name
        assert not name.startswith(("auth-", "users-", "chat-", "ai-settings-")), name
    assert "assistant-search_products" in names
    assert "sales-create_sale" in names


@pytest.mark.asyncio(loop_scope="function")
async def test_search_products_is_scoped_to_user(test_client, db_session, authenticated_user):
    other_business = Business(id=uuid.uuid4(), name="Other Store")
    db_session.add(other_business)
    other = User(
        id=uuid.uuid4(), email="other@example.com", hashed_password="x",
        is_active=True, is_superuser=False, is_verified=True, business_id=other_business.id,
    )
    db_session.add(other)
    await db_session.commit()
    await _create_item(db_session, other, name="Coca Cola Other")
    mine = await _create_item(db_session, authenticated_user["user"], name="Coca Cola 2L")

    response = await test_client.get(
        "/assistant/products/search", params={"q": "cola coca"}, headers=authenticated_user["headers"]
    )
    assert response.status_code == status.HTTP_200_OK
    assert [p["id"] for p in response.json()] == [str(mine.id)]


# ─── AI settings ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_ai_settings_never_return_the_key(test_client, db_session, authenticated_user):
    headers = authenticated_user["headers"]
    saved = await _configure_ai(test_client, headers, api_key="sk-secret-abcd")
    assert saved["has_api_key"] is True
    assert saved["api_key_hint"] == "abcd"

    response = await test_client.get("/ai-settings", headers=headers)
    assert "sk-secret" not in response.text
    assert response.json()["model"] == "test/model"
    assert response.json()["is_custom"] is True

    row = (await db_session.execute(select(AISettings))).scalar_one()
    assert row.api_key_encrypted != "sk-secret-abcd"
    assert decrypt_api_key(row.api_key_encrypted) == "sk-secret-abcd"

    # Saving without a key keeps the stored one
    await test_client.put(
        "/ai-settings",
        json={"provider": "openai", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
        headers=headers,
    )
    response = await test_client.get("/ai-settings", headers=headers)
    assert response.json()["api_key_hint"] == "abcd"


@pytest.mark.asyncio(loop_scope="function")
async def test_chat_without_any_key_returns_error(test_client, authenticated_user, monkeypatch):
    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", None)
    response = await test_client.post(
        "/chat", json={"message": "hola"}, headers=authenticated_user["headers"]
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["error"] == "no_api_key"
    assert [m["role"] for m in body["messages"]] == ["user"]


# ─── Conversation memory and read tools ──────────────────────────────────────

@pytest.mark.asyncio(loop_scope="function")
async def test_read_tool_runs_and_history_is_replayed(test_client, db_session, authenticated_user, fake_llm):
    headers = authenticated_user["headers"]
    await _configure_ai(test_client, headers)
    await _create_item(db_session, authenticated_user["user"])

    llm = fake_llm([
        _reply(tool_calls=[_tool_call("assistant-search_products", {"q": "coca"})]),
        _reply(content="Tienes 10 Coca Cola 2L."),
        _reply(content="Cuestan 5."),
    ])

    first = await test_client.post(
        "/chat", json={"message": "¿cuántas coca tengo?", "locale": "es"}, headers=headers
    )
    assert first.status_code == status.HTTP_200_OK, first.text
    body = first.json()
    assert body["error"] is None
    assert [m["role"] for m in body["messages"]] == ["user", "assistant"]
    conversation_id = body["conversation_id"]

    # The tool result was fed back to the model
    second_call_messages = llm.calls[1]["messages"]
    tool_msg = next(m for m in second_call_messages if m["role"] == "tool")
    assert "Coca Cola 2L" in tool_msg["content"]
    # The system prompt tells the model it is already authenticated
    assert "ALREADY logged in" in second_call_messages[0]["content"]

    await test_client.post(
        "/chat",
        json={"message": "¿y el precio?", "conversation_id": conversation_id},
        headers=headers,
    )
    history = llm.calls[2]["messages"]
    contents = [m.get("content") for m in history]
    assert "¿cuántas coca tengo?" in contents
    assert "Tienes 10 Coca Cola 2L." in contents
    assert history[-1] == {"role": "user", "content": "¿y el precio?"}

    conversations = (await test_client.get("/chat/conversations", headers=headers)).json()
    assert len(conversations) == 1
    assert conversations[0]["title"] == "¿cuántas coca tengo?"

    detail = (await test_client.get(f"/chat/conversations/{conversation_id}", headers=headers)).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant", "user", "assistant"]


# ─── Approval flow ───────────────────────────────────────────────────────────

async def _request_sale(test_client, headers, fake_llm, item, extra_responses):
    llm = fake_llm([
        _reply(tool_calls=[_tool_call(
            "sales-create_sale",
            {"items": [{"item_id": str(item.id), "quantity": "2"}], "payment_method": "cash"},
        )]),
        *extra_responses,
    ])
    response = await test_client.post("/chat", json={"message": "vende 2 coca"}, headers=headers)
    assert response.status_code == status.HTTP_200_OK, response.text
    body = response.json()
    action = body["messages"][-1]
    assert action["role"] == "action"
    assert action["pending_action"]["status"] == "pending"
    return llm, body["conversation_id"], action


@pytest.mark.asyncio(loop_scope="function")
async def test_write_tool_waits_for_approval_and_runs_stored_args(
    test_client, db_session, authenticated_user, fake_llm
):
    headers = authenticated_user["headers"]
    await _configure_ai(test_client, headers)
    item = await _create_item(db_session, authenticated_user["user"])

    llm, conversation_id, action = await _request_sale(
        test_client, headers, fake_llm, item, [_reply(content="Venta registrada.")]
    )
    preview = action["pending_action"]["preview"]
    assert preview["items"][0]["item_name"] == "Coca Cola 2L"
    assert preview["items"][0]["total_price"] == 10.0
    assert await _stock(db_session, item.id) == Decimal("10")  # nothing ran yet

    response = await test_client.post(
        "/chat/execute",
        json={
            "conversation_id": conversation_id,
            "action_message_id": action["id"],
            "approved": True,
            # Ignored: the server only runs the args it stored
            "args": {"items": [{"item_id": str(item.id), "quantity": "9"}]},
        },
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    body = response.json()
    assert body["messages"][0]["pending_action"]["status"] == "approved"
    assert body["messages"][0]["pending_action"]["result_ok"] is True
    assert body["messages"][-1]["content"] == "Venta registrada."

    assert await _stock(db_session, item.id) == Decimal("8")
    sales = (await db_session.execute(select(Sale))).scalars().all()
    assert len(sales) == 1

    # The model saw the sale result before confirming
    tool_msg = [m for m in llm.calls[-1]["messages"] if m["role"] == "tool"][-1]
    assert '"status":"completed"' in tool_msg["content"]

    again = await test_client.post(
        "/chat/execute",
        json={"conversation_id": conversation_id, "action_message_id": action["id"], "approved": True},
        headers=headers,
    )
    assert again.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio(loop_scope="function")
async def test_rejected_action_is_not_executed(test_client, db_session, authenticated_user, fake_llm):
    headers = authenticated_user["headers"]
    await _configure_ai(test_client, headers)
    item = await _create_item(db_session, authenticated_user["user"])

    llm, conversation_id, action = await _request_sale(
        test_client, headers, fake_llm, item, [_reply(content="De acuerdo, no la registré.")]
    )
    response = await test_client.post(
        "/chat/execute",
        json={"conversation_id": conversation_id, "action_message_id": action["id"], "approved": False},
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["messages"][0]["pending_action"]["status"] == "rejected"
    assert await _stock(db_session, item.id) == Decimal("10")
    tool_msg = [m for m in llm.calls[-1]["messages"] if m["role"] == "tool"][-1]
    assert "declined" in tool_msg["content"]


@pytest.mark.asyncio(loop_scope="function")
async def test_new_message_declines_pending_action(test_client, db_session, authenticated_user, fake_llm):
    headers = authenticated_user["headers"]
    await _configure_ai(test_client, headers)
    item = await _create_item(db_session, authenticated_user["user"])

    llm, conversation_id, action = await _request_sale(
        test_client, headers, fake_llm, item, [_reply(content="Ok, otra cosa.")]
    )
    response = await test_client.post(
        "/chat",
        json={"message": "mejor no, dime las ventas de hoy", "conversation_id": conversation_id},
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK, response.text

    stored = (
        await db_session.execute(
            select(ChatMessage)
            .where(ChatMessage.id == uuid.UUID(action["id"]))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert stored.pending_action["status"] == "rejected"
    assert await _stock(db_session, item.id) == Decimal("10")
    # The replayed history is valid: the tool call has its (declined) result before the new user message
    roles = [m["role"] for m in llm.calls[-1]["messages"]]
    assert roles[-3:] == ["assistant", "tool", "user"]
