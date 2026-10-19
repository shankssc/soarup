# apps/api/tests/unit/test_github_activity_service.py
# Unit tests for app/services/github_activity_service.py
#
# Strategy:
#   - fetch_todays_activity is the only public function; test via behaviour
#   - get_installation_token is patched so no real GitHub calls happen
#   - httpx.AsyncClient is patched per test to control search API responses
#   - Tests verify: non-active skipped, token-None skipped, aggregation, empty

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _inst(
    installation_id: int = 1,
    github_login: str = "testuser",
    status: str = "active",
) -> MagicMock:
    m = MagicMock()
    m.installation_id = installation_id
    m.github_login = github_login
    m.status = status
    return m


def _search_response(items: list) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"items": items}
    return resp


def _repos_response(repos: list) -> MagicMock:
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = {"repositories": repos}
    return resp


def _make_client(*get_side_effects) -> AsyncMock:
    """Async context manager whose .get() returns responses in order."""
    client = AsyncMock()
    client.get = AsyncMock(side_effect=list(get_side_effects))
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    return client


# ---------------------------------------------------------------------------
# fetch_todays_activity
# ---------------------------------------------------------------------------


class TestFetchTodaysActivity:
    async def test_skips_pending_approval_installation(self):
        from app.services.github_activity_service import fetch_todays_activity

        inst = _inst(status="pending_approval")

        with patch("app.services.github_activity_service.get_installation_token") as mock_tok:
            result = await fetch_todays_activity([inst], "testuser", "2024-01-15")

        mock_tok.assert_not_called()
        assert result.merged_prs == []
        assert result.closed_issues == []
        assert result.commits == []

    async def test_skips_installation_when_token_returns_none(self):
        from app.services.github_activity_service import fetch_todays_activity

        inst = _inst(status="active")

        with (
            patch(
                "app.services.github_activity_service.get_installation_token",
                return_value=None,
            ),
            patch("app.services.github_activity_service.httpx.AsyncClient") as mock_cls,
        ):
            result = await fetch_todays_activity([inst], "testuser", "2024-01-15")

        mock_cls.assert_not_called()
        assert result.merged_prs == []

    async def test_returns_empty_when_no_activity_found(self):
        from app.services.github_activity_service import fetch_todays_activity

        inst = _inst(status="active", installation_id=1)
        # Empty PRs, empty issues, empty repos (→ no commits)
        client = _make_client(
            _search_response([]),  # PR search
            _search_response([]),  # issue search
            _repos_response([]),  # repos list
        )

        with (
            patch(
                "app.services.github_activity_service.get_installation_token",
                return_value="ghs_tok",
            ),
            patch(
                "app.services.github_activity_service.httpx.AsyncClient",
                return_value=client,
            ),
        ):
            result = await fetch_todays_activity([inst], "testuser", "2024-01-15")

        assert result.merged_prs == []
        assert result.closed_issues == []
        assert result.commits == []

    async def test_merged_prs_appear_in_result(self):
        from app.services.github_activity_service import fetch_todays_activity

        inst = _inst(status="active", installation_id=2)
        pr_item = {
            "title": "Fix login race condition",
            "html_url": "https://github.com/org/api/pull/42",
            "repository_url": "https://api.github.com/repos/org/api",
            "pull_request": {"merged_at": "2024-01-15T09:30:00Z"},
        }
        client = _make_client(
            _search_response([pr_item]),
            _search_response([]),
            _repos_response([]),
        )

        with (
            patch(
                "app.services.github_activity_service.get_installation_token",
                return_value="ghs_tok",
            ),
            patch(
                "app.services.github_activity_service.httpx.AsyncClient",
                return_value=client,
            ),
        ):
            result = await fetch_todays_activity([inst], "testuser", "2024-01-15")

        assert len(result.merged_prs) == 1
        assert result.merged_prs[0]["title"] == "Fix login race condition"

    async def test_closed_issues_appear_in_result(self):
        from app.services.github_activity_service import fetch_todays_activity

        inst = _inst(status="active", installation_id=3)
        issue_item = {
            "title": "Sidebar nav shows wrong active state",
            "html_url": "https://github.com/org/web/issues/7",
            "repository_url": "https://api.github.com/repos/org/web",
        }
        client = _make_client(
            _search_response([]),
            _search_response([issue_item]),
            _repos_response([]),
        )

        with (
            patch(
                "app.services.github_activity_service.get_installation_token",
                return_value="ghs_tok",
            ),
            patch(
                "app.services.github_activity_service.httpx.AsyncClient",
                return_value=client,
            ),
        ):
            result = await fetch_todays_activity([inst], "testuser", "2024-01-15")

        assert len(result.closed_issues) == 1
        assert result.closed_issues[0]["title"] == "Sidebar nav shows wrong active state"

    async def test_aggregates_across_two_active_installations(self):
        from app.services.github_activity_service import fetch_todays_activity

        inst1 = _inst(installation_id=10, status="active")
        inst2 = _inst(installation_id=11, status="active")

        pr1 = {
            "title": "PR from inst-10",
            "html_url": "https://github.com/org/repo1/pull/1",  # ← add
            "repository_url": "https://api.github.com/repos/org/repo1",
            "pull_request": {"merged_at": "2024-01-15T10:00:00Z"},
        }
        pr2 = {
            "title": "PR from inst-11",
            "html_url": "https://github.com/org/repo2/pull/2",  # ← add
            "repository_url": "https://api.github.com/repos/org/repo2",
            "pull_request": {"merged_at": "2024-01-15T11:00:00Z"},
        }

        clients = [
            _make_client(_search_response([pr1]), _search_response([]), _repos_response([])),
            _make_client(_search_response([pr2]), _search_response([]), _repos_response([])),
        ]
        client_iter = iter(clients)

        with (
            patch(
                "app.services.github_activity_service.get_installation_token",
                return_value="ghs_tok",
            ),
            patch(
                "app.services.github_activity_service.httpx.AsyncClient",
                side_effect=lambda **_kwargs: next(client_iter),
            ),
        ):
            result = await fetch_todays_activity([inst1, inst2], "testuser", "2024-01-15")

        assert len(result.merged_prs) == 2
        titles = {pr["title"] for pr in result.merged_prs}
        assert "PR from inst-10" in titles
        assert "PR from inst-11" in titles
