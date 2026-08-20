# SoarUp — Scaling & Technical Debt: Digest Pipeline (API)

# Path: specs/scaling/api/digest_pipeline.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 6

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the digest pipeline introduced in Milestone 6.
This covers `workers/tasks.py` (Celery Beat + digest tasks),
`workers/celery_app.py`, `routers/digests.py`, `services/digest_service.py`,
`repositories/digest_repo.py`, `lib/email.py` (Jinja2 templates), and
`models/digest.py`. Items are ordered by expected impact, not urgency. None
of these are blockers for early-stage use.

---

## Issue 1 — Digest Send Time Accurate Only to Nearest 5-Minute Window

**Where:** `apps/api/app/workers/celery_app.py` → beat schedule
and `apps/api/app/workers/tasks.py` → `_check_and_send_digests_async`

**What:** The Celery Beat polling task runs every 5 minutes via
`crontab(minute="*/5")`. The digest send time check uses a window match:

```python
send_total = send_h * 60 + send_m
current_total = current_h * 60 + current_m
if not (send_total <= current_total < send_total + 5):
    continue
```

This means a workspace configured to send at `09:00` will have its digest
triggered any time the Beat tick lands between `09:00` and `09:04`. In
practice, if Beat fires at `09:03`, the digest goes out at `09:03`, not `09:00`.

**Impact:** Low — daily digest timing accuracy to within 5 minutes is
acceptable for async standups. Not a precision scheduling tool.

**Fix (post-M9):** Replace the polling model with a scheduled task per
workspace using Celery's `eta` parameter or a proper task scheduler like
`django-celery-beat` with dynamic schedule management. This enables exact
send times at the cost of higher scheduler complexity.

**Effort:** Medium — requires dynamic beat schedule storage (DB-backed) and
per-workspace task management.

---

## Issue 2 — Claude Sonnet Used for All Digests Regardless of Team Size

**Where:** `apps/api/app/workers/tasks.py` → `_send_workspace_digest_async`
and `apps/api/app/services/digest_service.py` → `preview_digest`

**What:** All digest summarisation uses Claude Sonnet as the primary model
with Haiku as retry fallback. For small workspaces (1-2 members), Sonnet
is overkill — a 2-sentence summary from 2 individual updates does not
require a frontier model. Anthropic API spend scales linearly with workspace
count regardless of team size.

```python
# Current — Sonnet for all workspaces, all sizes
use_fallback = task.request.retries > 0
team_summary = await summarise(prompt, use_fallback=use_fallback)
```

**Impact:** Low at current scale — with few workspaces, Anthropic API costs
are negligible. At 1000+ active workspaces sending daily digests, model
selection becomes a meaningful cost lever.

**Fix (post-M9):** Add a model selection heuristic based on `update_count`:

- 1-3 updates → Haiku (sufficient for short synthesis)
- 4+ updates → Sonnet (needed for coherent multi-person synthesis)

**Effort:** Low — one conditional in `_send_workspace_digest_async` before
the `summarise` call.

---

## Issue 3 — Digest Email Sent to All Recipients in a Single Resend Request

**Where:** `apps/api/app/lib/email.py` → `send_digest_email`
and `apps/api/app/workers/tasks.py` → `_send_workspace_digest_async`

**What:** All recipient emails are passed as a single `to` array in one
Resend API call:

```python
params: Emails.SendParams = {
    "to": to_emails,  # all recipients in one call
    ...
}
```

Resend enforces a maximum of 50 recipients per `emails.send` call. Workspaces
with more than 50 members with `email_notifications=True` will cause the
Resend call to fail silently (Resend returns a 422, which is caught and logged
as `digest_email_failed`), and no digest email will be delivered to anyone.

**Impact:** Low at current scale — workspaces with 50+ active members are
unlikely in the early stage. A silent failure here is particularly bad because
the digest `status` will be set to `failed` with no indication of the root cause.

**Fix:** Chunk `to_emails` into batches of 50 and send one Resend request
per batch:

```python
BATCH_SIZE = 50
for i in range(0, len(to_emails), BATCH_SIZE):
    batch = to_emails[i:i + BATCH_SIZE]
    await asyncio.to_thread(resend.Emails.send, {**params, "to": batch})
```

**Effort:** Near-zero — one loop wrapping the existing send call.

---

## Issue 4 — No Unsubscribe Mechanism for Digest Emails

**Where:** `apps/api/app/lib/email.py` → `render_digest_email`
and `apps/api/app/email_templates/digest_email.html`

