# apps/api/tests/integration/test_check_username_endpoint.py
# Integration tests for GET /api/v1/auth/check-username
#
# Strategy:
#   - Real DB session via db_session fixture (SAVEPOINT rollback)
#   - Endpoint is unauthenticated — no JWT needed
#   - ProfileRepository called against real test DB
#   - No service mocks — tests the full router → repo path

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.profile import Profile

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def check_username_client(db_session):
    """AsyncClient wired to the app with real DB session."""
    from typing import cast

    from app.db.session import get_db_session
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(
        transport=ASGITransport(app=cast(object, app)),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_profile_with_username(
    db_session,
    username: str,
    user_id: str | None = None,
) -> Profile:
    profile = Profile(
        id=user_id or str(uuid.uuid4()),
        full_name="Test User",
        email_notifications=True,
        timezone="UTC",
        username=username,
    )  # type: ignore[call-arg]
    db_session.add(profile)
    await db_session.flush()
    return profile


# ---------------------------------------------------------------------------
# GET /api/v1/auth/check-username
# ---------------------------------------------------------------------------


class TestCheckUsernameEndpoint:
    async def test_available_username_returns_available_true(self, check_username_client):
        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "availablename"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["available"] is True
        assert data["username"] == "availablename"
        assert data["message"] == "Available"

    async def test_taken_username_returns_available_false(self, check_username_client, db_session):
        await _seed_profile_with_username(db_session, "takenname")

        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "takenname"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        assert data["message"] == "Already taken"

    async def test_own_username_returns_available_true(self, check_username_client, db_session):
        """Passing current_user_id excludes own username from taken check."""
        user_id = str(uuid.uuid4())
        await _seed_profile_with_username(db_session, "myname", user_id=user_id)

        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "myname", "current_user_id": user_id},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["available"] is True

    async def test_invalid_format_returns_available_false_with_message(self, check_username_client):
        """Invalid username format returns 200 with available=False and validation message."""
        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "-invalid"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False
        assert len(data["message"]) > 0

    async def test_too_short_username_returns_available_false(self, check_username_client):
        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "ab"},
        )

        assert response.status_code == 200
        assert response.json()["available"] is False

    async def test_consecutive_hyphens_returns_available_false(self, check_username_client):
        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "su--yash"},
        )

        assert response.status_code == 200
        assert response.json()["available"] is False

    async def test_no_auth_header_required(self, check_username_client):
        """Endpoint is fully public — no Authorization header needed."""
        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "publiccheck"},
        )

        assert response.status_code == 200

    async def test_missing_username_param_returns_422(self, check_username_client):
        """username query param is required."""
        response = await check_username_client.get(
            "/api/v1/auth/check-username",
        )

        assert response.status_code == 422

    async def test_case_insensitive_taken_check(self, check_username_client, db_session):
        """Taken check is case-insensitive — uppercase query matches lowercase stored."""
        await _seed_profile_with_username(db_session, "takenname")

        response = await check_username_client.get(
            "/api/v1/auth/check-username",
            params={"username": "TAKENNAME"},
        )

        assert response.status_code == 200
        assert response.json()["available"] is False
