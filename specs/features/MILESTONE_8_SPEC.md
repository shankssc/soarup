# SoarUp — Milestone 8: Slack Integration

# Branch: feature/milestone-8

# Merges into: develop

# Prerequisites: feature/milestone-7 merged to develop ✅

---

## What This Milestone Delivers

### Pre-checklist (clear before Slack work starts)

1. Supabase CLI upgraded to latest (#8)
2. NullPool documentation comment added (#11)
3. WebSocket reconnect uses refetchQueries not invalidateQueries (#25)
4. `_calculate_streak` today parameter added (#77)
5. Saturday streak edge case test restored (#68)
6. Team analytics GROUP BY rewrite (#76)
7. Heatmap hex comment linking to globals.css tokens (#84)

### Core Slack Integration

8. Admin adds Slack incoming webhook URL to workspace settings
9. Webhook URL encrypted at rest using Fernet (dedicated SLACK_ENCRYPTION_KEY)
10. Daily digest posted to Slack channel using rich Block Kit layout
11. Slack delivery tracked on Digest record (delivered_to_slack, slack_delivered_at)
12. Admin can send a test message showing a sample digest preview
13. Update notification posted to Slack when a member's update is processed
    (fires after AI summary complete — shows raw text + summary)
14. /settings/slack page — webhook URL, toggle, test button
15. Slack delivery status visible in digest history cards

---

## Branch Strategy

```
develop
└── feature/milestone-8
    ├── feature/milestone-8-prechecklist    ← #8, #11, #25, #68, #76, #77, #84
    ├── feature/milestone-8-slack-core      ← encryption, webhook, digest delivery
    ├── feature/milestone-8-slack-notifs    ← update notifications post-processing
    ├── feature/milestone-8-settings        ← /settings/slack page + sidebar link
    └── feature/milestone-8-stories-tests  ← Storybook + unit tests

Merge order:
  feature/milestone-8-prechecklist → feature/milestone-8
  feature/milestone-8-slack-core → feature/milestone-8
  feature/milestone-8-slack-notifs → feature/milestone-8
  feature/milestone-8-settings → feature/milestone-8
  feature/milestone-8-stories-tests → feature/milestone-8
  feature/milestone-8 → develop
```

---

## Google Stitch Prompt

```
Design a Slack integration settings page for SoarUp using the Electric
Atelier design system.

Colors (dark mode): Background #0e0e10, Primary #53ddfc (cyan),
Surface High #1f1f22, On-surface #f9f5f8, Error #ff716c,
Outline-variant #48474a
Colors (light mode): Background #ebfdfc, Primary #00687a,
Surface Lowest #ffffff, On-surface #0e1e1e

Design rules: 0px border radius except pills and 4px cards.
DM Sans headlines, Space Grotesk UI, shadow-card on surfaces,
asymmetric CTA buttons.

Screen — /settings/slack:
- Page title: "Slack" (DM Sans headline)
- Status banner at top when connected:
  Green pill "Connected" + workspace name from Slack test
  OR amber pill "Not connected" when no webhook set
- Section: "Webhook URL"
  Input field (bottom-border style) placeholder "https://hooks.slack.com/..."
  Helper text below: "Create an incoming webhook in your Slack workspace
  settings and paste the URL here."
  "How to set this up →" link (external)
- Section: "Notifications"
  Toggle row: "Send daily digest to Slack"
    Description: "Posts the team digest to your channel after email delivery"
  Toggle row: "Send update notifications"
    Description: "Posts a message when a team member's standup is processed"
- Section: "Test"
  "Send test message" button (secondary)
  Shows sample digest preview in Slack so admin can verify formatting
- "Save settings" button (primary asymmetric)
- Danger zone section at bottom:
  "Remove Slack integration" ghost button (red text)
  Clicking shows confirmation before clearing webhook URL

Slack Block Kit card design (for reference — shown as preview mockup):
SoarUp logo emoji 🚀 + "SoarUp Standup" header text
Divider line
Team digest text block (italic, quoted style)
Divider
"Individual Updates" section header
Per-member blocks: bold name + summary text
Footer: date + "View in SoarUp →" button
```

---

## Part 1: Pre-Checklist

### #77 — `_calculate_streak` today parameter

```python
# apps/api/app/services/analytics_service.py

def _calculate_streak(
    submission_date_strs: list[str],
    digest_days: list[int] | None,
    today: date | None = None,          # ← add this parameter
) -> tuple[int, int]:
    _today = today or datetime.now(UTC).date()
    # Replace all internal references to `today` with `_today`
    ...
```

All internal call sites in `AnalyticsService` pass `today=None` —
no behaviour change in production. Tests can now pin the date:

```python
current, best = _calculate_streak(dates, [1,2,3,4,5], today=date(2026, 6, 21))
```

---

### #68 — Saturday streak test

```python
# apps/api/tests/unit/test_analytics_service.py
# Add to TestCalculateStreak class:

def test_saturday_does_not_break_monday_friday_streak(self):
    """
    Mon-Fri workspace. User submits Mon-Fri for two consecutive weeks.
    Today is Saturday. Current streak should be 5 (Friday's submission
    is the most recent counting day and it has a submission).
    """
    # Two weeks of Mon-Fri submissions
    dates = [
        "2026-06-19",  # Friday week 2
        "2026-06-18",  # Thursday week 2
        "2026-06-17",  # Wednesday week 2
        "2026-06-16",  # Tuesday week 2
        "2026-06-15",  # Monday week 2
        "2026-06-12",  # Friday week 1
        "2026-06-11",  # Thursday week 1
        "2026-06-10",  # Wednesday week 1
        "2026-06-09",  # Tuesday week 1
        "2026-06-08",  # Monday week 1
    ]
    digest_days = [1, 2, 3, 4, 5]  # Mon-Fri
    saturday = date(2026, 6, 20)

    current, best = _calculate_streak(dates, digest_days, today=saturday)

    assert current == 10   # 2 full weeks
    assert best == 10

def test_gap_on_counting_day_breaks_streak(self):
    """Missing a configured digest day resets current streak to 0."""
    dates = [
        "2026-06-19",  # Friday — submission
        # Thursday missing — gap
        "2026-06-17",  # Wednesday — submission
    ]
    digest_days = [1, 2, 3, 4, 5]
    friday = date(2026, 6, 19)

    current, best = _calculate_streak(dates, digest_days, today=friday)

    assert current == 1   # only Friday counts for current
    assert best == 1
```

---

### #76 — GROUP BY rewrite for team analytics

```python
# apps/api/app/repositories/analytics_repo.py — add two batch methods

async def get_all_member_submission_dates(
    self,
    workspace_id: str,
    from_date: date,
    to_date: date,
) -> dict[str, list[str]]:
    """
    Return {user_id: [date_str, ...]} for all members in one query.
    Dates sorted descending — ready for _calculate_streak.
    Replaces per-member get_user_submission_dates calls.
    """
    result = await self.db.execute(
        select(Update.user_id, Update.update_date)
        .where(
            and_(
                Update.workspace_id == workspace_id,
                Update.is_deleted == False,  # noqa: E712
                Update.update_date >= from_date.isoformat(),
                Update.update_date <= to_date.isoformat(),
            )
        )
        .order_by(Update.user_id, Update.update_date.desc())
    )
    rows = result.all()

    result_map: dict[str, list[str]] = {}
    for user_id, update_date in rows:
        if user_id not in result_map:
            result_map[user_id] = []
        result_map[user_id].append(update_date)
    return result_map


async def get_all_member_sparklines(
    self,
    workspace_id: str,
    from_date: date,
    to_date: date,
) -> dict[str, dict[str, int]]:
    """
    Return {user_id: {date_str: count}} for sparkline in one query.
    Replaces per-member get_member_submission_counts calls.
    """
    result = await self.db.execute(
        select(
            Update.user_id,
            Update.update_date,
            func.count(Update.id).label("count"),
        )
        .where(
            and_(
                Update.workspace_id == workspace_id,
                Update.is_deleted == False,  # noqa: E712
                Update.update_date >= from_date.isoformat(),
                Update.update_date <= to_date.isoformat(),
            )
        )
        .group_by(Update.user_id, Update.update_date)
    )
    rows = result.all()

    result_map: dict[str, dict[str, int]] = {}
    for user_id, update_date, count in rows:
        if user_id not in result_map:
            result_map[user_id] = {}
        result_map[user_id][update_date] = count
    return result_map
```

Update `AnalyticsService.get_team_analytics` to use batch methods:

```python
async def get_team_analytics(self, workspace_id: str) -> TeamAnalyticsResponse:
    ...
    # Replace the per-member loop with two batch queries
    all_dates = await analytics_repo.get_all_member_submission_dates(
        workspace_id, twelve_weeks_ago, today
    )
    all_sparklines = await analytics_repo.get_all_member_sparklines(
        workspace_id, fourteen_days_ago, today
    )

    for member, profile in members_with_profiles:
        uid = member.user_id
        member_dates = all_dates.get(uid, [])
        current_streak, _ = _calculate_streak(member_dates, digest_days)

        submissions_30d = sum(
            1 for d in member_dates if d >= thirty_days_ago.isoformat()
        )
        sparkline_map = all_sparklines.get(uid, {})
        sparkline = [
            sparkline_map.get((today - timedelta(days=i)).isoformat(), 0)
            for i in range(13, -1, -1)
        ]
        ...
```

This reduces team analytics from 2N queries to 4 queries total
regardless of member count.

---

### #25 — WebSocket reconnect refetchQueries

```typescript
// apps/web/src/hooks/useWebSocket.ts — onopen handler
// Change:
queryClient.invalidateQueries({
  queryKey: updateKeys.byDate(workspaceId, format(new Date(), "yyyy-MM-dd")),
});
// To:
queryClient.refetchQueries({
  queryKey: updateKeys.byDate(workspaceId, format(new Date(), "yyyy-MM-dd")),
});
```

---

### #11 — NullPool comment

```python
# apps/api/app/workers/tasks.py — ProcessUpdateTask.db_engine property

@property
def db_engine(self):
    if self._db_engine is None:
        from sqlalchemy.pool import NullPool
        # NullPool is intentional — do not remove.
        # Celery tasks call asyncio.run() which creates a new event loop
        # per task invocation. SQLAlchemy connection pool state does not
        # survive across event loop boundaries, causing asyncpg
        # InterfaceError on reuse. NullPool disables pooling so each
        # operation gets a fresh connection that is closed immediately.
        self._db_engine = create_async_engine(
            settings.database_url,
            poolclass=NullPool,
        )
    return self._db_engine
```

---

### #84 — Heatmap hex comment

```typescript
// apps/web/src/components/ui/heatmap.tsx

// These hex values are hardcoded because SVG fill attributes do not
// reliably support CSS custom properties across all browsers.
// If design tokens change in globals.css, update these values to match:
//   Dark intensity 3  → --color-primary dark mode    (#53ddfc)
//   Light intensity 3 → --color-primary light mode   (#00687a)
const DARK: Record<0 | 1 | 2 | 3, string> = {
  0: "#1f1f22", // --color-surface-high dark
  1: "#1a3d4a", // tint of --color-primary dark
  2: "#1f7a8c", // mid --color-primary dark
  3: "#53ddfc", // --color-primary dark
};

const LIGHT: Record<0 | 1 | 2 | 3, string> = {
  0: "#d0e6e5", // --color-surface-high light
  1: "#a8d8df", // tint of --color-primary light
  2: "#4ab8cf", // mid --color-primary light
  3: "#00687a", // --color-primary light
};
```

---

## Part 2: Core Slack Integration

### Step 1: Database Changes

```python
# apps/api/app/models/workspace.py — add Slack config columns

slack_webhook_url_encrypted: Mapped[str | None] = mapped_column(
    Text, nullable=True,
    doc="Fernet-encrypted Slack incoming webhook URL. "
        "Decrypt with settings.slack_encryption_key before use.",
)
slack_digest_enabled: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
    doc="Whether to post daily digest to Slack channel.",
)
slack_updates_enabled: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
    doc="Whether to post update notifications to Slack when processed.",
)
```

```python
# apps/api/app/models/digest.py — add Slack delivery tracking

delivered_to_slack: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
)
slack_delivered_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True), nullable=True,
)
```

Alembic migrations (two separate revisions):

```bash
docker compose exec api alembic revision --autogenerate \
  -m "add_slack_config_to_workspaces"
docker compose exec api alembic revision --autogenerate \
  -m "add_slack_delivery_to_digests"
docker compose exec api alembic upgrade head
```

---

### Step 2: Config + Encryption

```python
# apps/api/app/config.py — add

slack_encryption_key: SecretStr | None = Field(
    None,
    description="Fernet key for encrypting Slack webhook URLs at rest. "
                "Generate with: python -c 'from cryptography.fernet import "
                "Fernet; print(Fernet.generate_key().decode())'",
)

@field_validator("slack_encryption_key", mode="after")
@classmethod
def validate_slack_key(
    cls, v: SecretStr | None, info: ValidationInfo
) -> SecretStr | None:
    if info.data.get("environment") == "production" and not v:
        raise ValueError(
            "SLACK_ENCRYPTION_KEY is required in production "
            "when Slack integration is enabled"
        )
    return v
```

Add `cryptography` to `requirements.txt`:

```
cryptography>=42.0.0
```

```python
# apps/api/app/lib/slack_crypto.py
# Fernet symmetric encryption for Slack webhook URLs.

from cryptography.fernet import Fernet, InvalidToken
import structlog
from app.config import settings

logger = structlog.get_logger(__name__)


def _get_fernet() -> Fernet:
    key = settings.slack_encryption_key
    if not key:
        raise RuntimeError(
            "SLACK_ENCRYPTION_KEY is not configured. "
            "Generate one with: python -c 'from cryptography.fernet "
            "import Fernet; print(Fernet.generate_key().decode())'"
        )
    return Fernet(key.get_secret_value().encode())


def encrypt_webhook_url(url: str) -> str:
    """Encrypt a Slack webhook URL for storage in the database."""
    return _get_fernet().encrypt(url.encode()).decode()


def decrypt_webhook_url(encrypted: str) -> str | None:
    """
    Decrypt a stored webhook URL.
    Returns None if decryption fails (invalid key or corrupted data).
    """
    try:
        return _get_fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken:
        logger.error("slack_webhook_decrypt_failed")
        return None
```

---

### Step 3: Block Kit Builder

```python
# apps/api/app/lib/slack_blocks.py
# Block Kit message builders for digest and update notifications.
# Matches Electric Atelier aesthetic as closely as Slack allows:
# - Section headers use bold text (no color in Block Kit)
# - Summaries use > blockquote style via mrkdwn
# - Update cards use dividers for separation
# - Footer includes "View in SoarUp" button

from typing import Any


def build_digest_blocks(
    workspace_name: str,
    digest_date: str,
    team_summary: str,
    items: list[dict[str, Any]],
    app_url: str,
) -> list[dict[str, Any]]:
    """
    Build Block Kit blocks for the daily digest message.

    Args:
        workspace_name: Display name of the workspace
        digest_date: ISO date string YYYY-MM-DD
        team_summary: Claude-generated team-level summary
        items: List of {author_name, summary_snapshot} dicts
        app_url: Base URL for "View in SoarUp" deep link

    Returns:
        List of Block Kit block dicts ready for Slack API
    """
    blocks: list[dict[str, Any]] = [
        # Header
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"🚀 {workspace_name} — Daily Standup",
                "emoji": True,
            },
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"*{digest_date}* · {len(items)} update{'s' if len(items) != 1 else ''}",
                }
            ],
        },
        {"type": "divider"},
        # Team summary
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Team Summary*\n>{team_summary}",
            },
        },
        {"type": "divider"},
        # Individual updates header
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Individual Updates*",
            },
        },
    ]

    # One section block per update
    for item in items:
        name = item.get("author_name") or "A team member"
        summary = item.get("summary_snapshot") or "_No summary available_"
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{name}*\n{summary}",
            },
        })

    # Footer with deep link
    blocks.extend([
        {"type": "divider"},
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View in SoarUp →"},
                    "url": f"{app_url}/history",
                    "style": "primary",
                }
            ],
        },
    ])

    return blocks


def build_update_notification_blocks(
    author_name: str,
    workspace_name: str,
    update_date: str,
    content: str,
    summary: str,
    app_url: str,
    mode: str = "text",
) -> list[dict[str, Any]]:
    """
    Build Block Kit blocks for an individual update notification.
    Fires after AI processing is complete — includes both raw text and summary.
    """
    mode_label = "🎙️ Voice standup" if mode == "voice" else "📝 Standup update"

    blocks: list[dict[str, Any]] = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    f"{mode_label} from *{author_name}*\n"
                    f"_{workspace_name} · {update_date}_"
                ),
            },
        },
        {"type": "divider"},
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Update*\n{content}",
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Summary*\n>{summary}",
            },
        },
        {
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View dashboard →",
                    },
                    "url": f"{app_url}/dashboard",
                }
            ],
        },
    ]

    return blocks


def build_test_blocks(
    workspace_name: str,
    app_url: str,
) -> list[dict[str, Any]]:
    """
    Sample digest preview for the test message.
    Clearly labelled as a test so channel members aren't confused.
    """
    return build_digest_blocks(
        workspace_name=workspace_name,
        digest_date="Sample digest",
        team_summary=(
            "This is a sample team summary showing how your daily digest "
            "will appear in Slack. Real summaries are generated by Claude "
            "from your team's standup updates."
        ),
        items=[
            {
                "author_name": "Alex Chen",
                "summary_snapshot": (
                    "Completed the WebSocket reconnect fix and started "
                    "on the Slack integration. No blockers."
                ),
            },
            {
                "author_name": "Jordan Kim",
                "summary_snapshot": (
                    "Reviewed PRs for milestone 7 and updated the "
                    "analytics spec document."
                ),
            },
        ],
        app_url=app_url,
    )
```

---

### Step 4: Slack Client

```python
# apps/api/app/lib/slack.py
# Thin async wrapper for posting to Slack incoming webhooks.

import httpx
import structlog
from typing import Any

logger = structlog.get_logger(__name__)


async def post_to_slack(
    webhook_url: str,
    blocks: list[dict[str, Any]],
    fallback_text: str,
) -> bool:
    """
    POST a Block Kit message to a Slack incoming webhook.

    Args:
        webhook_url: Decrypted Slack incoming webhook URL
        blocks: Block Kit blocks list from slack_blocks.py
        fallback_text: Plain text fallback for notifications/accessibility

    Returns:
        True on success (Slack returns "ok"), False on any failure.
        Non-fatal — caller decides whether to raise or log.
    """
    payload = {"text": fallback_text, "blocks": blocks}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if response.status_code == 200 and response.text == "ok":
                logger.info("slack_message_sent", status="ok")
                return True
            else:
                logger.warning(
                    "slack_message_failed",
                    status_code=response.status_code,
                    body=response.text[:200],
                )
                return False
    except httpx.TimeoutException:
        logger.warning("slack_message_timeout", webhook_prefix=webhook_url[:40])
        return False
    except Exception as e:
        logger.error("slack_message_error", error=str(e))
        return False
```

Note: `httpx` is already in `requirements.txt` (used by auth_repo).
No new dependency needed.

---

### Step 5: Schemas

```python
# apps/api/app/schemas/slack.py

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SlackSettingsResponse(BaseModel):
    """Public Slack settings — webhook URL is masked, never returned raw."""
    slack_configured: bool
    slack_digest_enabled: bool
    slack_updates_enabled: bool
    # Show last 8 chars of webhook URL so admin can verify which hook is set
    # without exposing the full URL. None if not configured.
    webhook_url_hint: str | None
    model_config = ConfigDict(from_attributes=True)


class UpdateSlackSettingsRequest(BaseModel):
    webhook_url: str | None = Field(
        None,
        description="Full Slack incoming webhook URL. "
                    "Pass null to remove the integration.",
    )
    slack_digest_enabled: bool | None = None
    slack_updates_enabled: bool | None = None

    @field_validator("webhook_url", mode="after")
    @classmethod
    def validate_webhook_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.startswith("https://hooks.slack.com/"):
            raise ValueError(
                "Webhook URL must be a valid Slack incoming webhook URL "
                "starting with https://hooks.slack.com/"
            )
        return v


class SlackTestResponse(BaseModel):
    success: bool
    message: str
```

Update `WorkspaceResponse` in `schemas/workspace.py`:

```python
class WorkspaceResponse(BaseModel):
    ...  # existing fields
    slack_configured: bool = False
    slack_digest_enabled: bool = False
    slack_updates_enabled: bool = False
```

Update `DigestResponse` in `schemas/digest.py`:

```python
class DigestResponse(BaseModel):
    ...  # existing fields
    delivered_to_slack: bool = False
    slack_delivered_at: datetime | None = None
```

---

### Step 6: Slack Service

```python
# apps/api/app/services/slack_service.py

from typing import Any
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.lib.slack import post_to_slack
from app.lib.slack_blocks import (
    build_digest_blocks, build_test_blocks, build_update_notification_blocks,
)
from app.lib.slack_crypto import decrypt_webhook_url, encrypt_webhook_url
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.slack import (
    SlackSettingsResponse, SlackTestResponse, UpdateSlackSettingsRequest,
)

logger = structlog.get_logger(__name__)


class SlackError(Exception):
    def __init__(self, error_code: str, message: str):
        self.error_code = error_code
        self.message = message
        super().__init__(message)


class SlackService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(self, workspace_id: str) -> SlackSettingsResponse:
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)
        if not workspace:
            raise SlackError("workspace_not_found", "Workspace not found.")

        webhook_hint = None
        if workspace.slack_webhook_url_encrypted:
            # Decrypt temporarily just to build the hint
            decrypted = decrypt_webhook_url(
                workspace.slack_webhook_url_encrypted
            )
            if decrypted:
                webhook_hint = f"...{decrypted[-8:]}"

        return SlackSettingsResponse(
            slack_configured=bool(workspace.slack_webhook_url_encrypted),
            slack_digest_enabled=workspace.slack_digest_enabled,
            slack_updates_enabled=workspace.slack_updates_enabled,
            webhook_url_hint=webhook_hint,
        )

    async def update_settings(
        self,
        workspace_id: str,
        request: UpdateSlackSettingsRequest,
    ) -> SlackSettingsResponse:
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)
        if not workspace:
            raise SlackError("workspace_not_found", "Workspace not found.")

        if request.webhook_url is not None:
            if request.webhook_url == "":
                # Empty string = remove integration
                workspace.slack_webhook_url_encrypted = None
                workspace.slack_digest_enabled = False
                workspace.slack_updates_enabled = False
            else:
                workspace.slack_webhook_url_encrypted = encrypt_webhook_url(
                    request.webhook_url
                )

        if request.slack_digest_enabled is not None:
            workspace.slack_digest_enabled = request.slack_digest_enabled
        if request.slack_updates_enabled is not None:
            workspace.slack_updates_enabled = request.slack_updates_enabled

        await self.db.commit()
        await self.db.refresh(workspace)

        return await self.get_settings(workspace_id)

    async def send_test_message(
        self, workspace_id: str
    ) -> SlackTestResponse:
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)

        if not workspace or not workspace.slack_webhook_url_encrypted:
            raise SlackError(
                "no_webhook",
                "No Slack webhook URL configured. Add one above and save first.",
            )

        webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
        if not webhook_url:
            raise SlackError(
                "decrypt_failed",
                "Could not read the webhook URL. "
                "Please re-enter and save the webhook URL.",
            )

        blocks = build_test_blocks(
            workspace_name=workspace.name,
            app_url=settings.app_base_url,
        )
        success = await post_to_slack(
            webhook_url=webhook_url,
            blocks=blocks,
            fallback_text=f"🧪 Test message from SoarUp — {workspace.name}",
        )

        if success:
            return SlackTestResponse(
                success=True,
                message="Test message sent successfully. Check your Slack channel.",
            )
        else:
            return SlackTestResponse(
                success=False,
                message=(
                    "Failed to send test message. "
                    "Check that the webhook URL is correct and the Slack app "
                    "is still installed in your workspace."
                ),
            )

    async def post_digest_to_slack(
        self,
        workspace_id: str,
        workspace_name: str,
        digest_date: str,
        team_summary: str,
        items: list[dict[str, Any]],
    ) -> bool:
        """
        Called from the digest Celery task after email delivery.
        Returns True if delivered, False on any failure (non-fatal).
        """
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)

        if not workspace or not workspace.slack_digest_enabled:
            return False
        if not workspace.slack_webhook_url_encrypted:
            return False

        webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
        if not webhook_url:
            logger.error("slack_digest_decrypt_failed", workspace_id=workspace_id)
            return False

        blocks = build_digest_blocks(
            workspace_name=workspace_name,
            digest_date=digest_date,
            team_summary=team_summary,
            items=items,
            app_url=settings.app_base_url,
        )
        return await post_to_slack(
            webhook_url=webhook_url,
            blocks=blocks,
            fallback_text=f"🚀 {workspace_name} standup digest — {digest_date}",
        )

    async def post_update_notification(
        self,
        workspace_id: str,
        author_name: str,
        workspace_name: str,
        update_date: str,
        content: str,
        summary: str,
        mode: str = "text",
    ) -> bool:
        """
        Called from process_update / process_audio_update Celery tasks
        after AI summarisation is complete.
        Returns True if delivered, False on any failure (non-fatal).
        """
        repo = WorkspaceRepository.from_session(self.db)
        workspace = await repo.get_by_id(workspace_id)

        if not workspace or not workspace.slack_updates_enabled:
            return False
        if not workspace.slack_webhook_url_encrypted:
            return False

        webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
        if not webhook_url:
            return False

        blocks = build_update_notification_blocks(
            author_name=author_name,
            workspace_name=workspace_name,
            update_date=update_date,
            content=content,
            summary=summary,
            app_url=settings.app_base_url,
            mode=mode,
        )
        return await post_to_slack(
            webhook_url=webhook_url,
            blocks=blocks,
            fallback_text=(
                f"📝 {author_name} submitted their standup — {workspace_name}"
            ),
        )
```

---

### Step 7: Slack Router

```python
# apps/api/app/routers/slack.py

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api import (
    ApiVersionDep, DBSessionDep, WorkspaceAdminDep,
    create_error_response, create_success_response,
)
from app.services.slack_service import SlackError, SlackService

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/workspaces", tags=["slack"])


def get_slack_service(db: DBSessionDep) -> SlackService:
    return SlackService(db)


@router.get("/{workspace_id}/slack/settings", status_code=200)
async def get_slack_settings(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """Get Slack integration settings. Admin only."""
    try:
        result = await service.get_settings(workspace_id)
        return create_success_response(result, api_version=api_version)
    except SlackError as e:
        return create_error_response(e.error_code, e.message, 400,
                                     api_version=api_version)


@router.patch("/{workspace_id}/slack/settings", status_code=200)
async def update_slack_settings(
    workspace_id: str,
    request: UpdateSlackSettingsRequest,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """Update Slack webhook URL and notification toggles. Admin only."""
    try:
        result = await service.update_settings(workspace_id, request)
        return create_success_response(result, api_version=api_version)
    except SlackError as e:
        status_map = {"workspace_not_found": 404}
        return create_error_response(e.error_code, e.message,
            status_map.get(e.error_code, 400), api_version=api_version)


@router.post("/{workspace_id}/slack/test", status_code=200)
async def send_test_message(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """Send a test digest preview to the configured Slack channel. Admin only."""
    try:
        result = await service.send_test_message(workspace_id)
        return create_success_response(result, api_version=api_version)
    except SlackError as e:
        status_map = {"no_webhook": 400, "decrypt_failed": 500}
        return create_error_response(e.error_code, e.message,
            status_map.get(e.error_code, 400), api_version=api_version)


@router.delete("/{workspace_id}/slack/settings", status_code=204)
async def remove_slack_integration(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    service: SlackService = Depends(get_slack_service),
) -> Response:
    """Remove Slack integration — clears webhook URL and disables all toggles."""
    try:
        await service.update_settings(
            workspace_id,
            UpdateSlackSettingsRequest(webhook_url=""),
        )
    except SlackError as e:
        return create_error_response(e.error_code, e.message, 400,
                                     api_version=api_version)
    return Response(status_code=204)
```

Register in `main.py`:

```python
from app.routers import slack
app.include_router(slack.router, prefix="/api/v1")
```

---

### Step 8: Wire into Celery Tasks

```python
# apps/api/app/workers/tasks.py

# In _send_workspace_digest_async — after email send, add Slack delivery:

if workspace.slack_digest_enabled and workspace.slack_webhook_url_encrypted:
    from app.services.slack_service import SlackService
    slack_service = SlackService(db)
    slack_delivered = await slack_service.post_digest_to_slack(
        workspace_id=workspace_id,
        workspace_name=workspace.name,
        digest_date=digest_date,
        team_summary=team_summary,
        items=items_for_slack,
    )
    if slack_delivered:
        from datetime import UTC
        await digest_repo.update_status(
            digest, digest.status,
            delivered_to_slack=True,
            slack_delivered_at=datetime.now(UTC),
        )
        logger.info("digest_slack_delivered", workspace_id=workspace_id)

# In _process_update_async — after summary stored, add Slack notification:

if workspace and workspace.slack_updates_enabled:
    from app.services.slack_service import SlackService
    slack_service = SlackService(db)
    await slack_service.post_update_notification(
        workspace_id=update.workspace_id,
        author_name=profile.full_name if profile else "A team member",
        workspace_name=workspace.name,
        update_date=update.update_date,
        content=update.content,
        summary=summary,
        mode=update.mode,
    )
```

Add `delivered_to_slack` and `slack_delivered_at` params to
`DigestRepository.update_status`:

```python
async def update_status(
    self,
    digest: Digest,
    status: str,
    summary: str | None = None,
    update_count: int | None = None,
    email_sent_at=None,
    delivered_to_slack: bool | None = None,    # ← add
    slack_delivered_at=None,                   # ← add
) -> Digest:
```

---

## Part 3: Frontend

### Step 1: Slack Settings Hooks

```typescript
// apps/web/src/hooks/useSlack.ts

export const slackKeys = {
  settings: (workspaceId: string) =>
    ["slack", workspaceId, "settings"] as const,
};

export interface SlackSettings {
  slack_configured: boolean;
  slack_digest_enabled: boolean;
  slack_updates_enabled: boolean;
  webhook_url_hint: string | null;
}

export function useSlackSettings(workspaceId: string | undefined) {
  const { tokens } = useAuth();
  return useQuery({
    queryKey: slackKeys.settings(workspaceId ?? ""),
    queryFn: () =>
      apiClient.get<SlackSettings>(
        `/workspaces/${workspaceId}/slack/settings`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 60 * 1000,
  });
}

export function useUpdateSlackSettings(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      webhook_url?: string | null;
      slack_digest_enabled?: boolean;
      slack_updates_enabled?: boolean;
    }) =>
      apiClient.patch<SlackSettings>(
        `/workspaces/${workspaceId}/slack/settings`,
        data,
        tokens?.access_token,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(slackKeys.settings(workspaceId), updated);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
    },
  });
}

export function useSendSlackTest(workspaceId: string) {
  const { tokens } = useAuth();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean; message: string }>(
        `/workspaces/${workspaceId}/slack/test`,
        {},
        tokens?.access_token,
      ),
  });
}

export function useRemoveSlackIntegration(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete(
        `/workspaces/${workspaceId}/slack/settings`,
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: slackKeys.settings(workspaceId),
      });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
    },
  });
}
```

---

### Step 2: /settings/slack Page

```typescript
// apps/web/src/app/(app)/settings/slack/page.tsx

"use client";

import * as React from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useSlackSettings, useUpdateSlackSettings,
  useSendSlackTest, useRemoveSlackIntegration,
} from "@/hooks/useSlack";

export default function SlackSettingsPage() {
  const { data: workspace } = useWorkspace();
  const { data: settings, isLoading } = useSlackSettings(workspace?.id);
  const updateSettings = useUpdateSlackSettings(workspace?.id ?? "");
  const sendTest = useSendSlackTest(workspace?.id ?? "");
  const removeIntegration = useRemoveSlackIntegration(workspace?.id ?? "");

  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [isDirty, setIsDirty] = React.useState(false);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = React.useState(false);

  async function handleSave() {
    await updateSettings.mutateAsync({
      webhook_url: webhookUrl || undefined,
      slack_digest_enabled: settings?.slack_digest_enabled,
      slack_updates_enabled: settings?.slack_updates_enabled,
    });
    setIsDirty(false);
    setWebhookUrl("");
  }

  async function handleTest() {
    setTestResult(null);
    const result = await sendTest.mutateAsync();
    setTestResult(result.message);
  }

  async function handleRemove() {
    await removeIntegration.mutateAsync();
    setShowRemoveConfirm(false);
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-headline text-on-surface">Slack</h1>

      {/* Connection status banner */}
      {settings?.slack_configured ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-high
                        rounded-card border border-outline-variant">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-label text-xs text-on-surface-variant">
            Connected · webhook ending in{" "}
            <code className="text-primary">{settings.webhook_url_hint}</code>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-high
                        rounded-card border border-outline-variant">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-label text-xs text-on-surface-variant">
            Not connected
          </span>
        </div>
      )}

      {/* Webhook URL section */}
      <div className="space-y-2">
        <label className="font-label text-[10px] uppercase tracking-[0.2em]
                          text-outline block">
          Webhook URL
        </label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => {
            setWebhookUrl(e.target.value);
            setIsDirty(true);
          }}
          placeholder={
            settings?.slack_configured
              ? "Enter new URL to replace existing"
              : "https://hooks.slack.com/services/..."
          }
          className="w-full bg-transparent border-b border-outline-variant
                     focus:border-primary pb-2 text-sm text-on-surface
                     placeholder:text-outline outline-none transition-colors"
        />
        <p className="font-label text-[10px] text-outline">
          Create an incoming webhook in your Slack workspace settings and
          paste the URL here.{" "}
          <a
            href="https://api.slack.com/messaging/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            How to set this up →
          </a>
        </p>
      </div>

      {/* Notification toggles */}
      <div className="space-y-4">
        <label className="font-label text-[10px] uppercase tracking-[0.2em]
                          text-outline block">
          Notifications
        </label>

        {[
          {
            key: "slack_digest_enabled" as const,
            label: "Send daily digest to Slack",
            description:
              "Posts the team digest to your channel after email delivery",
          },
          {
            key: "slack_updates_enabled" as const,
            label: "Send update notifications",
            description:
              "Posts a message when a team member's standup is processed",
          },
        ].map(({ key, label, description }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="font-body text-sm text-on-surface">{label}</p>
              <p className="font-label text-[11px] text-outline mt-0.5">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateSettings.mutate({ [key]: !settings?.[key] })
              }
              disabled={!settings?.slack_configured}
              className={`relative w-10 h-6 rounded-full transition-colors
                          flex-shrink-0 disabled:opacity-40
                          ${settings?.[key] ? "bg-primary" : "bg-surface-highest"}`}
              aria-checked={settings?.[key]}
              role="switch"
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white
                            transition-transform
                            ${settings?.[key] ? "translate-x-5" : "translate-x-1"}`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Test + Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={!settings?.slack_configured || sendTest.isPending}
          className="px-4 py-2 border border-outline-variant font-label
                     text-xs uppercase tracking-[0.15em] text-on-surface-variant
                     hover:border-primary hover:text-primary transition-colors
                     disabled:opacity-40"
        >
          {sendTest.isPending ? "Sending..." : "Send test message"}
        </button>

        {isDirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="asymmetric-btn px-6 py-2 bg-primary text-on-primary
                       font-label text-xs uppercase tracking-[0.15em]
                       disabled:opacity-60"
          >
            {updateSettings.isPending ? "Saving..." : "Save settings →"}
          </button>
        )}
      </div>

      {testResult && (
        <p className={`font-label text-xs ${
          sendTest.data?.success ? "text-emerald-400" : "text-error"
        }`}>
          {testResult}
        </p>
      )}

      {/* Danger zone */}
      {settings?.slack_configured && (
        <div className="pt-6 border-t border-outline-variant space-y-3">
          <p className="font-label text-[10px] uppercase tracking-[0.2em]
                        text-outline">
            Danger zone
          </p>
          {!showRemoveConfirm ? (
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              className="font-label text-xs text-error hover:underline"
            >
              Remove Slack integration
            </button>
          ) : (
            <div className="space-y-2">
              <p className="font-body text-sm text-on-surface-variant">
                This will clear your webhook URL and disable all Slack
                notifications. Are you sure?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removeIntegration.isPending}
                  className="font-label text-xs text-error hover:underline"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemoveConfirm(false)}
                  className="font-label text-xs text-outline hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

### Step 3: Sidebar + Settings Navigation

Add Slack link to sidebar settings sub-links:

```typescript
// apps/web/src/components/layout/sidebar.tsx
{ href: "/settings/profile",   label: "Profile",   icon: "person"    },
{ href: "/settings/members",   label: "Members",   icon: "group"     },
{ href: "/settings/digest",    label: "Digest",    icon: "mail"      },
{ href: "/settings/slack",     label: "Slack",     icon: "tag"       }, // ← add
{ href: "/settings/workspace", label: "Workspace", icon: "business"  },
```

---

### Step 4: Digest Card — Slack Status

Update `DigestCard` to show Slack delivery status:

```typescript
// apps/web/src/components/domain/digests/digest-card.tsx

{digest.delivered_to_slack && (
  <span className="font-label text-[9px] uppercase tracking-[0.1em]
                   text-outline flex items-center gap-1">
    <span className="material-symbols-outlined text-[11px]">tag</span>
    Slack
  </span>
)}
```

---

## Storybook Stories

```
src/stories/settings/SlackSettingsPage.stories.tsx
  ← NotConnectedDark/Light
  ← ConnectedDark/Light (webhook hint shown, toggles enabled)
  ← TestSuccessDark (green result message)
  ← TestFailureDark (error result message)
  ← RemoveConfirmDark (danger zone open)
  ← SavingStateDark (button disabled)

src/stories/domain/digests/DigestCard.stories.tsx ← add variant
  ← WithSlackDeliveryDark (Slack badge shown)
```

---

## Unit Tests

### Backend

```
tests/unit/test_slack_crypto.py
  ← encrypt_webhook_url returns non-empty string
  ← decrypt_webhook_url(encrypt(url)) == url
  ← decrypt_webhook_url with wrong key returns None
  ← missing SLACK_ENCRYPTION_KEY raises RuntimeError

tests/unit/test_slack_blocks.py
  ← build_digest_blocks returns list with header + divider + sections
  ← build_digest_blocks item count matches items param
  ← build_update_notification_blocks has correct author name
  ← build_test_blocks contains "Sample digest" text
  ← all builders include "View in SoarUp" action block

tests/unit/test_slack_service.py
  ← get_settings: configured=True when webhook URL stored
  ← get_settings: webhook_url_hint shows last 8 chars
  ← update_settings: webhook URL encrypted before storage
  ← update_settings: empty string clears integration
  ← send_test_message: raises SlackError when no webhook set
  ← send_test_message: returns success=True when post_to_slack returns True
  ← send_test_message: returns success=False when post_to_slack returns False
  ← post_digest_to_slack: returns False when slack_digest_enabled=False
  ← post_update_notification: returns False when slack_updates_enabled=False

tests/integration/test_slack_endpoints.py
  ← GET /slack/settings → 200 for admin
  ← GET /slack/settings → 403 for member
  ← PATCH /slack/settings → 200 with valid webhook URL
  ← PATCH /slack/settings → 422 with invalid webhook URL
  ← POST /slack/test → 400 when no webhook configured
  ← DELETE /slack/settings → 204 clears integration

tests/unit/test_slack_client.py
  ← post_to_slack: returns True on 200 "ok" response
  ← post_to_slack: returns False on non-200 response
  ← post_to_slack: returns False on timeout
  ← post_to_slack: returns False on connection error
```

### Frontend

```
hooks/useSlack.test.ts
  ← useSlackSettings calls correct endpoint, disabled without workspaceId
  ← useUpdateSlackSettings invalidates settings + workspace cache
  ← useSendSlackTest calls POST /slack/test
  ← useRemoveSlackIntegration calls DELETE and invalidates cache

components/SlackSettingsPage.test.tsx
  ← renders not connected state when slack_configured=false
  ← renders connected state with webhook hint
  ← toggles are disabled when not connected
  ← test button disabled when not connected
  ← remove confirm shown on danger zone click
  ← dirty state shows save button
```

---

## Known Tradeoffs

**1. Slack notifications fire from Celery tasks — session per notification**
`SlackService` is instantiated fresh inside each Celery task with a new
DB session. This is correct for the NullPool pattern but means each
notification makes at least one DB query (fetch workspace config) even
when Slack is disabled. Acceptable at current scale — workspace config
is a single indexed lookup.

**2. Webhook URL decrypted in memory for every notification**
The Fernet key is fetched from settings and the URL decrypted on every
`post_digest_to_slack` and `post_update_notification` call. No caching.
Acceptable — decryption is CPU-only and takes < 1ms.

**3. Slack delivery failure is non-fatal**
If Slack delivery fails (network error, expired webhook), the digest
`delivered_to_slack` stays False and the failure is logged. No retry.
Acceptable — email is the primary delivery channel. Slack is supplementary.

**4. Single channel for all notifications**
Digest and update notifications share one webhook URL and therefore one
channel. Teams wanting separate channels (e.g. digests in #standup,
notifications in #general) cannot do this in M8. Deferred — post-M9
if user feedback requests it.

**5. Update notification fires after summarisation (10-30s delay)**
The Slack notification is posted after AI processing completes, not
immediately on submission. The notification includes the summary which
is the most useful content. The delay is expected and intentional.

---

## Acceptance Criteria

```
[ ] Pre-checklist items #8, #11, #25, #68, #77, #84 completed
[ ] #76 GROUP BY rewrite reduces team analytics to 4 queries
[ ] Admin can add Slack webhook URL on /settings/slack
[ ] Webhook URL validated as hooks.slack.com domain
[ ] Webhook URL encrypted with Fernet before DB storage
[ ] Webhook URL never returned in API responses (hint only)
[ ] SLACK_ENCRYPTION_KEY env var required in production
[ ] Digest notification toggles enabled/disabled correctly
[ ] Update notification toggles enabled/disabled correctly
[ ] Toggles disabled when no webhook URL configured
[ ] Daily digest posted to Slack after email delivery when enabled
[ ] Block Kit digest message: header, team summary, per-member blocks, CTA
[ ] Update notification posted after AI summary complete when enabled
[ ] Block Kit update card: author, raw text, summary, CTA
[ ] Test message sends sample digest preview to channel
[ ] Test result shown inline (success/failure message)
[ ] Remove integration clears webhook URL and disables toggles
[ ] Remove requires confirmation before executing
[ ] Digest history cards show Slack delivery badge when delivered
[ ] Connection status banner shows on /settings/slack
[ ] Sidebar shows Slack link under Settings
[ ] cryptography package added to requirements.txt
[ ] Backend unit tests pass for crypto, blocks, service, client, endpoints
[ ] Frontend unit tests pass for hooks + page component
[ ] Storybook stories added for SlackSettingsPage
[ ] CI passes on feature/milestone-8 branch
```

---

## Files To Create Summary

### Backend (apps/api/)

```
app/lib/slack_crypto.py
app/lib/slack_blocks.py
app/lib/slack.py
app/schemas/slack.py
app/services/slack_service.py
app/routers/slack.py
alembic/versions/YYYYMMDD_*_add_slack_config_to_workspaces.py
alembic/versions/YYYYMMDD_*_add_slack_delivery_to_digests.py
tests/unit/test_slack_crypto.py
tests/unit/test_slack_blocks.py
tests/unit/test_slack_service.py
tests/unit/test_slack_client.py
tests/integration/test_slack_endpoints.py
```

### Frontend (apps/web/src/)

```
hooks/useSlack.ts
app/(app)/settings/slack/page.tsx
stories/settings/SlackSettingsPage.stories.tsx
tests/unit/useSlack.test.ts
tests/unit/SlackSettingsPage.test.tsx
```

### Updated files

```
apps/api/app/models/workspace.py          ← +slack_webhook_url_encrypted,
                                             +slack_digest_enabled,
                                             +slack_updates_enabled
apps/api/app/models/digest.py             ← +delivered_to_slack,
                                             +slack_delivered_at
apps/api/app/schemas/workspace.py         ← +slack_configured,
                                             +slack_digest_enabled,
                                             +slack_updates_enabled
                                             to WorkspaceResponse
apps/api/app/schemas/digest.py            ← +delivered_to_slack,
                                             +slack_delivered_at
                                             to DigestResponse
apps/api/app/repositories/digest_repo.py ← +delivered_to_slack,
                                             +slack_delivered_at params
                                             to update_status
apps/api/app/repositories/analytics_repo.py ← +get_all_member_submission_dates,
                                               +get_all_member_sparklines
apps/api/app/services/analytics_service.py  ← use batch methods in
                                               get_team_analytics
apps/api/app/workers/tasks.py             ← +Slack delivery in digest task,
                                             +Slack notification in update tasks,
                                             +_calculate_streak today param,
                                             +NullPool comment
apps/api/app/config.py                    ← +slack_encryption_key
apps/api/requirements.txt                 ← +cryptography>=42.0.0
apps/web/src/components/layout/sidebar.tsx ← +Slack settings link
apps/web/src/components/domain/digests/digest-card.tsx ← +Slack badge
apps/web/src/components/ui/heatmap.tsx    ← +hex color comments
apps/web/src/hooks/useWebSocket.ts        ← invalidateQueries→refetchQueries
apps/web/src/hooks/useAnalytics.ts        ← uses updated today param
                                             in _calculate_streak via API
```
