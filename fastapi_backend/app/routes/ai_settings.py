import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_provider import (
    PRESETS_BY_ID,
    PROVIDER_PRESETS,
    LLMConfig,
    api_key_hint,
    build_client,
    classify_provider_error,
    decrypt_api_key,
    default_llm_config,
    encrypt_api_key,
    get_llm_config,
    get_business_ai_settings,
    provider_error_detail,
    to_decimal_temperature,
)
from app.database import get_async_session
from app.models import AISettings
from app.schemas import (
    AIModelList,
    AISettingsRead,
    AISettingsTestRequest,
    AISettingsTestResult,
    AISettingsUpdate,
)
from app.tenancy import TenantContext, current_tenant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ai-settings"])


def _read(config: LLMConfig, is_custom: bool) -> AISettingsRead:
    return AISettingsRead(
        provider=config.provider,
        base_url=config.base_url,
        model=config.model,
        temperature=config.temperature,
        has_api_key=bool(config.api_key),
        api_key_hint=api_key_hint(config.api_key),
        is_custom=is_custom,
        presets=PROVIDER_PRESETS,
    )


@router.get("", response_model=AISettingsRead)
async def get_ai_settings(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    row = await get_business_ai_settings(db, tenant.business_id)
    config = await get_llm_config(db, tenant.business_id)
    return _read(config, is_custom=row is not None)


@router.put("", response_model=AISettingsRead)
async def update_ai_settings(
    data: AISettingsUpdate,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    if data.provider not in PRESETS_BY_ID:
        raise HTTPException(status_code=422, detail="Unknown provider")
    base_url = data.base_url.strip()
    model = data.model.strip()
    if not base_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="base_url must start with http:// or https://")
    if not model:
        raise HTTPException(status_code=422, detail="model is required")

    row = await get_business_ai_settings(db, tenant.business_id)
    if row is None:
        row = AISettings(business_id=tenant.business_id, user_id=tenant.user_id)
        db.add(row)

    row.provider = data.provider
    row.base_url = base_url
    row.model = model
    row.temperature = to_decimal_temperature(data.temperature)
    if data.clear_api_key:
        row.api_key_encrypted = None
    elif data.api_key and data.api_key.strip():
        row.api_key_encrypted = encrypt_api_key(data.api_key.strip())

    await db.commit()
    config = await get_llm_config(db, tenant.business_id)
    return _read(config, is_custom=True)


@router.delete("", status_code=204)
async def reset_ai_settings(
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    """Forget the business's settings and go back to the server defaults."""
    row = await get_business_ai_settings(db, tenant.business_id)
    if row is not None:
        await db.delete(row)
        await db.commit()


async def _config_for_test(data: AISettingsTestRequest, db: AsyncSession, tenant: TenantContext) -> LLMConfig:
    saved = await get_llm_config(db, tenant.business_id)
    row = await get_business_ai_settings(db, tenant.business_id)
    provider = data.provider or saved.provider
    base_url = (data.base_url or saved.base_url).strip()
    api_key = (data.api_key or "").strip() or None
    if api_key is None:
        # Only reuse the saved key against the same endpoint, so it isn't sent to an arbitrary URL
        same_endpoint = base_url == saved.base_url
        if row is not None and same_endpoint:
            api_key = decrypt_api_key(row.api_key_encrypted)
        elif row is None and same_endpoint:
            api_key = default_llm_config().api_key
    return LLMConfig(
        provider=provider,
        base_url=base_url,
        model=(data.model or saved.model).strip(),
        api_key=api_key,
    )


@router.post("/test", response_model=AISettingsTestResult)
async def test_ai_settings(
    data: AISettingsTestRequest,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    config = await _config_for_test(data, db, tenant)
    if not config.is_usable:
        return AISettingsTestResult(ok=False, error="no_api_key")
    try:
        await build_client(config).chat.completions.create(
            model=config.model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
    except Exception as exc:
        logger.info("AI settings test failed: %s", exc)
        return AISettingsTestResult(
            ok=False, error=classify_provider_error(exc), detail=provider_error_detail(exc)
        )
    return AISettingsTestResult(ok=True)


@router.post("/models", response_model=AIModelList)
async def list_ai_models(
    data: AISettingsTestRequest,
    db: AsyncSession = Depends(get_async_session),
    tenant: TenantContext = Depends(current_tenant),
):
    """Model ids offered by the provider's /models endpoint (empty if it doesn't support it)."""
    config = await _config_for_test(data, db, tenant)
    if not config.base_url:
        return AIModelList(models=[])
    try:
        page = await build_client(config).models.list()
        models = sorted({m.id for m in page.data})
    except Exception as exc:
        logger.info("Listing AI models failed: %s", exc)
        return AIModelList(
            models=[], error=classify_provider_error(exc), detail=provider_error_detail(exc)
        )
    return AIModelList(models=models[:1000])