**What:** The digest email template includes an unsubscribe URL placeholder
that is always passed as an empty string:

```python
html = render_digest_email(
    ...
    unsubscribe_url="",  # post-M6 feature
)
```

The footer renders a dead unsubscribe link (or no link at all when empty).
Members who want to stop receiving digest emails must either ask a workspace
admin to toggle their settings or navigate to profile settings themselves.
Under CAN-SPAM and GDPR, commercial emails must include a working unsubscribe
mechanism.

**Impact:** Medium for production compliance — not a blocker for internal
or early-stage use, but a requirement before any public-facing launch.

**Fix (post-M9):**

1. Generate a signed unsubscribe token per recipient (HMAC of `user_id +
workspace_id + timestamp`)
2. Add `GET /unsubscribe/{token}` endpoint that validates the token and
   sets `profile.email_notifications = False`
3. Pass the full unsubscribe URL per recipient when rendering the email —
   requires per-recipient rendering instead of one shared HTML blob

**Effort:** Medium — token generation + endpoint + per-recipient rendering
(currently one render call for all recipients).

---

## Issue 5 — Digest Repo Uses `commit()` Inside Task Session — No Savepoint Safety

**Where:** `apps/api/app/repositories/digest_repo.py` → `create`,
`update_status`, `add_items`

**What:** After fixing the `commit()` → `flush()` issue for the service
layer (which uses SAVEPOINT-isolated test sessions), the Celery task creates
its own `async_sessionmaker` session and calls repo methods directly.
The repo methods now use `flush()`, which means changes in the task session
are not persisted until the task explicitly calls `await db.commit()`.

There are multiple explicit `await db.commit()` calls scattered through
`_send_workspace_digest_async`. If an exception occurs between commits,
partial state can be written — for example, `DigestItems` flushed but
digest status not yet updated to `sent`.

```python
# Current — multiple commit points, partial state possible on failure
await digest_repo.create(...)
await db.commit()  # commit 1
await digest_repo.add_items(...)
await db.commit()  # commit 2
await digest_repo.update_status(..., status="sent")
await db.commit()  # commit 3 — if exception here, items exist but status is wrong
```

**Impact:** Low — Celery retry logic re-runs the task from the beginning.
The idempotency check (`get_for_workspace_date` returning `status="sent"`)
prevents double-sending. A partial state (items exist, status is `processing`)
is recoverable on retry.

**Fix:** Wrap the entire digest pipeline in a single transaction. Use a
single `await db.commit()` at the very end, after all writes succeed:

```python
# All writes in one transaction
digest = await digest_repo.create(...)
await digest_repo.update_status(..., status="processing")
await digest_repo.add_items(...)
await digest_repo.update_status(..., status="sent", email_sent_at=now)
await db.commit()  # single commit — all or nothing
```

Email send happens outside the transaction (network call) — status update
to `sent` happens after successful send.

**Effort:** Low — reorganise the commit points in `_send_workspace_digest_async`.

---

## Issue 6 — No Rate Limiting on `POST /digests/preview`

**Where:** `apps/api/app/routers/digests.py` → `preview_digest`
and `apps/api/app/services/digest_service.py` → `preview_digest`

**What:** The preview endpoint calls Claude Sonnet synchronously on every
request with no rate limiting, caching, or debouncing. A workspace admin
who repeatedly clicks "Preview digest" in quick succession will fire multiple
Sonnet API calls concurrently, each generating a fresh summary.

```python
# Current — no rate limiting, no cache
team_summary = await summarise(prompt, use_fallback=False)
```

**Impact:** Low at current scale — one admin per workspace, previews are
intentional. At scale with many workspaces and active admins, this could
cause unexpected Anthropic API spend.

**Fix:** Cache the preview result in Redis with a short TTL (e.g. 60 seconds)
keyed on `workspace_id + digest_date + update_count`. A second preview
request within 60 seconds returns the cached HTML without re-calling Claude.

**Effort:** Low — one Redis get/set around the `summarise` call.

---

## Issue 7 — Jinja2 `FileSystemLoader` Path Is Process-Working-Directory Dependent

**Where:** `apps/api/app/lib/email.py` → `_TEMPLATE_DIR`

**What:** The Jinja2 environment resolves templates using an absolute path
derived from `__file__`:

```python
_TEMPLATE_DIR = Path(__file__).parent.parent / "email_templates"
```

