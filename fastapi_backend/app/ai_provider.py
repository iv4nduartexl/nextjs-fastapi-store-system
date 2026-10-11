"""AI provider configuration for the chat assistant.

Every supported provider speaks the OpenAI chat-completions API, so one client covers them all;
presets only pre-fill the base URL and a suggested model.
"""
import base64
import hashlib
import logging
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

import openai
from cryptography.fernet import Fernet, InvalidToken
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.models import AISettings

logger = logging.getLogger(__name__)

PROVIDER_PRESETS: list[dict] = [
    {
        "id": "openrouter",
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "deepseek/deepseek-chat",
        "requires_key": True,
    },
    {
        "id": "openai",
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "requires_key": True,
    },
    {
        "id": "deepseek",
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "requires_key": True,
    },
    {
        "id": "groq",
        "label": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "llama-3.3-70b-versatile",
        "requires_key": True,
    },
    {
        "id": "anthropic",
        "label": "Anthropic (OpenAI-compatible)",
        "base_url": "https://api.anthropic.com/v1/",
        "default_model": "claude-haiku-5-5",
        "requires_key": True,
    },
    {
        "id": "ollama",
        "label": "Ollama (local)",
        "base_url": "http://localhost:11434/v1",
        "default_model": "llama3.1",
        "requires_key": False,
    },
    {
        "id": "custom",
        "label": "Custom (OpenAI-compatible)",
        "base_url": "",
        "default_model": "",
        "requires_key": False,
    },
]

PRESETS_BY_ID = {p["id"]: p for p in PROVIDER_PRESETS}


# ─── Encryption ──────────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    secret = settings.AI_SETTINGS_SECRET_KEY or settings.ACCESS_SECRET_KEY
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode()).decode()


def decrypt_api_key(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        # The secret changed since the key was saved; treat it as missing so the user re-enters it
        logger.warning("Could not decrypt stored AI API key")
        return None


def api_key_hint(api_key: str | None) -> str | None:
    if not api_key:
        return None
    return api_key[-4:]


# ─── Resolved config ─────────────────────────────────────────────────────────

@dataclass
class LLMConfig:
    provider: str
    base_url: str
    model: str
    api_key: str | None
    temperature: float | None = None

    @property
    def is_usable(self) -> bool:
        requires_key = PRESETS_BY_ID.get(self.provider, {}).get("requires_key", False)
        return bool(self.base_url and self.model and (self.api_key or not requires_key))


async def get_user_ai_settings(db: AsyncSession, user_id: UUID) -> AISettings | None:
    result = await db.execute(select(AISettings).where(AISettings.user_id == user_id))
    return result.scalars().first()


def default_llm_config() -> LLMConfig:
    return LLMConfig(
        provider="openrouter",
        base_url=settings.AI_DEFAULT_BASE_URL,
        model=settings.AI_DEFAULT_MODEL,
        api_key=settings.OPENROUTER_API_KEY,
    )


async def get_llm_config(db: AsyncSession, user_id: UUID) -> LLMConfig:
    """The user's own provider settings, or the server defaults from the environment."""
    row = await get_user_ai_settings(db, user_id)
    if row is None:
        return default_llm_config()
    return LLMConfig(
        provider=row.provider,
        base_url=row.base_url,
        model=row.model,
        api_key=decrypt_api_key(row.api_key_encrypted),
        temperature=float(row.temperature) if row.temperature is not None else None,
    )


def build_client(config: LLMConfig) -> AsyncOpenAI:
    headers = {}
    if config.provider == "openrouter":
        # Optional attribution headers recommended by OpenRouter
        headers = {"HTTP-Referer": settings.FRONTEND_URL, "X-Title": "Store System"}
    return AsyncOpenAI(
        base_url=config.base_url,
        # Local servers (Ollama) ignore the key but the SDK requires a value
        api_key=config.api_key or "not-needed",
        default_headers=headers or None,
        timeout=60,
        max_retries=1,
    )


def temperature_kwargs(config: LLMConfig) -> dict:
    return {"temperature": config.temperature} if config.temperature is not None else {}


def to_decimal_temperature(value: float | None) -> Decimal | None:
    return Decimal(str(value)) if value is not None else None


# ─── Errors ──────────────────────────────────────────────────────────────────

def classify_provider_error(exc: Exception) -> str:
    """Map an OpenAI-SDK exception to a stable code the frontend can translate."""
    if isinstance(exc, openai.AuthenticationError | openai.PermissionDeniedError):
        return "invalid_api_key"
    if isinstance(exc, openai.NotFoundError):
        return "model_not_found"
    if isinstance(exc, openai.RateLimitError):
        return "rate_limited"
    if isinstance(exc, openai.APITimeoutError):
        return "timeout"
    if isinstance(exc, openai.APIConnectionError):
        return "connection_error"
    if isinstance(exc, openai.BadRequestError):
        return "bad_request"
    return "provider_error"


def provider_error_detail(exc: Exception) -> str:
    message = getattr(exc, "message", None) or str(exc)
    return message[:500]
