# apps/api/tests/integration/test_rate_limiting.py
# Integration tests for the GCRA rate limiter itself.
#
# All other integration tests run with rate limiting disabled (see
# conftest.py's autouse disable_rate_limiting fixture) — this file is the
# one place it's deliberately re-enabled, against the real test Redis
# instance (localhost:6380), to verify the limiter actually works rather
# than trusting it in isolation from app/lib/rate_limit.py's unit tests.

from datetime import UTC, datetime
from typing import Any, cast
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis

from app.api.dependencies import require_onboarded
from app.db.redis import get_redis_client
from app.db.session import get_db_session
from app.main import create_app
from app.routers.updates import get_update_service
from app.schemas.update import UpdateResponse

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-abc"
UPDATE_ID = "update-xyz"
USER_ID = "user-rate-limit-test"
EMAIL = "ratelimit@example.com"
TODAY = "2026-05-14"


def _onboarded_user_ctx(user_id: str = USER_ID, email: str = EMAIL) -> dict[str, str]:
    return {"user_id": user_id, "email": email, "access_token": "tok"}


def _fake_update_response(**overrides: Any) -> UpdateResponse:
    """
    Real UpdateResponse instance — not a bare MagicMock. create_success_response
    checks hasattr(data, "model_dump") to decide whether to call it; MagicMock
    auto-creates that attribute for ANY name accessed on it, so a plain
    MagicMock() silently "passes" that check and then fails JSON serialization
    when .model_dump() itself returns another MagicMock instead of a dict.
    """
    base = {
        "id": UPDATE_ID,
        "workspace_id": WORKSPACE_ID,
        "user_id": USER_ID,
        "content": "Today I worked on tests",
        "mode": "text",
        "status": "pending",
        "summary": None,
        "update_date": TODAY,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
        "author_name": "Test User",
        "author_avatar_url": None,
    }
    return UpdateResponse(**{**base, **overrides})


def _make_mock_update_service() -> MagicMock:
    from unittest.mock import AsyncMock

    svc = MagicMock()
    svc.submit_update = AsyncMock()
    svc.edit_update = AsyncMock()
    svc.delete_update = AsyncMock(return_value=None)
    return svc


@pytest.fixture
def mock_update_service() -> MagicMock:
    return _make_mock_update_service()


@pytest_asyncio.fixture
async def test_redis_client(test_settings):
    """
    Real Redis client pointed at the isolated test container
    (localhost:6380, matching test_settings.redis_url) — NOT the
    module-level singleton in app/db/redis.py, which reads from the
    global app settings object and resolves to the Docker-internal
    `redis` hostname, only reachable from inside the docker-compose
    network.

    Requires: docker compose -f docker-compose.test.yml up -d
    """
    client = Redis.from_url(test_settings.redis_url, decode_responses=True)
    try:
        await client.ping()
    except Exception as e:
        await client.aclose()
        pytest.fail("Test Redis (localhost:6380) is not reachable — start it with " "`docker compose -f docker-compose.test.yml up -d` before running " f"rate limit tests. Original error: {e}")

    yield client

    async for key in client.scan_iter(match="ratelimit:*"):
        await client.delete(key)
    await client.aclose()


@pytest.fixture
async def rate_limited_client(db_session, mock_update_service, test_redis_client):
    """
    Like update_client in test_update_endpoints.py, but explicitly
    re-enables rate limiting and overrides get_redis_client to point at
    the real test Redis instance.

    Note: patching settings.rate_limit_requests_per_minute/.rate_limit_burst
    here only affects submit_update. edit_update and delete_update pass
    explicit requests_per_minute/burst values to rate_limit(...) at router
    import time (see app/routers/updates.py) — those are baked into the
    dependency closure and always win over live settings, by design (an
    explicit per-route override should beat a global default). Their tests
    exercise the real configured values instead of trying to patch them.
    """
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[get_update_service] = lambda: mock_update_service
    app.dependency_overrides[require_onboarded] = lambda: _onboarded_user_ctx()
    app.dependency_overrides[get_redis_client] = lambda: test_redis_client

    with (
        patch("app.api.dependencies.settings.rate_limit_enabled", True),
        patch("app.api.dependencies.settings.rate_limit_requests_per_minute", 2),
        patch("app.api.dependencies.settings.rate_limit_burst", 0),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=cast(Any, app)),
            base_url="http://test",
        ) as client:
            yield client, mock_update_service

    app.dependency_overrides.clear()


