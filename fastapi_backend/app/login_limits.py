"""Throttle password guessing on /auth/jwt/login.

`login_rate_limit` runs before the login route: it remembers the client IP for this request and
answers 429 when the email (or IP) has too many recent failures. `UserManager.authenticate`
records failures and clears them after a successful sign-in.
"""
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_async_session
from app.models import LoginAttempt

WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_EMAIL = 10
# Higher: several cashiers of one store usually share the same public IP
MAX_FAILURES_PER_IP = 50

_client_ip: ContextVar[str | None] = ContextVar("login_client_ip", default=None)


def _client_ip_of(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def login_rate_limit(request: Request, db: AsyncSession = Depends(get_async_session)) -> None:
    if not request.url.path.endswith("/login"):
        return
    form = await request.form()
    email = str(form.get("username") or "").strip().lower()
    ip = _client_ip_of(request)
    _client_ip.set(ip)

    since = datetime.now(timezone.utc) - WINDOW
    by_email = (
        await db.execute(
            select(func.count(LoginAttempt.id)).where(LoginAttempt.email == email, LoginAttempt.created_at >= since)
        )
    ).scalar_one()
    by_ip = 0
    if ip:
        by_ip = (
            await db.execute(
                select(func.count(LoginAttempt.id)).where(LoginAttempt.ip == ip, LoginAttempt.created_at >= since)
            )
        ).scalar_one()
    if by_email >= MAX_FAILURES_PER_EMAIL or by_ip >= MAX_FAILURES_PER_IP:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="LOGIN_TOO_MANY_ATTEMPTS",
            headers={"Retry-After": str(int(WINDOW.total_seconds()))},
        )


async def record_login_failure(db: AsyncSession, email: str) -> None:
    now = datetime.now(timezone.utc)
    db.add(LoginAttempt(email=email.strip().lower(), ip=_client_ip.get(), created_at=now))
    # Keep the table small
    await db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < now - WINDOW))
    await db.commit()


async def clear_login_failures(db: AsyncSession, email: str) -> None:
    ip = _client_ip.get()
    condition = LoginAttempt.email == email.strip().lower()
    if ip:
        condition = or_(condition, LoginAttempt.ip == ip)
    await db.execute(delete(LoginAttempt).where(condition))
    await db.commit()
