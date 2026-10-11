"""Chat assistant: conversations, the model/tool loop and approval of write operations.

Flow:
- POST /chat stores the user message, replays the conversation to the model and runs read-only
  tools automatically.
- When the model wants a write tool (WRITE_OPERATIONS), the loop pauses and stores an "action"
  message holding the exact tool calls. Only display data goes to the browser.
- POST /chat/execute approves or rejects that stored action, runs it server-side and resumes the
  loop so the model can confirm the outcome.
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi_mcp.types import HTTPRequestInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.ai_provider import (
    build_client,
    classify_provider_error,
    get_llm_config,
    provider_error_detail,
    temperature_kwargs,
)
from app.database import User, get_async_session
from app.mcp_tools import ALLOWED_OPERATIONS, WRITE_OPERATIONS
from app.models import ChatConversation, ChatMessage, Customer, Item, Supplier
from app.schemas import (
    ChatConversationDetail,
    ChatConversationRead,
    ChatConversationUpdate,
    ChatExecuteRequest,
    ChatMessageRead,
    ChatRequest,
    ChatResponse,
)
from app.users import current_active_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

MAX_MODEL_ROUNDS = 6  # model calls per request
MAX_TOOL_CALLS = 12  # tool executions per request
MAX_HISTORY_MESSAGES = 30  # past messages replayed to the model
MAX_TOOL_RESULT_CHARS = 6000
TITLE_MAX_CHARS = 60

ACTION_PENDING = "pending"
ACTION_APPROVED = "approved"
ACTION_REJECTED = "rejected"


class ChatError(Exception):
    def __init__(self, code: str, detail: str | None = None):
        self.code = code
        self.detail = detail


class ChatContext:
    """Everything one request needs to talk to the model and run tools."""

    def __init__(self, request: Request, db: AsyncSession, user: User, conversation_id: UUID,
                 locale: str, timezone_name: str | None, currency_symbol: str | None):
        self.db = db
        self.user = user
        self.conversation_id = conversation_id
        self.locale = locale
        self.timezone_name = timezone_name
        self.currency_symbol = currency_symbol
        self.mcp = request.app.state.mcp
        self.tool_calls_used = 0
        self.added: list[ChatMessage] = []

        auth_header = request.headers.get("Authorization")
        # Tools run as the same authenticated user through the internal API client
        self.http_info = HTTPRequestInfo(
            method="POST",
            path=str(request.url.path),
            headers={"authorization": auth_header} if auth_header else {},
            cookies={},
            query_params={},
            body=None,
        )


# ─── Tool definitions ────────────────────────────────────────────────────────

def _safe_tool_name(name: str) -> str:
    # OpenAI-compatible APIs only accept [a-zA-Z0-9_-]{1,64}
    return re.sub(r"[^a-zA-Z0-9_-]", "_", name)[:64]


def _tool_specs(mcp) -> tuple[list[dict], dict[str, str]]:
    """OpenAI tool specs plus a map from the (sanitized) name sent to the model to the MCP name."""
    specs = []
    name_map = {}
    allowed = set(ALLOWED_OPERATIONS)
    for tool in mcp.tools:
        if tool.name not in allowed:
            continue
        safe = _safe_tool_name(tool.name)
        name_map[safe] = tool.name
        specs.append(
            {
                "type": "function",
                "function": {
                    "name": safe,
                    "description": tool.description,
                    "parameters": tool.inputSchema,
                },
            }
        )
    return specs, name_map


def _system_prompt(ctx: ChatContext) -> str:
    try:
        zone = ZoneInfo(ctx.timezone_name) if ctx.timezone_name else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("UTC")
    now = datetime.now(zone)
    language = "Spanish" if ctx.locale.startswith("es") else "English"
    currency = ctx.currency_symbol or "₲"
    return (
        "You are the assistant inside a store management system (point of sale, inventory, purchases, "
        "customers on credit and cashbox).\n"
        f"- Current date/time: {now.strftime('%Y-%m-%d %H:%M')} ({zone.key}). Currency symbol: {currency}.\n"
        f"- Reply in {language} unless the user writes in another language. Be brief; use markdown tables for lists.\n"
        "- The user is the store owner and is ALREADY logged in. Never ask for credentials, never talk about "
        "logging in or registering; tools run with the user's session automatically.\n"
        "- Use the tools to answer with real data; never invent products, customers, ids, prices or numbers.\n"
        "- Before creating a sale or purchase, look up product ids with search_products (and customers with "
        "search_customers). If several products match, ask the user which one; if none match, say so.\n"
        "- Products with unit_type 'gram' have stock and sale quantities in grams and prices per kilogram "
        "(\"medio kilo\" = 500).\n"
        "- Tools that change data (sales, purchases, customers, payments, cashbox, products) are shown to the user "
        "for approval before they run. Call them directly with complete arguments instead of asking for "
        "confirmation in text. If the user declines, acknowledge it and do not retry unless asked.\n"
        "- If a tool returns an error, explain it plainly and suggest what to do; do not mention HTTP codes.\n"
        "- For 'today' questions call store_snapshot with "
        f"tz='{zone.key}'."
    )


# ─── Persistence helpers ─────────────────────────────────────────────────────

def _is_visible(message: ChatMessage) -> bool:
    if message.role == "user" or message.role == "action":
        return True
    return message.role == "assistant" and bool((message.content or "").strip())


def _add_message(ctx: ChatContext, **fields) -> ChatMessage:
    # created_at is set here (not only server-side) so responses can serialize it without a reload
    message = ChatMessage(conversation_id=ctx.conversation_id, created_at=datetime.now(timezone.utc), **fields)
    ctx.db.add(message)
    ctx.added.append(message)
    return message


async def _get_conversation(db: AsyncSession, user: User, conversation_id: UUID) -> ChatConversation:
    result = await db.execute(
        select(ChatConversation).where(
            ChatConversation.id == conversation_id, ChatConversation.user_id == user.id
        )
    )
    conversation = result.scalars().first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def _conversation_messages(db: AsyncSession, conversation_id: UUID) -> list[ChatMessage]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.seq)
        .execution_options(populate_existing=True)
    )
    return list(result.scalars().all())


async def _model_history(ctx: ChatContext) -> list[dict]:
    """The conversation in OpenAI format, trimmed to the most recent messages."""
    await ctx.db.flush()
    rows = [m for m in await _conversation_messages(ctx.db, ctx.conversation_id) if m.role != "action"]
    rows = rows[-MAX_HISTORY_MESSAGES:]
    # Never start mid tool-exchange: the model API rejects tool results without their call
    while rows and rows[0].role != "user":
        rows.pop(0)

    history: list[dict] = [{"role": "system", "content": _system_prompt(ctx)}]
    for m in rows:
        if m.role == "assistant":
            entry: dict[str, Any] = {"role": "assistant", "content": m.content or ""}
            if m.tool_calls:
                entry["tool_calls"] = m.tool_calls
            history.append(entry)
        elif m.role == "tool":
            history.append({"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content or ""})
        else:
            history.append({"role": "user", "content": m.content or ""})
    return history


def _title_from(text: str) -> str:
    title = " ".join(text.split())
    return title if len(title) <= TITLE_MAX_CHARS else title[: TITLE_MAX_CHARS - 1] + "…"


# ─── Tool execution ──────────────────────────────────────────────────────────

def _compact_result(content) -> str:
    """Turn MCP text content into compact JSON, truncated so it doesn't flood the context."""
    text = "".join(getattr(part, "text", str(part)) for part in content)
    try:
        text = json.dumps(json.loads(text), ensure_ascii=False, separators=(",", ":"), default=str)
    except (json.JSONDecodeError, TypeError):
        pass
    if len(text) > MAX_TOOL_RESULT_CHARS:
        text = text[:MAX_TOOL_RESULT_CHARS] + "…[truncated: refine the query or use filters for fewer results]"
    return text


