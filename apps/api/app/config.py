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

    # === App ===
    app_base_url: str = Field(
        default="http://localhost:3000",
        description=("Public base URL of the Next.js frontend. Used to construct " "invite links sent in emails. Set APP_BASE_URL=https://soarup.app " "in production."),
    )

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
    r2_public_endpoint_url: str = Field(
        default="http://localhost:9000",
        description="Public-facing R2/Minio URL used in presigned URLs returned to the browser.",
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
        default="/tmp/whisper-models",  # Noqa: S108 # nosec B108
        description="Directory to cache downloaded Whisper models.",
    )

    # === Notifications ===
    resend_api_key: SecretStr | None = None
    novu_api_key: SecretStr | None = None
    resend_from_email: str = Field(
        default="onboarding@resend.dev",
        description=("From address for transactional emails. " "Defaults to Resend's shared test address for local dev. " "Set RESEND_FROM_EMAIL=invites@soarup.app in production."),
    )

    # === Slack Integration ===
    slack_integration_enabled: bool = Field(
        default=False,
        description="Enable Slack integration features. " "Set SLACK_INTEGRATION_ENABLED=true to activate.",
    )
    slack_encryption_key: SecretStr | None = Field(
        None,
        description="Fernet key for encrypting Slack webhook URLs at rest. " "Generate with: python -c 'from cryptography.fernet import " "Fernet; print(Fernet.generate_key().decode())'",
    )

    @field_validator("slack_encryption_key", mode="after")
    @classmethod
    def validate_slack_key(cls, v: SecretStr | None, info: ValidationInfo) -> SecretStr | None:
        if info.data.get("environment") == "production" and info.data.get("slack_integration_enabled") and not v:
            raise ValueError("SLACK_ENCRYPTION_KEY is required in production " "when SLACK_INTEGRATION_ENABLED=true")
        return v

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

    @field_validator("app_base_url", mode="after")
    @classmethod
    def validate_app_base_url(cls, v: str, info: ValidationInfo) -> str:
        if info.data.get("environment") == "production" and "localhost" in v:
            raise ValueError("APP_BASE_URL must not point to localhost in production")
        return v

    @field_validator("resend_from_email", mode="after")
    @classmethod
    def validate_resend_from_email(cls, v: str, info: ValidationInfo) -> str:
        if info.data.get("environment") == "production" and "resend.dev" in v:
            raise ValueError("RESEND_FROM_EMAIL must not use resend.dev test address in production")
        return v

    # === Rate Limiting ===
    rate_limit_enabled: bool = Field(
        default=True,
        description="Enable GCRA-based rate limiting on update endpoints. " "Set RATE_LIMIT_ENABLED=false to disable (e.g. for load testing).",
    )
    rate_limit_requests_per_minute: int = Field(
        default=10,
        description="Steady-state requests allowed per minute, per client IP, " "on rate-limited endpoints. Flat limit — not tier-based, since " "billing/plans don't exist yet (see milestone doc Known Tradeoffs).",
    )
    rate_limit_burst: int = Field(
        default=3,
        description="Extra requests allowed in a short burst on top of the " "steady-state rate before GCRA starts rejecting — e.g. so a client " "retrying a flaky request isn't immediately throttled.",
    )


# Singleton instance
settings = Settings()
