from datetime import UTC, datetime

import httpx
import structlog
from fastapi import APIRouter
from fastapi.responses import RedirectResponse, Response

from app.api import ApiVersionDep, DBSessionDep, OnboardedDep, create_success_response
from app.config import settings
from app.lib.github_app import GITHUB_API_BASE, generate_app_jwt
from app.repositories.github_repo import GitHubInstallationRepository
from app.schemas.github import GitHubConnectionStatusResponse, GitHubInstallationResponse
from app.services.github_activity_service import fetch_todays_activity

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/integrations/github", tags=["github"])


@router.get("/connect", status_code=200)
async def start_github_connect(
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
) -> Response:
    """Returns the GitHub App installation URL for the frontend to redirect to."""
    install_url = f"https://github.com/apps/{settings.github_app_slug}/installations/new"
    return create_success_response({"install_url": install_url}, api_version=api_version)


@router.get("/callback", status_code=302)
async def github_install_callback(
    installation_id: int,
    # "install" | "request" (org pending approval) | "update"
    setup_action: str,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> RedirectResponse:
    """
    GitHub redirects here after installation. Auth is via the user's
    existing Supabase session cookie.
    """
    status = "pending_approval" if setup_action == "request" else "active"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API_BASE}/app/installations/{installation_id}",
            headers={
                "Authorization": f"Bearer {generate_app_jwt()}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        resp.raise_for_status()

    install_data = resp.json()
    account_login: str = install_data["account"]["login"]
    account_type: str = install_data["account"]["type"]

    repo = GitHubInstallationRepository.from_session(db)
    await repo.upsert(
        user_id=user_ctx["user_id"],
        installation_id=installation_id,
        account_login=account_login,
        account_type=account_type,
        github_login=account_login,
        status=status,
    )

    redirect_target = "/settings/integrations?github=connected"
    if status == "pending_approval":
        redirect_target = "/settings/integrations?github=pending"

    return RedirectResponse(url=f"{settings.app_base_url}{redirect_target}", status_code=302)


@router.get("/status", status_code=200)
async def get_github_connection_status(
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> Response:
    repo = GitHubInstallationRepository.from_session(db)
    installations = await repo.get_by_user_id(user_ctx["user_id"])
    return create_success_response(
        GitHubConnectionStatusResponse(
            installations=[GitHubInstallationResponse.model_validate(i) for i in installations],
            connected=len(installations) > 0,
        ),
        api_version=api_version,
    )


@router.delete("/{installation_row_id}", status_code=204)
async def disconnect_github_installation(
    installation_row_id: str,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> Response:
    """
    Removes SoarUp's reference to this installation. Does NOT revoke
    the installation on GitHub's side — the user manages that from
    their GitHub account settings.
    """
    repo = GitHubInstallationRepository.from_session(db)
    await repo.delete(installation_row_id, owner_user_id=user_ctx["user_id"])
    return Response(status_code=204)


@router.get("/prefill", status_code=200)
async def get_prefill_suggestion(
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> Response:
    """
    Returns a suggested draft update text built from today's GitHub
    activity, for the user to review and edit before submitting.
    Returns an empty suggestion (not an error) if no installations
    are connected or no activity is found.
    """
    repo = GitHubInstallationRepository.from_session(db)
    installations = await repo.get_by_user_id(user_ctx["user_id"])

    if not installations:
        return create_success_response(
            {"draft_text": "", "raw_activity": None},
            api_version=api_version,
        )

    # Use github_login from first active installation
    # TODO: support per-user timezone preference; UTC for MVP
    github_login = installations[0].github_login
    today_str = datetime.now(UTC).strftime("%Y-%m-%d")

    activity = await fetch_todays_activity(list(installations), github_login, today_str)

    draft_lines: list[str] = []
    for pr in activity.merged_prs:
        draft_lines.append(f"Merged: {pr['title']} ({pr['repo']})")
    for issue in activity.closed_issues:
        draft_lines.append(f"Closed: {issue['title']} ({issue['repo']})")
    if activity.commits:
        repo_count = len({c["repo"] for c in activity.commits})
        draft_lines.append(f"{len(activity.commits)} commit(s) across {repo_count} repo(s)")

    draft_text = "\n".join(draft_lines)

    return create_success_response(
        {"draft_text": draft_text, "raw_activity": activity.model_dump()},
        api_version=api_version,
    )