def _tool_error(exc: Exception) -> str:
    message = str(exc)
    status = re.search(r"Status code: (\d{3})", message)
    body = message.split("Response:", 1)[1].strip() if "Response:" in message else message
    error: dict[str, Any] = {"error": body[:1500]}
    if status:
        code = int(status.group(1))
        error["status"] = code
        if code in (401, 403):
            # Not something the user can fix by logging in from the chat
            error["hint"] = "Permission problem with this operation; do not ask the user to log in."
        elif code == 404:
            error["hint"] = "Not found; check the id with a search tool."
        elif code == 422:
            error["hint"] = "Invalid arguments; fix them using the tool's parameter descriptions."
    return json.dumps(error, ensure_ascii=False)


async def _execute_tool(ctx: ChatContext, mcp_name: str, args: dict) -> tuple[str, bool]:
    """Run a tool through the API as the current user. Returns (result for the model, succeeded)."""
    ctx.tool_calls_used += 1
    if ctx.tool_calls_used > MAX_TOOL_CALLS:
        return json.dumps({"error": "Tool call limit reached for this message; answer with what you have."}), False
    # Persist the conversation so far; the tool runs as a separate API request
    await ctx.db.commit()
    try:
        content = await ctx.mcp._execute_api_tool(
            client=ctx.mcp._http_client,
            tool_name=mcp_name,
            arguments=args,
            operation_map=ctx.mcp.operation_map,
            http_request_info=ctx.http_info,
        )
    except Exception as exc:
        logger.info("Chat tool %s failed: %s", mcp_name, exc)
        return _tool_error(exc), False
    return _compact_result(content), True


