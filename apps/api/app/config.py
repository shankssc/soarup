# apps/api/app/config.py
# Settings via pydantic-settings — reads from environment variables

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # === Environment ===
    environment: str = "local"
    debug: bool = False

    # === Database ===
    # Use str for default; pydantic validates at runtime
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@db:5432/soarup",  # pragma: allowlist secret
        description="PostgreSQL connection URL",
    )

    # === Redis (Celery broker + cache) ===
    redis_url: str = Field(
        default="redis://redis:6379/0",
        description="Redis connection URL",
    )

    # === Cloudflare R2 / Minio (local) ===
    r2_endpoint_url: str = Field(
        default="http://minio:9000",
        description="R2/Minio endpoint URL",
    )
    r2_bucket_name: str = "soarup-local"
    r2_access_key_id: SecretStr = Field(default=SecretStr("minioadmin"))
    r2_secret_access_key: SecretStr = Field(default=SecretStr("minioadmin"))

    # === Supabase Auth ===
    supabase_url: str = Field(
        default="http://localhost:54321",
        description="Supabase project URL",
    )
    supabase_jwt_secret: SecretStr = Field(
        default=SecretStr(
            "your-local-jwt-secret-change-in-prod",
        ),  # pragma: allowlist secret
    )

    # === AI Services ===
    openai_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None

    # === Notifications ===
    resend_api_key: SecretStr | None = None
    novu_api_key: SecretStr | None = None

    # === Observability ===
    sentry_dsn: str | None = Field(
        default=None,
        description="Sentry DSN for error tracking",
    )


# Singleton instance
settings = Settings()
