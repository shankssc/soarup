# apps/api/tests/conftest.py

import os
import sys
import time
from pathlib import Path
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import Settings
from app.db.session import get_db_session
from app.main import create_app
from app.models.base import Base  # use shared Base, not model-specific metadata
from app.routers.auth import get_auth_service, get_profile_service

sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

# ---------------------------------------------------------------------------
# Environment defaults
# These are fallbacks; CI/CD should inject real values via env.
# Postgres: Supabase local instance, test database (run `supabase start` first)
# Redis:    Isolated test container (docker-compose.test.yml)
# ---------------------------------------------------------------------------
# "local" skips JWT issuer validation
os.environ.setdefault("ENVIRONMENT", "local")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:54322/soarup_test",  # pragma: allowlist secret
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6380/1")


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def test_settings():
    """
    Test settings pointing at:
    - Supabase local Postgres (port 54322, soarup_test DB)
    - Local Supabase GoTrue (port 54321) for auth_repo calls
    - Isolated Redis (port 6380)
    JWT secret matches Supabase CLI local default — allows real JWT signing in tests.
    """
    return Settings(
        environment="local",  # skips issuer validation in validate_supabase_jwt
        database_url="postgresql+asyncpg://postgres:postgres@localhost:54322/soarup_test",  # pragma: allowlist secret
        redis_url="redis://localhost:6380/1",
        supabase_url="http://localhost:54321",
        supabase_jwt_secret="super-secret-jwt-token-with-at-least-32-characters-long",  # Supabase CLI default  # noqa: S106 # pragma: allowlist secret
        r2_endpoint_url="http://localhost:9000",
        r2_bucket_name="soarup-test",
        r2_access_key_id="minioadmin",
        r2_secret_access_key="minioadmin",  # noqa: S106 # pragma: allowlist secret
        r2_account_id="test",
        openai_api_key="test-key",  # noqa: S106 # pragma: allowlist secret
        anthropic_api_key="test-key",  # noqa: S106 # pragma: allowlist secret
        resend_api_key="test-key",  # noqa: S106 # pragma: allowlist secret
        novu_api_key="test-key",  # noqa: S106 # pragma: allowlist secret
        debug=True,
    )


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def test_engine(test_settings):
    """
    Session-scoped engine against soarup_test DB.
    Creates all app tables (Alembic-managed schema must already exist —
    run `alembic upgrade head` against soarup_test before the test session).
    Drops app tables on teardown; auth schema is left untouched (owned by Supabase).
    """
    engine = create_async_engine(test_settings.database_url, echo=False)

    # Import all models so their tables register on Base.metadata
    import app.models.profile  # noqa: F401
    # Add other model imports here as the schema grows:
    # import app.models.workspace  # noqa: F401
    # import app.models.update     # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    """
    Per-test transactional session using nested transactions (SAVEPOINT).

    Why nested: the service layer calls session.commit() internally. A plain
    rollback on the outer transaction won't undo a committed inner transaction.
    Using begin_nested() wraps each test in a SAVEPOINT that the outer rollback
    can always undo, regardless of inner commits.
    """
    async_session = async_sessionmaker(test_engine, expire_on_commit=False)
    async with async_session() as session:  # Noqa: SIM117
        async with session.begin():  # Noqa: SIM117
            nested = await session.begin_nested()
            yield session
            await nested.rollback()


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def api_client(db_session, test_settings):
    """
    AsyncClient wired to the FastAPI app with DB session overridden.
    Auth dependencies are NOT overridden here — override them per-test
    when you need to bypass JWT validation (see: mock_auth_dep below).
    """
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# JWT / auth helpers
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def jwt_secret(test_settings):
    """Expose the JWT secret for test token signing."""
    return test_settings.supabase_jwt_secret.get_secret_value()


@pytest.fixture
def make_jwt(jwt_secret):
    """
    Factory: mint a real HS256-signed JWT using the test JWT secret.
    This token will pass validate_supabase_jwt in ENVIRONMENT=local
    (issuer check skipped; signature verified against test secret).
    """
    import jwt as pyjwt  # PyJWT

    def _make(
        user_id: str,
        email: str = "test@example.com",
        exp_offset: int = 3600,
        extra_claims: dict[str, Any] | None = None,
    ) -> str:
        payload = {
            "sub": user_id,
            "email": email,
            "exp": int(time.time()) + exp_offset,
            "aud": "authenticated",
            "role": "authenticated",
            **(extra_claims or {}),
        }
        return pyjwt.encode(payload, jwt_secret, algorithm="HS256")

    return _make


@pytest.fixture
def make_expired_jwt(jwt_secret):
    """Factory: mint an already-expired JWT for rejection tests."""
    import jwt as pyjwt

    def _make(user_id: str, email: str = "test@example.com") -> str:
        payload = {
            "sub": user_id,
            "email": email,
            "exp": int(time.time()) - 60,  # expired 60s ago
            "aud": "authenticated",
            "role": "authenticated",
        }
        return pyjwt.encode(payload, jwt_secret, algorithm="HS256")

    return _make


@pytest.fixture
def auth_headers(make_jwt):
    """
    Convenience: return Authorization headers for a given user_id.
    Usage: headers = auth_headers("some-uuid")
    """

    def _headers(user_id: str, email: str = "test@example.com") -> dict[str, Any]:
        return {"Authorization": f"Bearer {make_jwt(user_id, email)}"}

    return _headers


# ---------------------------------------------------------------------------
# Mock service factories
# ---------------------------------------------------------------------------


def _make_mock_auth_service() -> MagicMock:
    """
    MagicMock standing in for AuthService.
    All async methods are pre-configured as AsyncMocks returning sensible
    defaults — override per-test as needed.
    """
    svc = MagicMock()
    svc.login = AsyncMock()
    svc.signup = AsyncMock()
    svc.logout = AsyncMock(return_value=True)
    svc.refresh_tokens = AsyncMock()
    svc.request_password_reset = AsyncMock()
    svc.complete_password_reset = AsyncMock()
    return svc


def _make_mock_profile_service() -> MagicMock:
    svc = MagicMock()
    svc.get_profile = AsyncMock()
    svc.update_profile = AsyncMock()
    svc.upload_avatar = AsyncMock()
    svc.delete_avatar = AsyncMock(return_value=True)
    return svc


# ---------------------------------------------------------------------------
# Shared response builders (keep tests DRY)
# ---------------------------------------------------------------------------


def _login_response_dict(
    user_id: str = "user-abc",
    email: str = "test@example.com",
    is_onboarded: bool = False,
) -> dict[str, Any] | Any:
    """Minimal LoginResponse-shaped dict for mock returns."""
    from datetime import UTC, datetime

    from app.schemas.auth import LoginResponse, UserResponse

    user = UserResponse(
        id=user_id,
        email=email,
        full_name="Test User",
        avatar_url=None,
        email_verified=True,
        is_onboarded=is_onboarded,
        created_at=datetime.now(UTC).isoformat(),
    )
    return LoginResponse(
        access_token="access-token",  # Noqa: S106
        token_type="bearer",  # Noqa: S106
        expires_in=3600,
        refresh_token="refresh-token",  # Noqa: S106
        user=user,
    )


def _profile_response(
    user_id: str = "user-abc",
    email: str = "test@example.com",
    is_onboarded: bool = False,
) -> Any:
    from datetime import UTC, datetime

    from app.schemas.profile import ProfileResponse

    now = datetime.now(UTC)
    return ProfileResponse(
        user_id=user_id,
        email=email,
        full_name="Test User",
        avatar_url=None,
        timezone="UTC",
        email_notifications=True,
        email_verified=True,
        is_onboarded=is_onboarded,
        created_at=now,
        updated_at=now,
        last_login_at=None,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def mock_auth_service():
    """Yields a fresh mock AuthService per test."""
    return _make_mock_auth_service()


@pytest_asyncio.fixture
async def mock_profile_service():
    """Yields a fresh mock ProfileService per test."""
    return _make_mock_profile_service()


@pytest_asyncio.fixture
async def client_with_mocks(db_session, mock_auth_service, mock_profile_service):
    """
    AsyncClient with both service dependencies mocked out.
    Use this for all router integration tests — no real Supabase/DB calls.

    Auth dependency (JWT validation) is still active — pass valid tokens
    using the make_jwt / auth_headers fixtures from root conftest.
    """
    from typing import cast

    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_auth_service] = lambda: mock_auth_service
    app.dependency_overrides[get_profile_service] = lambda: mock_profile_service

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client, mock_auth_service, mock_profile_service

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def unauthenticated_client(db_session):
    """
    Client with service mocks but NO auth headers.
    Used for testing 401 responses on protected endpoints.
    """
    from typing import cast

    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_auth_service] = lambda: _make_mock_auth_service(
    )
    app.dependency_overrides[get_profile_service] = lambda: _make_mock_profile_service(
    )

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


# Expose helpers for use in test files
login_response = _login_response_dict
profile_response = _profile_response
