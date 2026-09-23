# SoarUp — Milestone: GitHub Integration (Pre-fill via GitHub App)
# Branch: feature/milestone-github-integration
# Merges into: develop
# Prerequisites: feature/milestone-oauth merged to develop ✅

---

## Purpose

The single highest-leverage post-launch feature. Turns SoarUp from a
recording tool into a connective one — a developer's standup form
arrives partially filled with what they actually shipped that day
(merged PRs, closed issues, commits), rather than a blank text box.
This also compounds every downstream feature: richer AI summaries,
more meaningful digests, more meaningful analytics — all fed by real
activity data instead of self-reported text alone.

**Architecture decision:** GitHub App (not a broader OAuth scope).
Lets users grant access to specific repositories with fine-grained,
read-only permissions, rather than blanket account access. More
idiomatic for this use case; heavier to build than an OAuth scope
bump, but the right tradeoff given the sensitivity of repo access.

**Scope decision:** pre-fill/suggestion only, not auto-submit. GitHub
activity populates a draft the user reviews and edits before
submitting — preserves voice and intent, avoids a robotic-feeling
product.

**Scope decision:** no webhooks in this milestone. Data is fetched
on-demand at pre-fill time via the GitHub API, using short-lived
installation tokens. Real-time push-based updates (webhook-driven)
are a documented future enhancement, not required for the pre-fill
use case.

---

## What This Milestone Delivers

