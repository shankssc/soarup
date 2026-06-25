# apps/api/tests/integration/test_analytics_endpoints.py
# Integration tests for app/routers/analytics.py
#
# Patching strategy (mirrors test_member_endpoints.py):
#   - Patch app.api.rbac.WorkspaceRepository.get_member with a side_effect
#     that returns the right mock based on user_id
#   - Build a minimal FastAPI app with just the analytics router
#   - Override require_onboarded to inject a valid user context
#   - Patch AnalyticsService methods directly on the class

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.dependencies import require_onboarded
from app.db.session import get_db_session
from app.routers.analytics import router
from app.schemas.analytics import (
    HeatmapDay,
    MemberParticipationRow,
    PersonalAnalyticsResponse,
    StreakResponse,
    TeamAnalyticsResponse,
)

pytestmark = pytest.mark.db

WORKSPACE_ID = "ws-abc"
OWNER_ID = "user-owner"
ADMIN_ID = "user-admin"
MEMBER_ID = "user-member"
RBAC_GET_MEMBER = "app.api.rbac.WorkspaceRepository.get_member"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_member_orm(user_id: str, role: str) -> MagicMock:
    m = MagicMock()
    m.user_id = user_id
    m.role = role
    return m


def _make_get_member_side_effect(caller_id: str, caller_role: str):
    lookup = {caller_id: _make_member_orm(caller_id, caller_role)}

    async def _side_effect(workspace_id: str, user_id: str) -> MagicMock | None:
        return lookup.get(user_id)

    return _side_effect


def _make_app(caller_id: str) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[require_onboarded] = lambda: {
        "user_id": caller_id,
        "email": f"{caller_id}@example.com",
    }
    app.dependency_overrides[get_db_session] = lambda: AsyncMock()
    return app


def _fake_personal_response() -> PersonalAnalyticsResponse:
    return PersonalAnalyticsResponse(
        streak=StreakResponse(
            current_streak=5,
            best_streak=10,
            total_submissions=30,
            last_submission_date="2026-06-23",
        ),
        heatmap=[HeatmapDay(date="2026-06-23", count=1, intensity=3)],
    )


def _fake_team_response() -> TeamAnalyticsResponse:
    return TeamAnalyticsResponse(
        participation_rate_30d=0.82,
        avg_updates_per_day_30d=4.2,
        active_member_count=12,
        members=[
            MemberParticipationRow(
                user_id=MEMBER_ID,
                full_name="Test Member",
                avatar_url=None,
                current_streak=3,
                participation_rate_30d=0.9,
                submissions_30d=27,
                sparkline=[0] * 14,
            )
        ],
        workspace_heatmap=[HeatmapDay(date="2026-06-23", count=5, intensity=2)],
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def member_client():
    app = _make_app(MEMBER_ID)
    with patch(RBAC_GET_MEMBER, new=AsyncMock(side_effect=_make_get_member_side_effect(MEMBER_ID, "member"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def admin_client():
    app = _make_app(ADMIN_ID)
    with patch(RBAC_GET_MEMBER, new=AsyncMock(side_effect=_make_get_member_side_effect(ADMIN_ID, "admin"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def non_member_client():
    """User who is not in the workspace — get_member returns None."""
    app = _make_app("user-outsider")
    with patch(RBAC_GET_MEMBER, new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


# ---------------------------------------------------------------------------
# GET /workspaces/:id/analytics/personal
# ---------------------------------------------------------------------------


class TestPersonalAnalyticsEndpoint:
    @pytest.mark.asyncio
    async def test_returns_200_for_member(self, member_client):
        with patch(
            "app.routers.analytics.AnalyticsService.get_personal_analytics",
            new=AsyncMock(return_value=_fake_personal_response()),
        ):
            r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/personal")

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_returns_200_for_admin(self, admin_client):
        with patch(
            "app.routers.analytics.AnalyticsService.get_personal_analytics",
            new=AsyncMock(return_value=_fake_personal_response()),
        ):
            r = await admin_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/personal")

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_response_contains_streak_and_heatmap(self, member_client):
        with patch(
            "app.routers.analytics.AnalyticsService.get_personal_analytics",
            new=AsyncMock(return_value=_fake_personal_response()),
        ):
            r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/personal")

        body = r.json()
        assert "streak" in body
        assert "heatmap" in body
        assert body["streak"]["current_streak"] == 5

    @pytest.mark.asyncio
    async def test_returns_403_for_non_member(self, non_member_client):
        r = await non_member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/personal")
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# GET /workspaces/:id/analytics/team
# ---------------------------------------------------------------------------


class TestTeamAnalyticsEndpoint:
    @pytest.mark.asyncio
    async def test_returns_200_for_admin(self, admin_client):
        with patch(
            "app.routers.analytics.AnalyticsService.get_team_analytics",
            new=AsyncMock(return_value=_fake_team_response()),
        ):
            r = await admin_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/team")

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_response_shape(self, admin_client):
        with patch(
            "app.routers.analytics.AnalyticsService.get_team_analytics",
            new=AsyncMock(return_value=_fake_team_response()),
        ):
            r = await admin_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/team")

        body = r.json()
        assert "participation_rate_30d" in body
        assert "members" in body
        assert "workspace_heatmap" in body
        assert 0.0 <= body["participation_rate_30d"] <= 1.0

    @pytest.mark.asyncio
    async def test_returns_403_for_member(self, member_client):
        """Regular member role cannot access team analytics."""
        r = await member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/team")
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_returns_403_for_non_member(self, non_member_client):
        r = await non_member_client.get(f"/api/v1/workspaces/{WORKSPACE_ID}/analytics/team")
        assert r.status_code == 403
