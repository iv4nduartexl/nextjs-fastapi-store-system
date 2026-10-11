from typing import Set

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # OpenAPI docs
    OPENAPI_URL: str = "/openapi.json"

    # Database
    DATABASE_URL: str
    TEST_DATABASE_URL: str | None = None
    EXPIRE_ON_COMMIT: bool = False

    # User
    ACCESS_SECRET_KEY: str
    RESET_PASSWORD_SECRET_KEY: str
    VERIFICATION_SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_SECONDS: int = 86400  # 1 day

    # Email
    MAIL_USERNAME: str | None = None
    MAIL_PASSWORD: str | None = None
    MAIL_FROM: str | None = None
    MAIL_SERVER: str | None = None
    MAIL_PORT: int | None = None
    MAIL_FROM_NAME: str = "FastAPI template"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True
    TEMPLATE_DIR: str = "email_templates"

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # Platform administrator: the only account with superuser rights (see commands/create_superuser.py)
    SUPERUSER_EMAIL: str | None = None
    # Only used to create that account (and by `make reset-superuser-password`); never printed
    SUPERUSER_PASSWORD: str | None = None
    # Lifetime of "view as" tokens issued to the superuser
    IMPERSONATION_TOKEN_EXPIRE_SECONDS: int = 3600

    # CORS
    CORS_ORIGINS: Set[str]

    # Chatbot (defaults used when a user hasn't configured their own AI provider)
    OPENROUTER_API_KEY: str | None = None
    AI_DEFAULT_BASE_URL: str = "https://openrouter.ai/api/v1"
    AI_DEFAULT_MODEL: str = "~deepseek/deepseek-v4-flash-latest"
    # Key used to encrypt users' AI API keys at rest (falls back to ACCESS_SECRET_KEY)
    AI_SETTINGS_SECRET_KEY: str | None = None


    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