def _parse_args(raw: str | None) -> dict | None:
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return None
    return args if isinstance(args, dict) else None


async def enrich_tool_args(args: dict, db: AsyncSession, user: User) -> dict:
    """Copy of the tool arguments with names/prices added so the approval card is readable."""
    enriched = json.loads(json.dumps(args))
    try:
        items = enriched.get("items")
        if isinstance(items, list):
            ids = [str(it.get("item_id")) for it in items if isinstance(it, dict) and it.get("item_id")]
            if ids:
                result = await db.execute(
                    select(Item.id, Item.name, Item.price, Item.unit_type).where(
                        Item.id.in_(ids), Item.user_id == user.id
                    )
                )
                catalog = {str(r.id): r for r in result.all()}
                for it in items:
                    row = catalog.get(str(it.get("item_id")))
                    if not row:
                        continue
                    it.setdefault("item_name", row.name)
                    it["unit_type"] = row.unit_type.value if row.unit_type else "unit"
                    quantity = float(it.get("quantity") or 0)
                    price = float(it.get("unit_price_override") or row.price or 0)
                    it["price"] = price
                    # Gram products are priced per kilogram
                    it["total_price"] = price * quantity / 1000 if it["unit_type"] == "gram" else price * quantity

        if enriched.get("customer_id"):
            result = await db.execute(
                select(Customer.name).where(Customer.id == enriched["customer_id"], Customer.user_id == user.id)
            )
            name = result.scalar_one_or_none()
            if name:
                enriched["customer_name"] = name

        supplier = enriched.get("supplier")
        if isinstance(supplier, dict) and supplier.get("id") and not supplier.get("name"):
            result = await db.execute(select(Supplier.name).where(Supplier.id == supplier["id"]))
            supplier["name"] = result.scalar_one_or_none()
    except Exception:
        # The preview is best-effort; never block the approval because of it
        logger.exception("Could not enrich tool args")
    return enriched


# ─── Model loop ──────────────────────────────────────────────────────────────

async def _process_tool_queue(ctx: ChatContext, queue: list[dict], name_map: dict[str, str]) -> bool:
    """Run queued tool calls in order. Returns True when paused waiting for user approval."""
    for index, call in enumerate(queue):
        safe_name = call["function"]["name"]
        mcp_name = name_map.get(safe_name)
        args = _parse_args(call["function"].get("arguments"))

        if mcp_name is None:
            result = json.dumps({"error": f"Unknown tool '{safe_name}'"})
        elif args is None:
            result = json.dumps({"error": "Arguments were not valid JSON"})
        elif mcp_name in WRITE_OPERATIONS:
            _add_message(
                ctx,
                role="action",
                content=None,
                pending_action={
                    "status": ACTION_PENDING,
                    "name": mcp_name,
                    "preview": await enrich_tool_args(args, ctx.db, ctx.user),
                    # The exact calls to run on approval; never taken from the browser
                    "queue": queue[index:],
                },
            )
            return True
        else:
            result, _ = await _execute_tool(ctx, mcp_name, args)

        _add_message(ctx, role="tool", tool_call_id=call["id"], content=result)
    return False


async def _run_model(ctx: ChatContext) -> None:
    config = await get_llm_config(ctx.db, ctx.user.id)
    if not config.is_usable:
        raise ChatError("no_api_key")
    client = build_client(config)
    tools, name_map = _tool_specs(ctx.mcp)

    for _ in range(MAX_MODEL_ROUNDS):
        try:
            response = await client.chat.completions.create(
                model=config.model,
                messages=await _model_history(ctx),
                tools=tools or None,
                **temperature_kwargs(config),
            )
        except Exception as exc:
            logger.warning("Chat provider error: %s", exc)
            raise ChatError(classify_provider_error(exc), provider_error_detail(exc))

        if not response.choices:
            raise ChatError("provider_error", "The provider returned an empty response")
        message = response.choices[0].message

        if not message.tool_calls:
            content = message.content or getattr(message, "reasoning", None) or ""
            _add_message(ctx, role="assistant", content=content)
            return

        calls = [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.function.name, "arguments": tc.function.arguments or "{}"},
            }
            for tc in message.tool_calls
        ]
        _add_message(ctx, role="assistant", content=message.content or None, tool_calls=calls)
        if await _process_tool_queue(ctx, calls, name_map):
            return

    raise ChatError("too_many_steps")