class TestSubmitUpdateRateLimit:
    @pytest.mark.asyncio
    async def test_requests_within_limit_succeed(self, rate_limited_client, auth_headers):
        """
        The shared fixture uses burst=0, which is correct for the
        rejection-focused tests below but means zero tolerance for two
        requests arriving close together — even "2 requests per minute"
        enforces a full 30s gap between them with no slack. To actually
        test "N rapid requests succeed," burst must be at least N-1, so
        this test overrides burst locally rather than loosening the
        shared fixture the other tests depend on staying tight.
        """
        client, svc = rate_limited_client
        svc.submit_update.return_value = _fake_update_response()

        with patch("app.api.dependencies.settings.rate_limit_burst", 1):
            for _ in range(2):
                response = await client.post(
                    f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
                    json={"content": "update", "update_date": TODAY},
                    headers=auth_headers(USER_ID),
                )
                assert response.status_code != 429

    @pytest.mark.asyncio
    async def test_exceeding_limit_returns_429(self, rate_limited_client, auth_headers):
        client, svc = rate_limited_client
        svc.submit_update.return_value = _fake_update_response()

        statuses = []
        for _ in range(5):
            response = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
                json={"content": "update", "update_date": TODAY},
                headers=auth_headers(USER_ID),
            )
            statuses.append(response.status_code)

        assert 429 in statuses

    @pytest.mark.asyncio
    async def test_429_response_has_retry_after_header(self, rate_limited_client, auth_headers):
        client, svc = rate_limited_client
        svc.submit_update.return_value = _fake_update_response()

        response = None
        for _ in range(5):
            response = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
                json={"content": "update", "update_date": TODAY},
                headers=auth_headers(USER_ID),
            )
            if response.status_code == 429:
                break

        assert response is not None
        assert response.status_code == 429
        assert "Retry-After" in response.headers
        assert int(response.headers["Retry-After"]) >= 0

    @pytest.mark.asyncio
    async def test_429_response_body_shape(self, rate_limited_client, auth_headers):
        client, svc = rate_limited_client
        svc.submit_update.return_value = _fake_update_response()

        response = None
        for _ in range(5):
            response = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
                json={"content": "update", "update_date": TODAY},
                headers=auth_headers(USER_ID),
            )
            if response.status_code == 429:
                break

        assert response is not None
        body = response.json()
        assert body["error"] == "rate_limited"

    @pytest.mark.asyncio
    async def test_different_users_have_independent_limits(self, rate_limited_client, auth_headers):
        client, svc = rate_limited_client
        svc.submit_update.return_value = _fake_update_response()

        for _ in range(5):
            response = await client.post(
                f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
                json={"content": "update", "update_date": TODAY},
                headers=auth_headers(USER_ID),
            )
            if response.status_code == 429:
                break

        other_response = await client.post(
            f"/api/v1/workspaces/{WORKSPACE_ID}/updates",
            json={"content": "update", "update_date": TODAY},
            headers=auth_headers("a-completely-different-user"),
        )
        assert other_response.status_code != 429


class TestEditDeleteRateLimit:
    @pytest.mark.asyncio
    async def test_edit_endpoint_is_rate_limited(self, rate_limited_client, auth_headers):
        """
        edit_update is configured with requests_per_minute=30, burst=5 at
        the router level (see updates.py) — those values are baked into
        the dependency closure at import time and can't be overridden by
        patching settings here. Firing enough rapid requests to exceed
        burst+1 reliably trips the real configured limit instead.
        """
        client, svc = rate_limited_client
        svc.edit_update.return_value = _fake_update_response(content="edited")

        statuses = []
        for _ in range(10):
            response = await client.patch(
                f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
                json={"content": "edited"},
                headers=auth_headers(USER_ID),
            )
            statuses.append(response.status_code)

        assert 429 in statuses

    @pytest.mark.asyncio
    async def test_delete_endpoint_is_rate_limited(self, rate_limited_client, auth_headers):
        """Same reasoning as test_edit_endpoint_is_rate_limited above."""
        client, svc = rate_limited_client
        svc.delete_update.return_value = None

        statuses = []
        for _ in range(10):
            response = await client.delete(
                f"/api/v1/workspaces/{WORKSPACE_ID}/updates/{UPDATE_ID}",
                headers=auth_headers(USER_ID),
            )
            statuses.append(response.status_code)

        assert 429 in statuses
