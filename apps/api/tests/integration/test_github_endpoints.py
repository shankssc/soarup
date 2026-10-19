# apps/api/tests/integration/test_github_endpoints.py
# Integration tests for app/routers/github.py
#
# Strategy:
#   - require_onboarded overridden via dependency_overrides (no real DB profile check)
#   - GitHubInstallationRepository patched at router module level
#   - fetch_todays_activity patched for /prefill tests
#   - JWT auth runs for real via make_jwt / conftest.patch_auth_settings

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio

USER_ID = str(uuid.uuid4())
INSTALL_ROW_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _user_ctx() -> dict[str, str]:
    return {"user_id": USER_ID, "email": "test@example.com", "access_token": "tok"}


def _make_inst(
    row_id: str = INSTALL_ROW_ID,
    installation_id: int = 987654,
    account_login: str = "testuser",
    account_type: str = "User",
    status: str = "active",
    github_login: str = "testuser",
) -> MagicMock:
    m = MagicMock()
    m.id = row_id
    m.installation_id = installation_id
    m.account_login = account_login
    m.account_type = account_type
    m.status = status
    m.github_login = github_login
    return m


def _make_repo_mock(installations: list | None = None) -> MagicMock:
    repo = MagicMock()
    repo.get_by_user_id = AsyncMock(return_value=installations or [])
    repo.upsert = AsyncMock(return_value=None)
    repo.delete = AsyncMock(return_value=None)
    return repo


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
async def github_client(db_session, make_jwt):
    from app.api.dependencies import get_db_session, require_onboarded
    from app.main import create_app

    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session
    app.dependency_overrides[require_onboarded] = lambda: _user_ctx()

    token = make_jwt(USER_ID)
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers=headers,
    ) as client:
        yield client, app

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /api/v1/integrations/github/connect
# ---------------------------------------------------------------------------


class TestStartGitHubConnect:
    async def test_returns_200(self, github_client):
        client, _ = github_client
        response = await client.get("/api/v1/integrations/github/connect")
        assert response.status_code == 200

    async def test_response_has_install_url(self, github_client):
        client, _ = github_client
        response = await client.get("/api/v1/integrations/github/connect")
        data = response.json()
        assert "install_url" in data
        assert "github.com/apps/" in data["install_url"]

    async def test_returns_401_without_token(self, db_session):
        from app.api.dependencies import get_db_session
        from app.main import create_app

        app = create_app()
        app.dependency_overrides[get_db_session] = lambda: db_session

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/integrations/github/connect")

        app.dependency_overrides.clear()
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/integrations/github/status
# ---------------------------------------------------------------------------


class TestGetGitHubConnectionStatus:
    async def test_returns_200(self, github_client):
        client, _ = github_client
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=_make_repo_mock([]),
        ):
            response = await client.get("/api/v1/integrations/github/status")
        assert response.status_code == 200

    async def test_not_connected_when_no_installations(self, github_client):
        client, _ = github_client
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=_make_repo_mock([]),
        ):
            response = await client.get("/api/v1/integrations/github/status")
        data = response.json()
        assert data["connected"] is False
        assert data["installations"] == []

    async def test_connected_when_installation_exists(self, github_client):
        client, _ = github_client
        inst = _make_inst()
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=_make_repo_mock([inst]),
        ):
            response = await client.get("/api/v1/integrations/github/status")
        data = response.json()
        assert data["connected"] is True
        assert len(data["installations"]) == 1

    async def test_installation_shape(self, github_client):
        client, _ = github_client
        inst = _make_inst(account_login="soarup-hq", account_type="Organization")
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=_make_repo_mock([inst]),
        ):
            response = await client.get("/api/v1/integrations/github/status")
        item = response.json()["installations"][0]
        assert "id" in item
        assert "account_login" in item
        assert "account_type" in item
        assert "status" in item

    async def test_calls_repo_with_user_id(self, github_client):
        client, _ = github_client
        mock_repo = _make_repo_mock([])
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=mock_repo,
        ):
            await client.get("/api/v1/integrations/github/status")
        mock_repo.get_by_user_id.assert_called_once_with(USER_ID)


# ---------------------------------------------------------------------------
# DELETE /api/v1/integrations/github/{installation_row_id}
# ---------------------------------------------------------------------------


