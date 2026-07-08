# apps/api/tests/integration/test_public_profile_endpoint.py
# Integration tests for GET /api/v1/profiles/:username
#
# Strategy:
#   - Real DB session via db_session fixture (SAVEPOINT rollback)
#   - Endpoint is unauthenticated — no JWT needed
#   - AnalyticsService is mocked — avoids needing Update rows seeded
#     for every test; analytics correctness is covered in unit tests
#   - ProfileRepository called against real test DB

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.profile import Profile

pytestmark = pytest.mark.asyncio

USER_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_streak() -> MagicMock:
    streak = MagicMock()
    streak.current_streak = 5
    streak.best_streak = 10
    streak.total_submissions = 42
    streak.last_submission_date = "2026-07-07"
    streak.model_dump = lambda: {
        "current_streak": 5,
        "best_streak": 10,
        "total_submissions": 42,
        "last_submission_date": "2026-07-07",
    }
    return streak


def _mock_heatmap() -> list[MagicMock]:
    day = MagicMock()
    day.date = "2026-07-07"
    day.count = 1
    day.intensity = 3
    day.model_dump = lambda: {"date": "2026-07-07", "count": 1, "intensity": 3}
    return [day]


async def _seed_public_profile(
    db_session,
    username: str,
    user_id: str = USER_ID,
    profile_public: bool = True,
    bio: str | None = None,
    tagline: str | None = None,
) -> Profile:
    profile = Profile(
        id=user_id,
        full_name="Test User",
        email_notifications=True,
        timezone="UTC",
        username=username,
        profile_public=profile_public,
        bio=bio,
        tagline=tagline,
    )  # type: ignore[call-arg]
    db_session.add(profile)
    await db_session.flush()
    return profile


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def profiles_client(db_session):
    """AsyncClient wired to app with real DB and mocked AnalyticsService."""
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
# GET /api/v1/profiles/:username
# ---------------------------------------------------------------------------


class TestGetPublicProfile:
    async def test_returns_200_when_profile_public(
        self, profiles_client, db_session
    ):
        await _seed_public_profile(db_session, "suyash", profile_public=True)

        with patch(
            "app.routers.public_profiles.AnalyticsService.get_public_profile_analytics",
            new=AsyncMock(return_value=(_mock_streak(), _mock_heatmap())),
        ):
            response = await profiles_client.get("/api/v1/profiles/suyash")

        assert response.status_code == 200

    async def test_returns_404_when_profile_not_public(
        self, profiles_client, db_session
    ):
        await _seed_public_profile(db_session, "privateuser", profile_public=False)

        response = await profiles_client.get("/api/v1/profiles/privateuser")

        assert response.status_code == 404
        assert response.json()["error"] == "profile_not_found"

    async def test_returns_404_when_username_not_found(self, profiles_client):
        response = await profiles_client.get("/api/v1/profiles/doesnotexist")

        assert response.status_code == 404
        assert response.json()["error"] == "profile_not_found"

    async def test_response_never_includes_email(
        self, profiles_client, db_session
    ):
        await _seed_public_profile(db_session, "suyash2", profile_public=True)

        with patch(
            "app.routers.public_profiles.AnalyticsService.get_public_profile_analytics",
            new=AsyncMock(return_value=(_mock_streak(), _mock_heatmap())),
        ):
            response = await profiles_client.get("/api/v1/profiles/suyash2")

        data = response.json()
        assert "email" not in data

    async def test_response_includes_streak_and_heatmap(
        self, profiles_client, db_session
    ):
        await _seed_public_profile(db_session, "suyash3", profile_public=True)

        with patch(
            "app.routers.public_profiles.AnalyticsService.get_public_profile_analytics",
            new=AsyncMock(return_value=(_mock_streak(), _mock_heatmap())),
        ):
            response = await profiles_client.get("/api/v1/profiles/suyash3")

        data = response.json()
        assert "streak" in data
        assert "heatmap" in data
        assert data["streak"]["current_streak"] == 5
        assert data["streak"]["total_submissions"] == 42
        assert len(data["heatmap"]) == 1

    async def test_response_includes_bio_and_tagline(
        self, profiles_client, db_session
    ):
        await _seed_public_profile(
            db_session,
            "suyash4",
            profile_public=True,
            bio="Building in public",
            tagline="Fullstack · Open source",
        )

        with patch(
            "app.routers.public_profiles.AnalyticsService.get_public_profile_analytics",
            new=AsyncMock(return_value=(_mock_streak(), _mock_heatmap())),
        ):
            response = await profiles_client.get("/api/v1/profiles/suyash4")

        data = response.json()
        assert data["bio"] == "Building in public"
        assert data["tagline"] == "Fullstack · Open source"

    async def test_case_insensitive_username_lookup(
        self, profiles_client, db_session
    ):
        await _seed_public_profile(db_session, "suyash5", profile_public=True)

        with patch(
            "app.routers.public_profiles.AnalyticsService.get_public_profile_analytics",
            new=AsyncMock(return_value=(_mock_streak(), _mock_heatmap())),
        ):
            response = await profiles_client.get("/api/v1/profiles/SUYASH5")

        assert response.status_code == 200

    async def test_no_auth_header_required(
        self, profiles_client, db_session
    ):
        """Endpoint is fully public — no Authorization header needed."""
        await _seed_public_profile(db_session, "suyash6", profile_public=True)

        with patch(
            "app.routers.public_profiles.AnalyticsService.get_public_profile_analytics",
            new=AsyncMock(return_value=(_mock_streak(), _mock_heatmap())),
        ):
            response = await profiles_client.get(
                "/api/v1/profiles/suyash6",
            )

        assert response.status_code == 200

    async def test_404_is_ambiguous_for_private_and_missing(
        self, profiles_client, db_session
    ):
        """
        Private profile and missing profile both return 404 with the same
        error code — prevents enumeration of private profile existence.
        """
        await _seed_public_profile(db_session, "privateuser2", profile_public=False)

        private_response = await profiles_client.get("/api/v1/profiles/privateuser2")
        missing_response = await profiles_client.get("/api/v1/profiles/doesnotexist2")

        assert private_response.status_code == missing_response.status_code == 404
        assert private_response.json()["error"] == missing_response.json()[
            "error"]