This correctly resolves to `apps/api/app/email_templates/` regardless of
working directory. However, the Celery worker process (`celery -A
app.workers.celery_app worker`) imports `email.py` from a different
working directory than the Uvicorn process. If the path resolution ever
changes (e.g. editable install, symlinks, or Docker layer caching), templates
may not be found in the worker context.

**Impact:** Low — `Path(__file__)` is resolved at import time and is
reliable in Docker containers. Only a risk if the deployment model changes
significantly.

**Fix:** Add a startup assertion in the Celery app that verifies the template
directory exists before the worker accepts tasks:

```python
# In celery_app.py or a worker_ready signal handler
assert _TEMPLATE_DIR.exists(), f"Email templates not found at {_TEMPLATE_DIR}"
```

**Effort:** Near-zero — one assertion.

---

## Issue 8 — `pytz` Dependency Added for Timezone Resolution

**Where:** `apps/api/app/workers/tasks.py` → `_check_and_send_digests_async`

**What:** `pytz` was added as a dependency for timezone-aware scheduling in
the digest polling task. Python 3.9+ includes `zoneinfo` in the standard
library, which covers all the same IANA timezone functionality without a
third-party dependency.

```python
# Current — third-party pytz
import pytz
tz = pytz.timezone(tz_str)

# Alternative — stdlib zoneinfo (Python 3.12+)
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
tz = ZoneInfo(tz_str)
```

**Impact:** None functional — `pytz` and `zoneinfo` behave identically for
IANA timezone lookups. Minor dependency bloat.

**Fix:** Replace `pytz` with `zoneinfo` across the codebase and remove
`pytz` from `requirements.txt`.

**Effort:** Near-zero — three import changes and one exception type change
(`pytz.UnknownTimeZoneError` → `ZoneInfoNotFoundError`).

---

## Issue 9 — Digest History Has No Archival or Retention Policy

**Where:** `apps/api/app/models/digest.py` and `apps/api/app/repositories/digest_repo.py`

**What:** `Digest` and `DigestItem` records accumulate indefinitely. A
workspace that has been active for 2 years with daily digests will have
730+ `Digest` rows and thousands of `DigestItem` rows. There is no TTL,
archival policy, or cleanup job.

**Impact:** Low at current scale. PostgreSQL handles millions of rows without
issue at early-stage user counts. Becomes a storage and query performance
concern at multi-year scale with thousands of workspaces.

**Fix (post-M9):** Add a scheduled Celery task that archives or soft-deletes
`Digest` records older than a configurable retention window (e.g. 90 days).
`DigestItems` cascade-delete via FK. Alternatively, add an `archived_at`
column and filter it out of the list query.

**Effort:** Low — one Celery task + one index on `created_at`.

---

## Summary Table

| #   | Issue                                                 | Impact                              | Fix Milestone | Effort    |
| --- | ----------------------------------------------------- | ----------------------------------- | ------------- | --------- |
| 1   | Send time accurate to 5-min window only               | Low (acceptable for daily digest)   | Post-M9       | Medium    |
| 2   | Sonnet used for all workspaces regardless of size     | Low (cost at scale)                 | Post-M9       | Low       |
| 3   | All recipients in single Resend call (50-limit)       | Low (silent failure at 50+ members) | Pre-launch    | Near-zero |
| 4   | No unsubscribe mechanism in digest emails             | Medium (compliance requirement)     | Post-M9       | Medium    |
| 5   | Multiple commit points in digest task (partial state) | Low (idempotency covers recovery)   | Milestone 7   | Low       |
| 6   | No rate limiting on preview endpoint                  | Low (cost at scale)                 | Post-M9       | Low       |
| 7   | Jinja2 template path could break in non-Docker deploy | Low (reliable in container)         | Document only | Near-zero |
| 8   | pytz used instead of stdlib zoneinfo                  | None (functional, minor bloat)      | Milestone 7   | Near-zero |
| 9   | No digest retention/archival policy                   | Low (storage at multi-year scale)   | Post-M9       | Low       |

---

## Pre-Production Checklist (API — Digest items)

```
[ ] Issue 3:  Chunk to_emails into batches of 50 in send_digest_email
[ ] Issue 4:  Implement signed unsubscribe token + GET /unsubscribe/{token} endpoint
[ ] Issue 5:  Consolidate digest task commits into single transaction
[ ] Issue 8:  Replace pytz with zoneinfo, remove pytz from requirements.txt
[ ] Issue 2:  Add update_count-based model selection heuristic (Haiku vs Sonnet)
[ ] Issue 6:  Add Redis cache on preview endpoint (60s TTL)
```
