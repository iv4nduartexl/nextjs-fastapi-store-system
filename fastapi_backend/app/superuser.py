"""Keep the superuser role tied to SUPERUSER_EMAIL."""
import logging

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User

logger = logging.getLogger(__name__)


async def sync_superuser(session: AsyncSession) -> None:
    """Grant superuser to SUPERUSER_EMAIL only; anyone else who has the flag loses it."""
    email = (settings.SUPERUSER_EMAIL or "").strip().lower()
    revoke = update(User).where(User.is_superuser == True)  # noqa: E712
    if email:
        revoke = revoke.where(func.lower(User.email) != email)
    result = await session.execute(revoke.values(is_superuser=False))
    if result.rowcount:
        logger.warning("Removed superuser from %s account(s) not matching SUPERUSER_EMAIL", result.rowcount)
    if email:
        await session.execute(
            update(User).where(func.lower(User.email) == email).values(is_superuser=True, is_active=True)
        )
    await session.commit()
