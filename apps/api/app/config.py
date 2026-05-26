# apps/api/app/config.py
# Settings via pydantic-settings — reads from environment variables

from pydantic import Field, SecretStr, ValidationInfo, field_validator
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
    # Safe defaults for local dev (no secrets)
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
    # Sensitive: require from .env, no default
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None

    # === Supabase Auth ===
    supabase_url: str = Field(
        default="http://localhost:54321",
        description="Supabase project URL",
    )
    # Sensitive: require from .env, no default
    supabase_jwt_secret: SecretStr | None = None
    supabase_anon_key: SecretStr | None = None
    supabase_jwt_aud: str = "authenticated"

    # === AI Services ===
    openai_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None

    # === Whisper (faster-whisper transcription) ===
    whisper_model_size: str = Field(
        default="base",
        description="faster-whisper model size. Use 'tiny' if memory is constrained.",
    )
    whisper_model_cache: str = Field(
        default="/tmp/whisper-models",  # Noqa: S108
        description="Directory to cache downloaded Whisper models.",
    )

    # === Notifications ===
    resend_api_key: SecretStr | None = None
    novu_api_key: SecretStr | None = None

    # === Observability ===
    sentry_dsn: str | None = None

    # === Validation: Fail fast in production if secrets are missing ===
    @field_validator("r2_access_key_id", "r2_secret_access_key", mode="after")
    @classmethod
    def validate_r2_secrets(cls, v: SecretStr | None, info: ValidationInfo) -> SecretStr | None:
        if info.data.get("environment") == "production" and not v:
            raise ValueError("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required in production")
        return v

    @field_validator("supabase_jwt_secret", mode="after")
    @classmethod
    def validate_supabase_secret(cls, v: SecretStr | None, info: ValidationInfo) -> SecretStr | None:
        if info.data.get("environment") == "production" and not v:
            raise ValueError("SUPABASE_JWT_SECRET is required in production")
        return v

    @field_validator("supabase_anon_key", mode="after")  # ← ADD THIS VALIDATOR
    @classmethod
    def validate_supabase_anon_key(cls, v: SecretStr | None, info: ValidationInfo) -> SecretStr | None:
        if info.data.get("environment") == "production" and not v:
            raise ValueError("SUPABASE_ANON_KEY is required in production")
        return v


# Singleton instance
settings = Settings()