class TestDisconnectGitHubInstallation:
    async def test_returns_204(self, github_client):
        client, _ = github_client
        mock_repo = _make_repo_mock()
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=mock_repo,
        ):
            response = await client.delete(f"/api/v1/integrations/github/{INSTALL_ROW_ID}")
        assert response.status_code == 204

    async def test_response_body_empty(self, github_client):
        client, _ = github_client
        mock_repo = _make_repo_mock()
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=mock_repo,
        ):
            response = await client.delete(f"/api/v1/integrations/github/{INSTALL_ROW_ID}")
        assert response.content == b""

    async def test_calls_repo_delete_with_correct_ids(self, github_client):
        client, _ = github_client
        mock_repo = _make_repo_mock()
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=mock_repo,
        ):
            await client.delete(f"/api/v1/integrations/github/{INSTALL_ROW_ID}")
        mock_repo.delete.assert_called_once_with(INSTALL_ROW_ID, owner_user_id=USER_ID)


# ---------------------------------------------------------------------------
# GET /api/v1/integrations/github/prefill
# ---------------------------------------------------------------------------


class TestGetPrefillSuggestion:
    async def test_returns_200(self, github_client):
        client, _ = github_client
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=_make_repo_mock([]),
        ):
            response = await client.get("/api/v1/integrations/github/prefill")
        assert response.status_code == 200

    async def test_empty_draft_when_no_installations(self, github_client):
        client, _ = github_client
        with patch(
            "app.routers.github.GitHubInstallationRepository.from_session",
            return_value=_make_repo_mock([]),
        ):
            response = await client.get("/api/v1/integrations/github/prefill")
        data = response.json()
        assert data["draft_text"] == ""
        assert data["raw_activity"] is None

    async def test_draft_includes_merged_pr(self, github_client):
        from app.services.github_activity_service import GitHubActivitySummary

        client, _ = github_client
        inst = _make_inst()
        activity = GitHubActivitySummary(
            merged_prs=[{"title": "Fix token refresh", "repo": "org/api"}],
            closed_issues=[],
            commits=[],
        )
        with (
            patch(
                "app.routers.github.GitHubInstallationRepository.from_session",
                return_value=_make_repo_mock([inst]),
            ),
            patch("app.routers.github.fetch_todays_activity", return_value=activity),
        ):
            response = await client.get("/api/v1/integrations/github/prefill")

        draft = response.json()["draft_text"]
        assert "Merged: Fix token refresh" in draft
        assert "org/api" in draft

    async def test_draft_includes_closed_issue(self, github_client):
        from app.services.github_activity_service import GitHubActivitySummary

        client, _ = github_client
        inst = _make_inst()
        activity = GitHubActivitySummary(
            merged_prs=[],
            closed_issues=[{"title": "Dark mode flicker", "repo": "org/web"}],
            commits=[],
        )
        with (
            patch(
                "app.routers.github.GitHubInstallationRepository.from_session",
                return_value=_make_repo_mock([inst]),
            ),
            patch("app.routers.github.fetch_todays_activity", return_value=activity),
        ):
            response = await client.get("/api/v1/integrations/github/prefill")

        draft = response.json()["draft_text"]
        assert "Closed: Dark mode flicker" in draft

    async def test_draft_includes_commit_summary(self, github_client):
        from app.services.github_activity_service import GitHubActivitySummary

        client, _ = github_client
        inst = _make_inst()
        activity = GitHubActivitySummary(
            merged_prs=[],
            closed_issues=[],
            commits=[
                {"sha": "aaa", "message": "fix: a", "repo": "org/api"},
                {"sha": "bbb", "message": "feat: b", "repo": "org/web"},
                {"sha": "ccc", "message": "chore: c", "repo": "org/api"},
            ],
        )
        with (
            patch(
                "app.routers.github.GitHubInstallationRepository.from_session",
                return_value=_make_repo_mock([inst]),
            ),
            patch("app.routers.github.fetch_todays_activity", return_value=activity),
        ):
            response = await client.get("/api/v1/integrations/github/prefill")

        draft = response.json()["draft_text"]
        assert "3 commit(s)" in draft
        assert "2 repo(s)" in draft

    async def test_response_includes_raw_activity(self, github_client):
        from app.services.github_activity_service import GitHubActivitySummary

        client, _ = github_client
        inst = _make_inst()
        activity = GitHubActivitySummary(merged_prs=[], closed_issues=[], commits=[])
        with (
            patch(
                "app.routers.github.GitHubInstallationRepository.from_session",
                return_value=_make_repo_mock([inst]),
            ),
            patch("app.routers.github.fetch_todays_activity", return_value=activity),
        ):
            response = await client.get("/api/v1/integrations/github/prefill")

        data = response.json()
        assert "raw_activity" in data
        assert isinstance(data["raw_activity"], dict)
