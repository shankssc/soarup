# SoarUp — Scaling & Technical Debt: Slack Integration (API)

# Path: specs/scaling/api/slack_integration.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 8

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the Slack integration introduced in Milestone 8.
This covers `lib/slack.py`, `lib/slack_blocks.py`, `lib/slack_crypto.py`,
`services/slack_service.py`, `routers/slack.py`, and the Celery task
wiring in `workers/tasks.py`. Items are ordered by expected impact, not
urgency. None of these are blockers for early-stage use.

---

## Issue 1 — Slack Delivery Is Inline in the Digest Celery Task

**Where:** `apps/api/app/workers/tasks.py`
→ `_send_workspace_digest_async`

**What:** Slack digest delivery is wired directly into the end of the
`send_workspace_digest` Celery task, after email delivery. If Slack's API
is slow (up to 10s timeout), the digest task is held open for up to 10
additional seconds per workspace:

```python
# Current — Slack delivery inline, holds task open
if final_status == "sent" and workspace.slack_digest_enabled:
    slack_delivered = await slack_service.post_digest_to_slack(...)
    if slack_delivered:
        await digest_repo.update_status(...)
        await db.commit()
```

The `httpx` timeout is set to 10 seconds. In the worst case, each workspace
digest task takes 10 extra seconds when Slack is slow, blocking the Celery
worker for that duration.

**Impact:** Low at current scale — few workspaces, Slack's incoming webhook
API is generally < 500ms. At 100+ Slack-enabled workspaces with simultaneous
digest sends, a Slack API slowdown could cause Celery worker exhaustion.

**Fix (post-M9):** Extract Slack delivery into a separate chained Celery
task using Celery canvas:

```python
send_workspace_digest.si(workspace_id, digest_date) | send_slack_digest.si(workspace_id, digest_id)
```

The Slack task runs independently, with its own retry policy, and does not
hold the digest task open. A Slack API timeout only affects the Slack task,
not the email delivery pipeline.

**Effort:** Medium — new `send_slack_digest` Celery task + canvas wiring

- pass `digest_id` to the Slack task for tracking.

---

## Issue 2 — Webhook URL Decrypted on Every Notification

**Where:** `apps/api/app/services/slack_service.py`
→ `post_digest_to_slack`, `post_update_notification`

**What:** Every call to `post_digest_to_slack` and `post_update_notification`
decrypts the Fernet-encrypted webhook URL from scratch:

```python
webhook_url = decrypt_webhook_url(workspace.slack_webhook_url_encrypted)
```

Fernet decryption is CPU-only and takes < 1ms per call. At current scale
this is not measurable. However, each Celery task also fetches the workspace
row from the DB to get the encrypted URL, adding one DB query per notification.

**Impact:** None at current scale. At 10,000+ updates per day across many
workspaces, the aggregate DB reads become meaningful.

**Fix (post-M9):** Cache the decrypted webhook URL in Redis with a short
TTL (e.g. 5 minutes) keyed on `workspace_id`. First call decrypts and
caches; subsequent calls within the TTL window read from Redis. Invalidate
the cache when `update_settings` is called with a new webhook URL.

**Effort:** Low — Redis get/set around the decrypt call in `SlackService`,
cache invalidation in `update_settings`.

---

## Issue 3 — Single Webhook URL for Both Digest and Update Notifications

**Where:** `apps/api/app/models/workspace.py`
→ `slack_webhook_url_encrypted`
and `apps/api/app/services/slack_service.py`

**What:** Both digest delivery and update notifications share a single
incoming webhook URL, meaning both post to the same Slack channel. Teams
that want digest summaries in `#standup` and individual update notifications
in `#general` cannot achieve this in M8.

```python
# Current — one URL, one channel for all notification types
slack_webhook_url_encrypted = mapped_column(Text, nullable=True)
```

**Impact:** Low — most small teams are happy with one channel. This becomes
a friction point for teams with structured channel hierarchies.

**Fix (post-M9):** Add separate webhook URL columns per notification type:

```python
slack_digest_webhook_url_encrypted: Mapped[str | None]
slack_updates_webhook_url_encrypted: Mapped[str | None]
```

The settings page would expose two separate URL inputs. The Slack service
would use the appropriate URL per notification type.

**Effort:** Medium — two new model columns + Alembic migration + updated
service logic + updated settings UI.

---

## Issue 4 — No Retry on Slack Delivery Failure

**Where:** `apps/api/app/lib/slack.py` → `post_to_slack`
and `apps/api/app/workers/tasks.py`

**What:** Slack delivery failures (network timeout, expired webhook, Slack
API error) are logged and silently swallowed — they do not trigger a Celery
retry:

```python
# Current — non-fatal, no retry
except httpx.TimeoutException:
    logger.warning("slack_message_timeout", ...)
    return False
```

If Slack's API is temporarily unavailable when a digest is delivered, the
digest is marked as `delivered_to_slack=False` with no retry. The team
misses the Slack notification for that day.

**Impact:** Low — email is the primary delivery channel. Slack is
supplementary. Missing one daily Slack digest is not critical.

**Fix (post-M9):** As part of the chained task refactor (Issue 1), the
`send_slack_digest` Celery task can have its own retry policy:

```python
@celery_app.task(
    max_retries=3,
    default_retry_delay=60,
    retry_backoff=True,
)
def send_slack_digest(workspace_id, digest_id):
    ...
```

Retries are independent of the email digest task and do not risk
double-sending the email.

**Effort:** Low — part of the Issue 1 chained task refactor.

---

## Issue 5 — Slack Settings Fetch Workspace on Every Service Method Call

