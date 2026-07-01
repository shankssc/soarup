# SoarUp — Milestone 8: Slack Integration

# Branch: feature/milestone-8

# Merges into: develop

# Prerequisites: feature/milestone-7 merged to develop ✅

# Status: COMPLETE ✅

---

## What This Milestone Delivers

### Pre-checklist (clear before Slack work starts)

1. Supabase CLI upgraded to latest (#8) ✅
2. NullPool documentation comment added (#11) ✅
3. WebSocket reconnect uses refetchQueries not invalidateQueries (#25) ✅
4. `_calculate_streak` today parameter added (#77) ✅
5. Saturday streak edge case test restored (#68) ✅
6. Team analytics GROUP BY rewrite (#76) ✅
7. Heatmap hex comment linking to globals.css tokens (#84) ✅

### Core Slack Integration

8. Admin adds Slack incoming webhook URL to workspace settings ✅
9. Webhook URL encrypted at rest using Fernet (dedicated SLACK_ENCRYPTION_KEY) ✅
10. Daily digest posted to Slack channel using rich Block Kit layout ✅
11. Slack delivery tracked on Digest record (delivered_to_slack, slack_delivered_at) ✅
12. Admin can send a test message showing a sample digest preview ✅
13. Update notification posted to Slack when a member's update is processed ✅
    (fires after AI summary complete — shows raw text + summary)
14. /settings/slack page — webhook URL, toggle, test button ✅
15. Slack delivery status visible in digest history cards ✅

---

## Branch Strategy

```
develop
└── feature/milestone-8
    ├── feature/milestone-8-prechecklist    ← #8, #11, #25, #68, #76, #77, #84  ✅ merged
    ├── feature/milestone-8-slack-core      ← encryption, webhook, digest delivery ✅ merged
    ├── feature/milestone-8-slack-notifs    ← update notifications (folded into slack-core) ✅ merged
    ├── feature/milestone-8-settings        ← /settings/slack page + sidebar link ✅ merged
    └── feature/milestone-8-stories-tests  ← Storybook + unit tests ✅ merged

Merge order:
  feature/milestone-8-prechecklist → feature/milestone-8  ✅
  feature/milestone-8-slack-core → feature/milestone-8    ✅
  feature/milestone-8-slack-notifs → feature/milestone-8  ✅ (folded into slack-core)
  feature/milestone-8-settings → feature/milestone-8      ✅
  feature/milestone-8-stories-tests → feature/milestone-8 ✅
  feature/milestone-8 → develop                           ✅
```

---

## Implementation Notes

### Deviations from original spec

**`feature/milestone-8-slack-notifs` folded into `feature/milestone-8-slack-core`**
Update notification wiring in `tasks.py` was tightly coupled to the
`SlackService` layer and was implemented in the same branch as the core
service. The notifs sub-branch was created but contained no net-new changes.

**Single Alembic migration instead of two**
Both `workspace.py` and `digest.py` model changes were made before running
`autogenerate`, so Alembic detected all six columns in one revision:
`add_slack_config_to_workspaces`. No second revision was needed.

**`UpdateSlackSettingsRequest` validator updated to allow empty string**
The spec used empty string as the removal signal for `webhook_url`. The
original validator rejected empty strings. Fixed to allow `""` as a valid
value meaning "remove integration".

**`slack_integration_enabled` config flag added**
Not in the original spec. Added to gate the production startup validator
behind an explicit feature flag, preventing forced key provisioning for
deployments that don't use Slack.

**Storybook Material Symbols font fix**
The font was not loading in Storybook, causing all Material Symbols icons
to render as raw text. Fixed by adding a font loader decorator to
`.storybook/preview.ts`. The Slack badge in `digest-card.tsx` uses an
inline SVG instead of Material Symbols for resilience.

**`SlackSettingsPage.test.tsx` deferred to E2E**
Page-level tests are covered by Playwright E2E rather than unit tests,
consistent with the existing test strategy for page components.

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
    today: date | None = None,          # ← added
) -> tuple[int, int]:
    _today = today or datetime.now(UTC).date()
    # All internal references use _today instead of today
    ...
```

All internal call sites pass `today=None` — no behaviour change in
production. Tests pin the date:

```python
current, best = _calculate_streak(dates, [1,2,3,4,5], today=date(2026, 6, 21))
```

---

### #68 — Saturday streak test

Added to `TestCalculateStreak` in `test_analytics_service.py`:

```python
def test_saturday_does_not_break_monday_friday_streak(self):
    dates = [
        "2026-06-19", "2026-06-18", "2026-06-17", "2026-06-16", "2026-06-15",
        "2026-06-12", "2026-06-11", "2026-06-10", "2026-06-09", "2026-06-08",
    ]
    digest_days = [1, 2, 3, 4, 5]
    saturday = date(2026, 6, 20)
    current, best = _calculate_streak(dates, digest_days, today=saturday)
    assert current == 10
    assert best == 10

def test_gap_on_counting_day_breaks_streak(self):
    dates = ["2026-06-19", "2026-06-17"]
    digest_days = [1, 2, 3, 4, 5]
    friday = date(2026, 6, 19)
    current, best = _calculate_streak(dates, digest_days, today=friday)
    assert current == 1
    assert best == 1
```

---

### #76 — GROUP BY rewrite for team analytics

Added to `AnalyticsRepository`:

```python
async def get_all_member_submission_dates(
    self, workspace_id: str, from_date: date, to_date: date,
) -> dict[str, list[str]]:
    """Return {user_id: [date_str, ...]} for all members in one query."""
    ...

async def get_all_member_sparklines(
    self, workspace_id: str, from_date: date, to_date: date,
) -> dict[str, dict[str, int]]:
    """Return {user_id: {date_str: count}} for sparklines in one query."""
    ...
```

`get_team_analytics` rewritten to use batch methods — reduces from 2N
queries to 4 queries regardless of member count.

---

### #25 — WebSocket reconnect refetchQueries

```typescript
// apps/web/src/hooks/useWebSocket.ts — ws.onopen handler
// Changed from:
queryClient.invalidateQueries({ queryKey: updateKeys.byDate(...) });
// To:
queryClient.refetchQueries({ queryKey: updateKeys.byDate(...) });
```

---

### #11 — NullPool comment

Added block comment above `create_async_engine` in `ProcessUpdateTask.db_engine`
explaining why NullPool is intentional and must not be removed.

---

### #84 — Heatmap hex comment

Added block comment above `DARK` constant in `heatmap.tsx` explaining
why hex values are hardcoded and linking each value to its corresponding
`globals.css` token name.

---

## Part 2: Core Slack Integration

### Database Changes

**`apps/api/app/models/workspace.py`** — three new columns:

- `slack_webhook_url_encrypted: Mapped[str | None]` — Fernet-encrypted webhook URL
- `slack_digest_enabled: Mapped[bool]` — digest delivery toggle
- `slack_updates_enabled: Mapped[bool]` — update notification toggle

**`apps/api/app/models/digest.py`** — two new columns:

- `delivered_to_slack: Mapped[bool]` — delivery tracking
- `slack_delivered_at: Mapped[datetime | None]` — delivery timestamp

**Alembic migration:** `add_slack_config_to_workspaces` (covers all six columns)

```bash
docker compose exec api alembic upgrade head
```

---

### Config + Encryption

**`apps/api/app/config.py`** — two new settings:

```python
slack_integration_enabled: bool = False
slack_encryption_key: SecretStr | None = None
```

Validator fires only in production AND when `slack_integration_enabled=true`.

**`apps/api/app/lib/slack_crypto.py`** — Fernet encrypt/decrypt:

```python
def encrypt_webhook_url(url: str) -> str: ...
def decrypt_webhook_url(encrypted: str) -> str | None: ...
```

Generate a key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add to `.env`:

```bash
SLACK_INTEGRATION_ENABLED=false
SLACK_ENCRYPTION_KEY=your_generated_key_here
```

---

### Block Kit Builder

**`apps/api/app/lib/slack_blocks.py`** — three builders:

- `build_digest_blocks()` — daily digest with header, team summary, per-member sections, CTA
- `build_update_notification_blocks()` — individual update with content, summary, mode label
- `build_test_blocks()` — sample digest preview using `build_digest_blocks` internally

---

### Slack HTTP Client

**`apps/api/app/lib/slack.py`** — thin async httpx wrapper:

```python
async def post_to_slack(webhook_url, blocks, fallback_text) -> bool:
    """POST Block Kit message. Returns True on 200 "ok", False on any failure."""
```

Non-fatal by design — caller decides whether to log or raise.

---

### Schemas

**`apps/api/app/schemas/slack.py`**:

- `SlackSettingsResponse` — never returns raw webhook URL, hint only
- `UpdateSlackSettingsRequest` — validates `hooks.slack.com` domain; allows `""` for removal
- `SlackTestResponse` — `success: bool` + `message: str`

**`apps/api/app/schemas/workspace.py`** — `WorkspaceResponse` additions:

```python
slack_configured: bool = False
slack_digest_enabled: bool = False
slack_updates_enabled: bool = False
```

**`apps/api/app/schemas/digest.py`** — `DigestResponse` additions:

```python
delivered_to_slack: bool = False
slack_delivered_at: datetime | None = None
```

---

### Slack Service

**`apps/api/app/services/slack_service.py`** — `SlackService` with five methods:

- `get_settings()` — returns masked settings, hint shows last 8 chars of URL
- `update_settings()` — encrypts webhook URL before storage; `""` clears integration
- `send_test_message()` — posts sample digest preview; returns `SlackTestResponse`
- `post_digest_to_slack()` — called from Celery after email delivery; non-fatal
- `post_update_notification()` — called from Celery after AI summarisation; non-fatal

---

### Slack Router

**`apps/api/app/routers/slack.py`** — four endpoints, all admin-only:

- `GET /{workspace_id}/slack/settings` → 200
- `PATCH /{workspace_id}/slack/settings` → 200
- `POST /{workspace_id}/slack/test` → 200
- `DELETE /{workspace_id}/slack/settings` → 204

Registered in `main.py` under `/api/v1`.

---

### Celery Task Wiring

**`apps/api/app/workers/tasks.py`** — three insertion points:

**`_send_workspace_digest_async`** — after email delivery and `db.commit()`:

```python
if final_status == "sent" and workspace.slack_digest_enabled and workspace.slack_webhook_url_encrypted:
    try:
        slack_service = SlackService(db)
        slack_delivered = await slack_service.post_digest_to_slack(...)
        if slack_delivered:
            await digest_repo.update_status(digest.id, status=final_status,
                delivered_to_slack=True, slack_delivered_at=datetime.now(UTC))
            await db.commit()
    except Exception as slack_exc:
        logger.warning("slack_digest_delivery_failed", ...)
```

**`_process_update_async`** — after AI summarisation, inside `try` block:

```python
if workspace and workspace.slack_updates_enabled and workspace.slack_webhook_url_encrypted:
    try:
        author_name = profile.full_name if profile is not None else "A team member"
        await SlackService(db).post_update_notification(...)
    except Exception as slack_exc:
        logger.warning("slack_update_notification_failed", ...)
```

**`_process_audio_update_async`** — same pattern after transcript summarisation.

All three wrapped in isolated `try/except` — Slack failures never affect
the primary email/summarisation pipeline.

**`apps/api/app/repositories/digest_repo.py`** — `update_status` extended:

```python
async def update_status(
    self, digest_id: str, status: str,
    summary: str | None = None,
    update_count: int | None = None,
    email_sent_at: datetime | None = None,
    delivered_to_slack: bool | None = None,    # ← added
    slack_delivered_at: datetime | None = None, # ← added
) -> Digest | None:
```

All existing call sites unchanged — new params default to `None`.

---

## Part 3: Frontend

### Type Updates

**`apps/web/src/hooks/useDigests.ts`** — `Digest` interface:

```typescript
delivered_to_slack: boolean;
slack_delivered_at: string | null;
```

**`apps/web/src/hooks/useWorkspace.ts`** — `WorkspaceResponse` interface:

```typescript
slack_configured: boolean;
slack_digest_enabled: boolean;
slack_updates_enabled: boolean;
```

---

### Slack Hooks

**`apps/web/src/hooks/useSlack.ts`** — four hooks:

```typescript
export function useSlackSettings(workspaceId: string | undefined);
export function useUpdateSlackSettings(workspaceId: string);
export function useSendSlackTest(workspaceId: string);
export function useRemoveSlackIntegration(workspaceId: string);
```

Key factory:

```typescript
export const slackKeys = {
  settings: (workspaceId: string) =>
    ["slack", workspaceId, "settings"] as const,
};
```

`useUpdateSlackSettings` and `useRemoveSlackIntegration` both invalidate
`workspaceKeys.mine()` on success.

---

### `/settings/slack` Page

**`apps/web/src/app/(app)/settings/slack/page.tsx`**

Features:

- Connection status banner (green/amber dot + webhook hint)
- Webhook URL input (bottom-border style, deferred save)
- Two notification toggles (immediate PATCH on click, disabled when not connected)
- "Send test message" button (disabled when not connected)
- Inline test result message (success/failure)
- Danger zone with two-step remove confirmation

---

### Sidebar

**`apps/web/src/components/layout/sidebar.tsx`** — Slack added to `SETTINGS_LINKS`:

```typescript
{ href: '/settings/slack', label: 'Slack', icon: 'label' },
```

---

### Digest Card Slack Badge

**`apps/web/src/components/domain/digests/digest-card.tsx`**:

```typescript
{digest.delivered_to_slack && (
  <span className="flex items-center gap-1 font-label text-[9px] uppercase tracking-[0.1em] text-outline">
    <svg width="10" height="10" ...>...</svg>
    Slack
  </span>
)}
```

Uses inline SVG (not Material Symbols) for Storybook compatibility.

---

### Storybook

**`.storybook/preview.ts`** — added Material Symbols font loader decorator:

```typescript
(Story) => {
  if (typeof document !== 'undefined') {
    const id = 'material-symbols-storybook';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:...';
      document.head.appendChild(link);
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('fonts-loaded');
      });
    }
  }
  return React.createElement(Story);
},
```

**`stories/settings/SlackSettingsPage.stories.tsx`** — 8 stories:

- `NotConnectedDark` / `NotConnectedLight`
- `ConnectedDark` / `ConnectedLight`
- `DirtyDark` (unsaved webhook URL)
- `SavingDark`
- `TestSuccessDark` / `TestFailureDark`
- `RemoveConfirmDark`

**`stories/domain/digests/DigestCard.stories.tsx`** — additions:

- `DIGEST_WITH_SLACK` fixture (`delivered_to_slack: true`)
- `WithSlackDeliveryDark` / `WithSlackDeliveryLight` stories
- `MultipleDark` updated to include Slack-delivered card
- All existing fixtures updated with new `Digest` fields

---

## Unit Tests

### Backend

```
tests/unit/test_slack_crypto.py          11 tests — encrypt, decrypt, roundtrip,
                                          wrong key, missing key
tests/unit/test_slack_blocks.py          24 tests — all three builders, structure,
                                          content, fallbacks, mode labels
tests/unit/test_slack_client.py           8 tests — 200/ok, non-200, body not ok,
                                          timeout, connection error, unexpected exception,
                                          correct URL, correct payload
tests/unit/test_slack_service.py         20 tests — get_settings, update_settings,
                                          send_test_message, post_digest_to_slack,
                                          post_update_notification
tests/integration/test_slack_endpoints.py 21 tests — all four endpoints,
                                          status codes, error mapping, validation
tests/unit/test_digest_repo.py            2 new tests — delivered_to_slack,
                                          slack_delivered_at kwargs on update_status
```

### Frontend

```
tests/unit/useSlack.test.ts              16 tests — all four hooks,
                                          endpoint calls, enabled guards,
                                          token checks, success/failure states
tests/unit/digest-card.test.tsx           1 new test — Slack badge rendering
tests/mocks/user.ts                      Updated — MOCK_DIGEST, MOCK_WORKSPACE,
                                          MOCK_SLACK_SETTINGS,
                                          MOCK_SLACK_SETTINGS_NOT_CONNECTED
```

---

## Known Tradeoffs

**1. Slack delivery is inline in Celery tasks — holds worker open up to 10s**
Acceptable at current scale. Post-M9: extract into chained task.
See `specs/scaling/api/slack_integration.md` Issue 1.

**2. Webhook URL decrypted on every notification call**
CPU-only, < 1ms. No caching. Acceptable at current scale.
See `specs/scaling/api/slack_integration.md` Issue 2.

**3. Slack delivery failure is non-fatal — no retry**
Email is the primary channel. Slack is supplementary.
See `specs/scaling/api/slack_integration.md` Issue 4.

**4. Single webhook URL for all notification types**
Teams wanting separate channels per notification type cannot do this.
Deferred post-M9. See `specs/scaling/api/slack_integration.md` Issue 3.

**5. Update notification fires after AI summarisation (10–30s delay)**
Intentional — the summary is the most useful content in the notification.

**6. Toggle optimistic update not implemented**
Toggles fire immediate PATCH and wait for server response.
See `specs/scaling/web/slack_integration.md` Issue 1.

**7. Test result message persists until navigation**
No auto-dismiss. See `specs/scaling/web/slack_integration.md` Issue 3.

---

## Acceptance Criteria

```
[x] Pre-checklist items #8, #11, #25, #68, #77, #84 completed
[x] #76 GROUP BY rewrite reduces team analytics to 4 queries
[x] Admin can add Slack webhook URL on /settings/slack
[x] Webhook URL validated as hooks.slack.com domain
[x] Webhook URL encrypted with Fernet before DB storage
[x] Webhook URL never returned in API responses (hint only)
[x] SLACK_ENCRYPTION_KEY env var required in production
[x] Digest notification toggles enabled/disabled correctly
[x] Update notification toggles enabled/disabled correctly
[x] Toggles disabled when no webhook URL configured
[x] Daily digest posted to Slack after email delivery when enabled
[x] Block Kit digest message: header, team summary, per-member blocks, CTA
[x] Update notification posted after AI summary complete when enabled
[x] Block Kit update card: author, raw text, summary, CTA
[x] Test message sends sample digest preview to channel
[x] Test result shown inline (success/failure message)
[x] Remove integration clears webhook URL and disables toggles
[x] Remove requires confirmation before executing
[x] Digest history cards show Slack delivery badge when delivered
[x] Connection status banner shows on /settings/slack
[x] Sidebar shows Slack link under Settings
[x] cryptography package added to requirements.txt
[x] Backend unit tests pass for crypto, blocks, service, client, endpoints
[x] Frontend unit tests pass for hooks
[x] Storybook stories added for SlackSettingsPage and DigestCard
[x] feature/milestone-8 merged to develop
```

---

## Files Created / Modified

### New Files — Backend

```
apps/api/app/lib/slack_crypto.py
apps/api/app/lib/slack_blocks.py
apps/api/app/lib/slack.py
apps/api/app/schemas/slack.py
apps/api/app/services/slack_service.py
apps/api/app/routers/slack.py
apps/api/alembic/versions/YYYYMMDD_*_add_slack_config_to_workspaces.py
apps/api/tests/unit/test_slack_crypto.py
apps/api/tests/unit/test_slack_blocks.py
apps/api/tests/unit/test_slack_service.py
apps/api/tests/unit/test_slack_client.py
apps/api/tests/integration/test_slack_endpoints.py
```

### New Files — Frontend

```
apps/web/src/hooks/useSlack.ts
apps/web/src/app/(app)/settings/slack/page.tsx
apps/web/src/stories/settings/SlackSettingsPage.stories.tsx
apps/web/tests/unit/useSlack.test.ts
```

### Modified Files

```
apps/api/app/models/workspace.py
apps/api/app/models/digest.py
apps/api/app/schemas/workspace.py
apps/api/app/schemas/digest.py
apps/api/app/repositories/digest_repo.py
apps/api/app/repositories/analytics_repo.py
apps/api/app/services/analytics_service.py
apps/api/app/workers/tasks.py
apps/api/app/config.py
apps/api/app/main.py
apps/api/requirements.txt
apps/api/tests/unit/test_analytics_service.py
apps/api/tests/unit/test_digest_repo.py
apps/api/tests/conftest.py
apps/web/src/hooks/useDigests.ts
apps/web/src/hooks/useWorkspace.ts
apps/web/src/components/layout/sidebar.tsx
apps/web/src/components/domain/digests/digest-card.tsx
apps/web/src/components/ui/heatmap.tsx
apps/web/src/hooks/useWebSocket.ts
apps/web/src/stories/domain/digests/DigestCard.stories.tsx
apps/web/tests/mocks/user.ts
apps/web/tests/unit/digest-card.test.tsx
apps/web/.storybook/preview.ts
```

### Scaling Docs Created

```
specs/scaling/api/slack_integration.md   ← 7 API scaling issues
specs/scaling/web/slack_integration.md   ← 7 Web scaling issues
```
