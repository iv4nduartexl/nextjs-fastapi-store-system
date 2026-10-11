import uuid
import re
from datetime import datetime, timezone

import jwt
from fastapi_users.jwt import decode_jwt, generate_jwt

from typing import Optional

from fastapi import Depends, Request
from fastapi_users import (
    BaseUserManager,
    FastAPIUsers,
    UUIDIDMixin,
    InvalidPasswordException,
    exceptions,
)
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.future import select

from .config import settings
from .database import get_user_db
from .email import send_reset_password_email
from .login_limits import clear_login_failures, record_login_failure
from .models import User
from .schemas import UserCreate

AUTH_URL_PATH = "auth"


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.RESET_PASSWORD_SECRET_KEY
    verification_token_secret = settings.VERIFICATION_SECRET_KEY

    async def on_after_login(
        self, user: User, request: Optional[Request] = None, response=None
    ):
        await self.user_db.update(user, {"last_login_at": datetime.now(timezone.utc)})

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        await send_reset_password_email(user, token)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        print(f"Verification requested for user {user.id}. Verification token: {token}")

    async def validate_password(
        self,
        password: str,
        user: UserCreate,
    ) -> None:
        errors = []

        if len(password) < 8:
            errors.append("Password should be at least 8 characters.")
        if user.email in password:
            errors.append("Password should not contain e-mail.")
        if not any(char.isupper() for char in password):
            errors.append("Password should contain at least one uppercase letter.")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            errors.append("Password should contain at least one special character.")

        if errors:
            raise InvalidPasswordException(reason=errors)

    async def authenticate(
        self, credentials: OAuth2PasswordRequestForm
    ) -> Optional[User]:
        user = await self._check_credentials(credentials)
        session = self.user_db.session
        if user is None or not user.is_active:
            await record_login_failure(session, credentials.username)
        else:
            await clear_login_failures(session, credentials.username)
        return user

    async def _check_credentials(
        self, credentials: OAuth2PasswordRequestForm
    ) -> Optional[User]:
        user: Optional[User] = None

        # Try email first
        try:
            user = await self.get_by_email(credentials.username)
        except exceptions.UserNotExists:
            pass

        # Fall back to username lookup
        if user is None:
            result = await self.user_db.session.execute(
                select(User).where(User.username == credentials.username)
            )
            user = result.scalars().first()

        if user is None:
            # Mitigate timing attack
            self.password_helper.hash(credentials.password)
            return None

        verified, updated_password_hash = self.password_helper.verify_and_update(
            credentials.password, user.hashed_password
        )
        if not verified:
            return None

        if updated_password_hash is not None:
            await self.user_db.update(user, {"hashed_password": updated_password_hash})

        return user

    async def sign_out_everywhere(self, user: User, extra: dict | None = None) -> User:
        """Invalidate all existing tokens of this user (optionally applying other changes too)."""
        return await self.user_db.update(user, {**(extra or {}), "token_version": (user.token_version or 0) + 1})


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


bearer_transport = BearerTransport(tokenUrl=f"{AUTH_URL_PATH}/jwt/login")


IMPERSONATION_CLAIM = "imp"
TOKEN_VERSION_CLAIM = "ver"


def _token_claims(token: str | None) -> dict:
    if not token:
        return {}
    try:
        return decode_jwt(token, settings.ACCESS_SECRET_KEY, ["fastapi-users:auth"], algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError:
        return {}


class AppJWTStrategy(JWTStrategy):
    """JWT strategy that also accepts superuser "view as" tokens.

    An impersonation token is a normal token for the target user plus an `imp` claim with the
    superuser's id. It is only valid while that account is still an active superuser.
    """

    async def read_token(self, token, user_manager):
        user = await super().read_token(token, user_manager)
        if user is None:
            return None
        # Tokens issued before the user's last password reset / deactivation are no longer valid.
        # Tokens without the claim (issued before this feature) count as version 0.
        if _token_claims(token).get(TOKEN_VERSION_CLAIM, 0) != (user.token_version or 0):
            return None
        impersonator_id = read_impersonator_id(token)
        if impersonator_id is not None:
            try:
                admin = await user_manager.get(impersonator_id)
            except exceptions.UserNotExists:
                return None
            if not (admin.is_active and admin.is_superuser):
                return None
        return user

    async def write_token(self, user: User) -> str:
        data = {"sub": str(user.id), "aud": self.token_audience, TOKEN_VERSION_CLAIM: user.token_version or 0}
        return generate_jwt(data, self.encode_key, self.lifetime_seconds, algorithm=self.algorithm)

    def write_impersonation_token(self, user: User, superuser_id: uuid.UUID) -> str:
        data = {
            "sub": str(user.id),
            "aud": self.token_audience,
            TOKEN_VERSION_CLAIM: user.token_version or 0,
            IMPERSONATION_CLAIM: str(superuser_id),
        }
        return generate_jwt(
            data,
            self.encode_key,
            settings.IMPERSONATION_TOKEN_EXPIRE_SECONDS,
            algorithm=self.algorithm,
        )


def get_jwt_strategy() -> AppJWTStrategy:
    return AppJWTStrategy(
        secret=settings.ACCESS_SECRET_KEY,
        lifetime_seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS,
    )


def read_impersonator_id(token: str | None) -> uuid.UUID | None:
    """The superuser id inside a "view as" token, or None for normal tokens."""
    value = _token_claims(token).get(IMPERSONATION_CLAIM)
    try:
        return uuid.UUID(value) if value else None
    except ValueError:
        return None


def request_impersonator_id(request: Request) -> uuid.UUID | None:
    header = request.headers.get("authorization", "")
    token = header[7:] if header.lower().startswith("bearer ") else None
    return read_impersonator_id(token)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)