**Where:** `apps/api/app/services/slack_service.py`
→ `get_settings`, `update_settings`, `send_test_message`,
`post_digest_to_slack`, `post_update_notification`

**What:** Every `SlackService` method instantiates a fresh
`WorkspaceRepository` and fetches the workspace row from the DB:

```python
# Called in every method — one DB query per service call
repo = WorkspaceRepository.from_session(self.db)
workspace = await repo.get_by_id(workspace_id)
```

For the HTTP endpoints (GET/PATCH/POST/DELETE settings), this is one query
per request — acceptable. For the Celery task notifications, `post_digest_to_slack`
fetches the workspace a second time even though `_send_workspace_digest_async`
already fetched it earlier in the same task.

**Impact:** Low — one additional indexed primary key lookup per notification,
< 1ms. Not measurable at current scale.

**Fix:** Pass the already-fetched `workspace` object directly to
`post_digest_to_slack` and `post_update_notification` instead of re-fetching:

```python
# Pass workspace object instead of re-fetching
slack_delivered = await slack_service.post_digest_to_slack(
    workspace=workspace,  # already fetched above
    digest_date=digest_date,
    team_summary=team_summary,
    items=items_for_template,
)
```

Requires a signature change on those two methods.

**Effort:** Low — signature change + remove repo calls inside those methods.

---

## Issue 6 — `slack_integration_enabled` Config Flag Has No Runtime Guard in Tasks

**Where:** `apps/api/app/workers/tasks.py`
and `apps/api/app/config.py`

**What:** `SLACK_INTEGRATION_ENABLED` was added to `config.py` as a
production startup guard. However, the Celery task Slack wiring checks
`workspace.slack_digest_enabled` and `workspace.slack_webhook_url_encrypted`
at the workspace level — it does not check `settings.slack_integration_enabled`
at the platform level. If an operator sets `SLACK_INTEGRATION_ENABLED=false`
to disable Slack globally, the per-workspace checks still pass and
notifications are still attempted.

```python
# Current — no platform-level guard in tasks
if workspace.slack_digest_enabled and workspace.slack_webhook_url_encrypted:
    slack_service = SlackService(db)
    await slack_service.post_digest_to_slack(...)
```

**Impact:** Low — `SLACK_INTEGRATION_ENABLED` was introduced as a
production key guard, not a runtime feature flag. The only practical scenario
is an operator who sets it to `false` without also revoking all workspace
webhook URLs.

**Fix:** Add a platform-level guard in the Celery task:

```python
if settings.slack_integration_enabled and workspace.slack_digest_enabled:
    ...
```

**Effort:** Near-zero — one additional condition in each Celery task
Slack block.

---

## Issue 7 — Block Kit Messages Have No Character Limit Enforcement

**Where:** `apps/api/app/lib/slack_blocks.py`
→ `build_digest_blocks`, `build_update_notification_blocks`

**What:** Slack Block Kit section text fields have a maximum of 3,000
characters per block. If a team summary or individual update content
exceeds 3,000 characters, Slack silently truncates or rejects the block,
producing a malformed message with no error surfaced to SoarUp.

```python
# Current — no length check
{
    "type": "section",
    "text": {
        "type": "mrkdwn",
        "text": f"*Team Summary*\n>{team_summary}",  # could exceed 3000 chars
    },
}
```

**Impact:** Low — Claude-generated summaries are typically 100-300 characters.
Individual update content can be longer (voice transcripts for long recordings
may approach 2,000+ characters), but 3,000 characters is rarely exceeded
in practice.

**Fix:** Truncate text fields to 2,900 characters with an ellipsis before
building blocks:

```python
def _truncate(text: str, max_len: int = 2900) -> str:
    return text if len(text) <= max_len else text[:max_len] + "…"
```

**Effort:** Near-zero — one utility function applied to all text fields
in `slack_blocks.py`.

---

## Summary Table

| #   | Issue                                                     | Impact                                   | Fix Milestone | Effort    |
| --- | --------------------------------------------------------- | ---------------------------------------- | ------------- | --------- |
| 1   | Slack delivery inline in digest task — holds worker open  | Low (Slack API generally fast)           | Post-M9       | Medium    |
| 2   | Webhook URL decrypted + workspace fetched on every notify | None (< 1ms, low volume)                 | Post-M9       | Low       |
| 3   | Single webhook URL for all notification types             | Low (channel flexibility)                | Post-M9       | Medium    |
| 4   | No retry on Slack delivery failure                        | Low (email is primary channel)           | Post-M9       | Low       |
| 5   | Workspace re-fetched in every SlackService method         | None (indexed PK lookup, < 1ms)          | Post-M9       | Low       |
| 6   | `slack_integration_enabled` not checked in Celery tasks   | Low (operator edge case only)            | Post-M9       | Near-zero |
| 7   | Block Kit text fields have no character limit enforcement | Low (summaries rarely exceed 3000 chars) | Post-M9       | Near-zero |

---

## Pre-Production Checklist (API — Slack Integration)

```
[ ] Issue 7:  Add _truncate() utility and apply to all Block Kit text fields
[ ] Issue 6:  Add settings.slack_integration_enabled guard in Celery task blocks
[ ] Issue 5:  Pass workspace object to post_digest_to_slack / post_update_notification
[ ] Issue 2:  Cache decrypted webhook URL in Redis with 5-minute TTL
[ ] Issue 4:  Add retry policy to Slack delivery (part of Issue 1 refactor)
[ ] Issue 1:  Extract Slack delivery into chained Celery task
[ ] Issue 3:  Add separate digest/updates webhook URL columns (post-M9)
```