### Pre-checklist (issues worth closing before this milestone starts)
1. Fix concurrent OAuth profile-creation race (#150) — incremental
   authorization for repo scope adds more session-exchange traffic
   through this exact path
2. Validate JWT locally instead of Supabase Admin API call (#151) —
   don't stack a new external dependency (GitHub API) on top of an
   existing avoidable one
3. Sentry observability for OAuth failures (#153) — incremental
   authorization is a second consent screen; want visibility before
   it exists
4. Idempotency on update submission (#22) — GitHub-enriched updates
   are more costly to duplicate or lose than plain text
5. Retry endpoint for failed AI summaries (#21) — losing a
   GitHub-enriched summary means losing more than plain text
6. Resolve or explicitly close #60 (E2E invite flow, open under a
   completed milestone)
7. Resolve or explicitly deprioritize #15 (mobile voice recording
   device testing) — voice is a headline feature, worth finally
   verifying rather than leaving indefinitely open

### Core GitHub Integration Work
8. GitHub App registered (staging; production documented for later,
   same two-environment pattern as the OAuth milestone's GitHub
   OAuth Apps)
9. `GitHubInstallation` model — tracks which GitHub account/org(s) a
   user has connected, independent of their sign-in method
10. Connect flow — Settings → Integrations → GitHub, supports both
    personal account and organization installs, handles the
    org-admin-approval pending state
11. App-level JWT + installation access token generation, cached in
    Redis with a TTL under the token's real 1-hour lifetime
12. GitHub data fetch service — merged PRs, closed issues, and
    commits authored by the user "today" (server-side, timezone-aware,
    same date-boundary logic already used for update submission)
13. Pre-fill draft shown in the update submission flow — user reviews
    and edits before submitting, never auto-submitted
14. Disconnect flow — removes the stored installation reference
    (does not revoke the GitHub-side installation itself; user
    manages that from GitHub's own settings)

---

## Branch Strategy

```
develop
└── feature/milestone-github-integration
    ├── feature/ghi-prechecklist      ← 5 issue fixes + 2 decisions
    ├── feature/ghi-app-setup         ← GitHub App registration + auth utility
    ├── feature/ghi-connection        ← install/callback/disconnect flow
    ├── feature/ghi-data-fetch        ← PR/issue/commit fetching service
    ├── feature/ghi-prefill-ui        ← frontend pre-fill draft UI
    └── feature/ghi-stories-tests

Merge order: prechecklist → app-setup → connection → data-fetch →
prefill-ui → stories-tests → feature/milestone-github-integration → develop
```

---

## Part 1: GitHub App Registration

```
[ ] GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
[ ] App name: "SoarUp (Staging)" — separate app for production later,
    same two-environment pattern established for GitHub OAuth Apps
[ ] Homepage URL: https://app.soarupapi.dpdns.org
[ ] Callback URL: https://app.soarupapi.dpdns.org/integrations/github/callback
[ ] Setup URL (used for post-install redirect): same as callback URL
[ ] Webhook: DISABLE for this milestone — GitHub Apps can be created
    without an active webhook; no webhook handling is in scope (see
    Known Tradeoffs)
[ ] Permissions (all read-only):
    - Repository → Contents: Read-only (needed for commit listing)
    - Repository → Issues: Read-only
    - Repository → Pull requests: Read-only
    - Repository → Metadata: Read-only (mandatory minimum)
[ ] Where can this GitHub App be installed: "Any account" (supports
    both personal accounts and organizations)
[ ] Generate a private key (.pem) — this is THE secret for this
    milestone, treat with the same care as SUPABASE_JWT_SECRET
[ ] Note the App ID and Client ID
```

New environment variables:

```bash
GITHUB_APP_ID=
GITHUB_APP_SLUG=soarup-staging          # used to build install URLs
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY_BASE64=          # PEM file, base64-encoded for env storage
```

⚠️ **On the encryption question from planning:** no dedicated
`GITHUB_ENCRYPTION_KEY` is needed for this milestone's scope. Nothing
per-user requiring encryption gets persisted — only the App's own
private key (a single, application-wide secret, stored as an env var
like any other API credential). If a future feature needs to act *as*
the connected user (rather than just read their repos as the App),
that would introduce a genuine per-user token worth encrypting at
that point — documented as a forward-looking note, not built now.

---

## Part 2: Data Model

```python
# apps/api/app/models/github_installation.py

import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class GitHubInstallation(Base):
    """
    Tracks a user's connected GitHub App installation(s).
    A user can have multiple rows — e.g. their personal account plus
    one or more organizations. Independent of sign-in method; a user
    who logged in via email/password or Google can still connect GitHub.
    """
    __tablename__ = "github_installations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    installation_id: Mapped[int] = mapped_column(
        Integer, nullable=False, unique=True,
        doc="GitHub's installation ID — used to generate installation "
            "access tokens via the App's private key.",
    )
    account_login: Mapped[str] = mapped_column(
        String(255), nullable=False,
        doc="The GitHub username or org name this installation belongs to.",
    )
    account_type: Mapped[str] = mapped_column(
        String(20), nullable=False,
        doc="'User' or 'Organization', from GitHub's installation payload.",
    )
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False,
        doc="'active' | 'pending_approval' | 'revoked'. "
            "pending_approval applies when an org install requires "
            "admin approval before repos are actually accessible.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<GitHubInstallation(user_id='{self.user_id}', account='{self.account_login}')>"
```

Migration:
```bash
docker compose exec api alembic revision --autogenerate \
  -m "add_github_installations_table"
docker compose exec api alembic upgrade head
```

⚠️ Given the `profiles.profile_public` drift history from earlier —
run a dry-run autogenerate against current `develop` with no pending
model changes first, to confirm no unrelated drift gets bundled into
this migration.

---

## Part 3: App Authentication Utility

```python
# apps/api/app/lib/github_app.py

import base64
import time
import jwt as pyjwt
import httpx
import structlog
from app.config import settings
from app.lib.rate_limit import get_redis_client  # reuse existing Redis client

logger = structlog.get_logger(__name__)

GITHUB_API_BASE = "https://api.github.com"


def _get_private_key() -> str:
    return base64.b64decode(settings.github_app_private_key_base64).decode()


def generate_app_jwt() -> str:
    """
    Generate a short-lived JWT (max 10 min per GitHub's requirement)
    used to authenticate as the App itself — required to request an
    installation access token.
    """
    now = int(time.time())
    payload = {
        "iat": now - 60,       # allow for clock drift
        "exp": now + 600,      # 10 minutes, GitHub's maximum
        "iss": settings.github_app_id,
    }
    return pyjwt.encode(payload, _get_private_key(), algorithm="RS256")


async def get_installation_token(installation_id: int) -> str | None:
    """
    Returns a short-lived (1 hour) installation access token, cached
    in Redis with a TTL under the real expiry to avoid re-signing on
    every call within that window.
    """
    redis = get_redis_client()
    cache_key = f"github_installation_token:{installation_id}"
    cached = await redis.get(cache_key)
    if cached:
        return cached.decode() if isinstance(cached, bytes) else cached

    app_jwt = generate_app_jwt()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{GITHUB_API_BASE}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {app_jwt}",
                    "Accept": "application/vnd.github+json",
                },
            )
            if response.status_code != 201:
                logger.warning(
                    "github_installation_token_failed",
                    installation_id=installation_id,
                    status_code=response.status_code,
                )
                return None

            data = response.json()
            token = data["token"]
            # Cache for 50 minutes — under the real 60-minute expiry
            await redis.setex(cache_key, 50 * 60, token)
            return token
    except httpx.TimeoutException:
        logger.warning("github_installation_token_timeout", installation_id=installation_id)
        return None
```

---

## Part 4: Connection Flow

```python
# apps/api/app/schemas/github.py

from pydantic import BaseModel, ConfigDict


class GitHubInstallationResponse(BaseModel):
    id: str
    account_login: str
    account_type: str
    status: str
    model_config = ConfigDict(from_attributes=True)


class GitHubConnectionStatusResponse(BaseModel):
    installations: list[GitHubInstallationResponse]
    connected: bool
```

```python
# apps/api/app/routers/github.py

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, Response
from app.api import ApiVersionDep, DBSessionDep, OnboardedDep, create_success_response
from app.config import settings
from app.repositories.github_repo import GitHubInstallationRepository

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
    request: Request,
    installation_id: int,
    setup_action: str,  # "install" | "request" (org pending approval) | "update"
    db: DBSessionDep,
) -> RedirectResponse:
    """
    GitHub redirects here after installation. No user auth context is
    guaranteed to survive this redirect cleanly across all browsers —
    the installing user's identity is confirmed via their existing
    Supabase session cookie, read the same way any authenticated
    request would be.
    """
    # Resolve current user from session (existing auth dependency pattern)
    # ... auth resolution ...

    repo = GitHubInstallationRepository.from_session(db)

    status = "pending_approval" if setup_action == "request" else "active"

    # Fetch installation metadata (account login/type) from GitHub
    # using an app-level JWT — no installation token needed yet if
    # status is pending_approval.
    # ... fetch + store ...

    await repo.upsert(
        user_id="<resolved_user_id>",
        installation_id=installation_id,
        account_login="<from GitHub API>",
        account_type="<from GitHub API>",
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
            installations=installations,
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
    their own GitHub account settings if they want to fully uninstall
    the App.
    """
    repo = GitHubInstallationRepository.from_session(db)
    await repo.delete(installation_row_id, owner_user_id=user_ctx["user_id"])
    return Response(status_code=204)
```

---

## Part 5: Data Fetch Service

```python
# apps/api/app/services/github_activity_service.py

import httpx
import structlog
from datetime import date
from app.lib.github_app import get_installation_token, GITHUB_API_BASE

logger = structlog.get_logger(__name__)


class GitHubActivitySummary(BaseModel):
    merged_prs: list[dict]     # {title, url, repo}
    closed_issues: list[dict]  # {title, url, repo}
    commits: list[dict]        # {message, url, repo}


async def fetch_todays_activity(
    installations: list["GitHubInstallation"],
    github_login: str,
    today_str: str,  # YYYY-MM-DD, resolved server-side per user timezone
) -> GitHubActivitySummary:
    """
    Fetches merged PRs, closed issues, and commits authored by
    github_login across all of the user's connected installations,
    for the given date. Uses the Search API for PRs/issues (supports
    author + date + multi-repo qualifiers in one query) and the
    per-repo Commits API for commit activity (search API's commit
    indexing is less reliable for same-day activity).
    """
    merged_prs: list[dict] = []
    closed_issues: list[dict] = []
    commits: list[dict] = []

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
            pr_query = (
                f"author:{github_login} is:pr is:merged "
                f"merged:{today_str} org:{installation.account_login}"
                if installation.account_type == "Organization"
                else f"author:{github_login} is:pr is:merged merged:{today_str}"
            )
            pr_resp = await client.get(
                f"{GITHUB_API_BASE}/search/issues",
                headers=headers,
                params={"q": pr_query},
            )
            if pr_resp.status_code == 200:
                for item in pr_resp.json().get("items", []):
                    merged_prs.append({
                        "title": item["title"],
                        "url": item["html_url"],
                        "repo": item["repository_url"].split("/repos/")[-1],
                    })

            # Closed issues (excluding PRs, which GitHub's search
            # API also returns under is:issue vs is:pr)
            issue_query = pr_query.replace("is:pr is:merged", "is:issue is:closed")
            issue_query = issue_query.replace(f"merged:{today_str}", f"closed:{today_str}")
            issue_resp = await client.get(
                f"{GITHUB_API_BASE}/search/issues",
                headers=headers,
                params={"q": issue_query},
            )
            if issue_resp.status_code == 200:
                for item in issue_resp.json().get("items", []):
                    closed_issues.append({
                        "title": item["title"],
                        "url": item["html_url"],
                        "repo": item["repository_url"].split("/repos/")[-1],
                    })

            # Commits — per accessible repo, since commit search
            # doesn't reliably index same-day activity
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
                            commits.append({
                                "message": commit["commit"]["message"].split("\n")[0],
                                "url": commit["html_url"],
                                "repo": repo["full_name"],
                            })

    return GitHubActivitySummary(
        merged_prs=merged_prs,
        closed_issues=closed_issues,
        commits=commits,
    )
```

Add a router endpoint that ties this together for the frontend:

```python
# apps/api/app/routers/github.py — add

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
    # resolve installations, github_login, today_str (reuse existing
    # timezone-aware "today" resolution from update submission)
    # ...
    activity = await fetch_todays_activity(installations, github_login, today_str)

    draft_lines = []
    for pr in activity.merged_prs:
        draft_lines.append(f"Merged: {pr['title']} ({pr['repo']})")
    for issue in activity.closed_issues:
        draft_lines.append(f"Closed: {issue['title']} ({issue['repo']})")
    if activity.commits:
        draft_lines.append(f"{len(activity.commits)} commit(s) across "
                            f"{len({c['repo'] for c in activity.commits})} repo(s)")

    draft_text = "\n".join(draft_lines) if draft_lines else ""

    return create_success_response(
        {"draft_text": draft_text, "raw_activity": activity},
        api_version=api_version,
    )
```

---

## Part 6: Frontend

### Settings → Integrations page

```typescriptreact
// apps/web/src/app/(app)/settings/integrations/page.tsx

// Shows connected GitHub installations (personal + org, each with
// status badge: Active / Pending approval).
// "Connect GitHub" button → GET /integrations/github/connect →
// redirect to returned install_url.
// Per-installation "Disconnect" button → DELETE /integrations/github/{id}
// Pending-approval installations show: "Waiting for an admin at
// {account_login} to approve this installation."
```

### Pre-fill in the update submission flow

```typescriptreact
// apps/web/src/components/domain/updates/update-form.tsx — extend

// If GitHub is connected (check /integrations/github/status), show
// a "Fill from GitHub activity →" button above the textarea.
// Clicking it calls GET /integrations/github/prefill and populates
// the textarea with the suggested draft — the user can then edit
// freely before submitting. Never auto-submits.
```

```typescript
// apps/web/src/hooks/useGitHubIntegration.ts

export function useGitHubConnectionStatus() { /* GET /integrations/github/status */ }
export function useStartGitHubConnect() { /* GET /integrations/github/connect, redirect */ }
export function useDisconnectGitHub(installationId: string) { /* DELETE .../{id} */ }
export function useGitHubPrefill() { /* GET /integrations/github/prefill, mutation-style trigger */ }
```

---

## Storybook & Tests

```
stories/settings/IntegrationsPage.stories.tsx
  ← NotConnected, ConnectedPersonal, ConnectedOrg, PendingApproval, MultipleInstallations

stories/domain/updates/UpdateFormWithPrefill.stories.tsx
  ← NoGitHubConnected (no prefill button)
  ← PrefillAvailable, PrefillEmpty (no activity today), PrefillLoading

tests/unit/test_github_app.py
  ← generate_app_jwt produces valid RS256 JWT with correct claims
  ← get_installation_token: cache hit skips API call
  ← get_installation_token: cache miss calls API, caches result
  ← get_installation_token: API failure returns None, logged

tests/unit/test_github_activity_service.py
  ← fetch_todays_activity: skips non-active installations
  ← fetch_todays_activity: aggregates across multiple installations
  ← fetch_todays_activity: empty result when no activity found

tests/integration/test_github_endpoints.py
  ← GET /connect returns install_url
  ← GET /callback (setup_action=install) creates active installation
  ← GET /callback (setup_action=request) creates pending_approval installation
  ← GET /status returns installations for authenticated user only
  ← DELETE /{id} only allows deleting own installations (403 otherwise)
  ← GET /prefill returns empty draft when no installations connected
```

---

## Known Tradeoffs

**1. No webhooks — installation revocation isn't detected proactively**
If a user uninstalls the App directly from GitHub (rather than via
SoarUp's disconnect button), SoarUp has no way to know until the next
time it tries to use that installation's token and gets an API error.
Fix: catch 401/404 on installation-token requests and mark the
installation `status="revoked"` at that point, prompting reconnect.
Real webhook-based revocation is a documented future enhancement.

**2. Commit fetching iterates every accessible repo per pre-fill request**
For a user connected to many repos, this means one API call per repo
just to check for today's commits — could be slow for large
installations. Acceptable for typical solo/small-team repo counts;
revisit with a cached repo-activity index if this becomes a real
latency problem.

**3. No dedicated per-user token encryption (see Part 1 callout)**
Deliberate — the GitHub App model doesn't require persisting per-user
tokens for this milestone's read-only, on-demand scope. Documented as
a forward-looking note for if a future feature needs to act as the
user rather than just read their data.

**4. Org installations pending approval have no notification loop**
If an org admin never approves the pending installation, the user
sees "pending" indefinitely with no reminder or expiry handling.
Acceptable for MVP; a follow-up could add a "installation still
pending" nudge after N days.

**5. GitHub API rate limits are not explicitly handled**
GitHub Apps get a much higher rate limit than personal-token OAuth
apps, but no explicit rate-limit-response handling
(`X-RateLimit-Remaining` header checks, backoff on 403) is built in
this milestone. Acceptable at current scale; worth adding before this
feature sees meaningful concurrent usage.

---

## Acceptance Criteria

```
[ ] Pre-checklist items 1-7 resolved
[ ] GitHub App registered for staging, permissions read-only,
    webhook disabled
[ ] GitHubInstallation model + migration applied
[ ] App JWT generation produces valid, correctly-scoped tokens
[ ] Installation access tokens cached in Redis, correct TTL
[ ] Personal account installation flow works end-to-end
[ ] Organization installation flow works — both immediate-approval
    and pending-approval paths
[ ] Settings → Integrations page shows connection status correctly
[ ] Disconnect removes the local reference without attempting to
    revoke on GitHub's side
[ ] Pre-fill draft correctly aggregates merged PRs, closed issues,
    commits for "today" in the user's timezone
[ ] Pre-fill draft is editable — never auto-submitted
[ ] Empty-activity case shows a clean empty state, not an error
[ ] GitHub connection is available regardless of sign-in method
    (email/password, Google, or GitHub OAuth)
[ ] Backend unit + integration tests pass
[ ] Storybook stories added for Integrations page and prefill UI
[ ] CI passes on feature/milestone-github-integration branch
```

---

## Files To Create Summary

### Backend (apps/api/)
```
app/models/github_installation.py
app/lib/github_app.py
app/schemas/github.py
app/repositories/github_repo.py
app/services/github_activity_service.py
app/routers/github.py
alembic/versions/YYYYMMDD_*_add_github_installations_table.py
tests/unit/test_github_app.py
tests/unit/test_github_activity_service.py
tests/integration/test_github_endpoints.py
```

### Frontend (apps/web/src/)
```
hooks/useGitHubIntegration.ts
app/(app)/settings/integrations/page.tsx
components/domain/updates/update-form.tsx  ← extended, not new
stories/settings/IntegrationsPage.stories.tsx
stories/domain/updates/UpdateFormWithPrefill.stories.tsx
```

### Updated Files
```
apps/api/app/config.py       ← +github_app_id, +github_app_slug,
                                +github_app_client_id/secret,
                                +github_app_private_key_base64
apps/api/app/main.py         ← +github router
apps/api/requirements.txt    ← +pyjwt (already present, confirm RS256 support)
.env.example                 ← +GITHUB_APP_* vars
```
