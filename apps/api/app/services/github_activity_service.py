from __future__ import annotations

from typing import Any

import httpx
import structlog
from pydantic import BaseModel

from app.lib.github_app import GITHUB_API_BASE, get_installation_token
from app.models.github_installation import GitHubInstallation

logger = structlog.get_logger(__name__)


class GitHubActivitySummary(BaseModel):
    merged_prs: list[dict[str, str]]  # {title, url, repo}
    closed_issues: list[dict[str, str]]  # {title, url, repo}
    commits: list[dict[str, str]]  # {message, url, repo}


async def fetch_todays_activity(
    installations: list[GitHubInstallation | Any],
    github_login: str,
    today_str: str,  # YYYY-MM-DD, resolved server-side per user timezone
) -> GitHubActivitySummary:
    """
    Fetches merged PRs, closed issues, and commits authored by
    github_login across all of the user's connected installations,
    for the given date.
    """
    merged_prs: list[dict[str, str]] = []
    closed_issues: list[dict[str, str]] = []
    commits: list[dict[str, str]] = []

    for installation in installations:
        if installation.status != "active":
            continue

        token = await get_installation_token(installation.installation_id)
        if not token:
            continue

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            # Merged PRs
            pr_query = f"author:{github_login} is:pr is:merged " f"merged:{today_str} org:{installation.account_login}" if installation.account_type == "Organization" else f"author:{github_login} is:pr is:merged merged:{today_str}"

            pr_resp = await client.get(
                f"{GITHUB_API_BASE}/search/issues",
                headers=headers,
                params={"q": pr_query},
            )
            if pr_resp.status_code == 200:
                for item in pr_resp.json().get("items", []):
                    merged_prs.append(
                        {
                            "title": item["title"],
                            "url": item["html_url"],
                            "repo": item["repository_url"].split("/repos/")[-1],
                        }
                    )

            # Closed issues
            issue_query = pr_query.replace("is:pr is:merged", "is:issue is:closed").replace(f"merged:{today_str}", f"closed:{today_str}")

            issue_resp = await client.get(
                f"{GITHUB_API_BASE}/search/issues",
                headers=headers,
                params={"q": issue_query},
            )
            if issue_resp.status_code == 200:
                for item in issue_resp.json().get("items", []):
                    closed_issues.append(
                        {
                            "title": item["title"],
                            "url": item["html_url"],
                            "repo": item["repository_url"].split("/repos/")[-1],
                        }
                    )

            # Commits — per accessible repo
            repos_resp = await client.get(
                f"{GITHUB_API_BASE}/installation/repositories",
                headers=headers,
            )
            if repos_resp.status_code == 200:
                for repo in repos_resp.json().get("repositories", []):
                    commits_resp = await client.get(
                        f"{GITHUB_API_BASE}/repos/{repo['full_name']}/commits",
                        headers=headers,
                        params={
                            "author": github_login,
                            "since": f"{today_str}T00:00:00Z",
                            "until": f"{today_str}T23:59:59Z",
                        },
                    )
                    if commits_resp.status_code == 200:
                        for commit in commits_resp.json():
                            commits.append(
                                {
                                    "message": commit["commit"]["message"].split("\n")[0],
                                    "url": commit["html_url"],
                                    "repo": repo["full_name"],
                                }
                            )

    return GitHubActivitySummary(
        merged_prs=merged_prs,
        closed_issues=closed_issues,
        commits=commits,
    )