async def _resolve_action(ctx: ChatContext, action: ChatMessage, approved: bool) -> bool:
    """Run (or decline) a stored action. Returns True if another approval is now pending."""
    pending = dict(action.pending_action or {})
    queue: list[dict] = pending.get("queue") or []
    pending["status"] = ACTION_APPROVED if approved else ACTION_REJECTED
    pending["queue"] = []
    action.pending_action = pending  # reassign so the JSONB change is persisted

    if not queue:
        return False
    first, rest = queue[0], queue[1:]

    if approved:
        args = _parse_args(first["function"].get("arguments")) or {}
        result, ok = await _execute_tool(ctx, pending["name"], args)
        # New dict (not an in-place edit) so SQLAlchemy sees the JSONB change
        action.pending_action = {**pending, "result_ok": ok}
        _add_message(ctx, role="tool", tool_call_id=first["id"], content=result)
        _, name_map = _tool_specs(ctx.mcp)
        return await _process_tool_queue(ctx, rest, name_map)

    _add_message(
        ctx,
        role="tool",
        tool_call_id=first["id"],
        content=json.dumps({"error": "The user declined this operation. It was not executed."}),
    )
    # Later calls from the same turn depended on the declined one; skip them too
    for call in rest:
        _add_message(
            ctx,
            role="tool",
            tool_call_id=call["id"],
            content=json.dumps({"error": "Skipped because the user declined a previous operation."}),
        )
    return False


async def _pending_actions(db: AsyncSession, conversation_id: UUID) -> list[ChatMessage]:
    return [
        m
        for m in await _conversation_messages(db, conversation_id)
        if m.role == "action" and (m.pending_action or {}).get("status") == ACTION_PENDING
    ]


async def _respond(ctx: ChatContext, conversation: ChatConversation, error: ChatError | None) -> ChatResponse:
    conversation.updated_at = datetime.now(timezone.utc)
    await ctx.db.commit()
    return ChatResponse(
        conversation_id=ctx.conversation_id,
        messages=[ChatMessageRead.model_validate(m) for m in ctx.added if _is_visible(m)],
        error=error.code if error else None,
        error_detail=error.detail if error else None,
    )


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ChatConversationRead])
async def list_conversations(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.updated_at.desc())
        .limit(100)
    )
    return result.scalars().all()


@router.get("/conversations/{conversation_id}", response_model=ChatConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    conversation = await _get_conversation(db, user, conversation_id)
    messages = await _conversation_messages(db, conversation_id)
    return ChatConversationDetail(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[ChatMessageRead.model_validate(m) for m in messages if _is_visible(m)],
    )


@router.patch("/conversations/{conversation_id}", response_model=ChatConversationRead)
async def rename_conversation(
    conversation_id: UUID,
    data: ChatConversationUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    conversation = await _get_conversation(db, user, conversation_id)
    conversation.title = data.title.strip()
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    conversation = await _get_conversation(db, user, conversation_id)
    await db.delete(conversation)
    await db.commit()
    return Response(status_code=204)


@router.post("", response_model=ChatResponse)
async def chat_with_mcp(
    request: Request,
    payload: ChatRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    if payload.conversation_id:
        conversation = await _get_conversation(db, user, payload.conversation_id)
    else:
        conversation = ChatConversation(user_id=user.id, title=_title_from(payload.message))
        db.add(conversation)
        await db.flush()

    ctx = ChatContext(
        request, db, user, conversation.id, payload.locale, payload.timezone, payload.currency_symbol
    )

    # A new message while an approval is pending means the user moved on: decline it
    for action in await _pending_actions(db, conversation.id):
        await _resolve_action(ctx, action, approved=False)
    ctx.added = [m for m in ctx.added if m.role != "tool"]

    _add_message(ctx, role="user", content=payload.message)
    error = None
    try:
        await _run_model(ctx)
    except ChatError as exc:
        error = exc
    return await _respond(ctx, conversation, error)


@router.post("/execute", response_model=ChatResponse)
async def execute_tool(
    request: Request,
    payload: ChatExecuteRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
):
    conversation = await _get_conversation(db, user, payload.conversation_id)
    result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.id == payload.action_message_id,
            ChatMessage.conversation_id == conversation.id,
            ChatMessage.role == "action",
        )
    )
    action = result.scalars().first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if (action.pending_action or {}).get("status") != ACTION_PENDING:
        raise HTTPException(status_code=409, detail="This action was already resolved")

    ctx = ChatContext(
        request, db, user, conversation.id, payload.locale, payload.timezone, payload.currency_symbol
    )
    action_id = action.id
    error = None
    try:
        paused = await _resolve_action(ctx, action, payload.approved)
        if not paused:
            await _run_model(ctx)
    except ChatError as exc:
        error = exc

    response = await _respond(ctx, conversation, error)
    # Include the resolved action so the UI can update its status badge
    refreshed = await db.execute(
        select(ChatMessage).where(ChatMessage.id == action_id).execution_options(populate_existing=True)
    )
    response.messages.insert(0, ChatMessageRead.model_validate(refreshed.scalars().first()))
    return response
