# SoarUp — Scaling & Technical Debt: Updates (API)

# Path: docs/specs/scaling/api/updates.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 2

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the updates flow introduced in Milestone 2. Items
are ordered by expected impact, not urgency. None of these are blockers for
early-stage use.

---

## Issue 1 — N+1 Profile Queries in `_to_response`

**Where:** `apps/api/app/services/update_service.py` → `_to_response`

**What:** Every call to `get_workspace_updates` fetches profiles one at a time
in a loop. For a workspace with 10 members, that's 10 sequential `SELECT`
statements against the profiles table per dashboard load.

```python
# Current — one query per update
async def _to_response(self, update: Any) -> UpdateResponse:
    profile = await self._get_profile_repo().get_by_user_id(update.user_id)
    ...
```

**Impact:** Negligible for solo use (1 update/day). Noticeable at 10+ team
members. Painful at 50+.

**Fix (Milestone 5):** Batch profile fetch in `get_workspace_updates`:

```python
# Collect all user_ids first
user_ids = [u.user_id for u in updates]

# Single query — SELECT * FROM profiles WHERE id = ANY(:ids)
profiles = await profile_repo.get_by_user_ids(user_ids)
profile_map = {p.id: p for p in profiles}

# Map without additional queries
responses = [self._to_response_sync(u, profile_map.get(u.user_id)) for u in updates]
```

**Effort:** Low — one new repo method + refactor of `_to_response`.

---

## Issue 2 — Client-Controlled `update_date`

**Where:** `apps/api/app/schemas/update.py` → `SubmitUpdateRequest.update_date`
and `apps/api/app/services/update_service.py` → `submit_update`

**What:** The date string (`YYYY-MM-DD`) is sent by the client in its local
timezone. The server accepts it without validation. A malicious or buggy client
can backdate or future-date submissions.

```python
# Current — server trusts whatever date the client sends
class SubmitUpdateRequest(BaseModel):
    update_date: str = Field(..., description="ISO date string YYYY-MM-DD")
```

**Impact:** Data integrity risk. A user could submit multiple updates on
different dates by manipulating the date field, bypassing the unique constraint.
Low risk for a trusted team product, higher risk as you open to the public.

**Fix (Milestone 3):** Store each user's timezone during onboarding (already
collected). On the server, compute the expected date from `datetime.now(tz)`
using the user's stored timezone and reject requests where `update_date` differs
by more than ±1 day (to handle edge cases around midnight).

```python
from zoneinfo import ZoneInfo
from datetime import datetime

def validate_update_date(user_timezone: str, submitted_date: str) -> bool:
    user_now = datetime.now(ZoneInfo(user_timezone))
    expected_date = user_now.strftime("%Y-%m-%d")
    return submitted_date == expected_date
```

**Effort:** Low — requires reading timezone from profile in `submit_update`.

---

## Issue 3 — No Pagination on `get_workspace_updates`

**Where:** `apps/api/app/routers/updates.py` → `GET /{workspace_id}/updates`
and `apps/api/app/repositories/update_repo.py` →
`get_workspace_updates_for_date`

**What:** The endpoint returns all updates for a given date with no limit.
For the history feature (future milestone), a date range query with no
pagination could return thousands of rows.

```python
# Current — unbounded result set
async def get_workspace_updates_for_date(self, workspace_id, update_date) -> list[Update]:
    result = await self.db.execute(
        select(Update).where(...).order_by(Update.created_at.asc())
    )
    return list(result.scalars().all())
```

**Impact:** Fine for one update per user per day (current scope). Becomes a
problem when the history page queries date ranges — e.g. last 30 days for a
10-person team is 300 rows minimum, unbounded.

**Fix (Milestone 5, before history feature):** Add cursor-based pagination:

```python
async def get_workspace_updates_for_date(
    self,
    workspace_id: str,
    update_date: str,
    limit: int = 50,
    cursor: str | None = None,  # update.id of last seen item
) -> tuple[list[Update], str | None]:
    ...
```

Return a `next_cursor` in the response. Frontend React Query uses
`useInfiniteQuery` instead of `useQuery`.

**Effort:** Medium — repo + service + schema + router + frontend hook changes.

---

## Issue 4 — Status Permanently "pending" Until Milestone 3

**Where:** `apps/api/app/models/update.py` → `status` column
and `apps/api/app/services/update_service.py` → `submit_update`

**What:** The Celery task (`process_update.delay(update.id)`) is commented out.
All updates sit at `status="pending"` indefinitely. When Milestone 3 wires the
task, existing rows will never be processed.

```python
# Current — placeholder comment
# Milestone 3: process_update.delay(update.id)
```

**Impact:** No functional impact now. When Celery is wired in Milestone 3,
all pre-existing `pending` rows will need a backfill to either trigger
processing or be marked `failed`.

**Fix (Milestone 3):** Write a one-off Celery task or Alembic data migration
to backfill pre-existing rows:

```python
# Option A — mark old pending rows as failed (simple)
UPDATE updates SET status = 'failed' WHERE status = 'pending' AND created_at < :milestone_3_deploy_date;

# Option B — enqueue all pending rows for processing (if content is still valid)
# Celery chord or group to process in batches
```

**Effort:** Low for Option A, medium for Option B. Decision depends on whether
pre-Milestone-3 updates are worth summarising.

---

## Issue 5 — No Request Idempotency on Submit

**Where:** `apps/api/app/routers/updates.py` → `POST /{workspace_id}/updates`

**What:** If a client submits an update and the network drops before receiving
the 202 response, a retry will hit a 409 (`update_already_exists`). The client
must then inspect `details.existing_id` in the error response to recover
gracefully. This logic is not yet implemented on the frontend.

```python
# Current — 409 error details contain existing_id but frontend ignores it
raise UpdateError(
    "update_already_exists",
    "You have already submitted an update for today.",
    {"existing_id": existing.id},
)
```

**Impact:** Poor UX on flaky connections — user sees an error when their update
actually succeeded. Low frequency but annoying when it happens.

**Fix (two parts):**

Backend — accept an optional `idempotency_key` header and cache responses in
Redis for 24 hours. If the same key arrives twice, return the cached response
instead of a 409.

Frontend (simpler fix) — in `useSubmitUpdate.onError`, check if
`error.code === "update_already_exists"` and treat it as a success by reading
`error.details.existing_id` and updating the cache:

```typescript
onError: (error) => {
  if (error.code === "update_already_exists" && error.details?.existing_id) {
    // Treat as success — fetch the existing update and add to cache
    queryClient.invalidateQueries(updateKeys.byDate(workspaceId, today));
  }
};
```

**Effort:** Low for frontend-only fix. Medium for full idempotency key pattern.

---

## Issue 6 — Lazy Repo Initialization on Service Instance

**Where:** `apps/api/app/services/update_service.py`

**What:** `UpdateService` caches repo instances as instance attributes
(`_update_repo`, `_profile_repo`). This is safe because the service is
instantiated per-request via FastAPI `Depends`. If the service is ever
refactored into a singleton (e.g. for use in Celery tasks), the cached repos
would hold a stale `AsyncSession`.

```python
# Current — safe only for per-request instantiation
def _get_update_repo(self) -> UpdateRepository:
    if self._update_repo is None:
        self._update_repo = UpdateRepository.from_session(self.db)
    return self._update_repo
```

**Impact:** No current impact. Risk surfaces only if service lifetime changes.

**Fix:** When wiring Celery tasks in Milestone 3, instantiate a fresh
`UpdateService` with a new session per task rather than reusing a singleton:

```python
# In Celery task
async with get_async_session() as db:
    service = UpdateService(db)
    await service.process_update(update_id)
```

**Effort:** Near-zero if the Celery task is written correctly from the start.

---

## Issue 7 — `updated_at` Not Managed at DB Level for Updates

**Where:** `apps/api/app/models/update.py`

**What:** `updated_at` uses `onupdate=func.now()` which is a SQLAlchemy
client-side directive. It fires when SQLAlchemy issues an UPDATE via the ORM.
Raw SQL updates (e.g. from a migration or admin script) will not trigger it,
leaving `updated_at` stale.

**Impact:** Minor. Only matters if you ever update rows outside of SQLAlchemy.

**Fix:** Add a Postgres trigger for true server-side `updated_at` management:

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER updates_updated_at
BEFORE UPDATE ON updates
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

Add this trigger via an Alembic migration using `op.execute()`.

**Effort:** Low — one migration, no application code changes.

---

## Issue 8 — No Rate Limiting on Update Endpoints

**Where:** `apps/api/app/routers/updates.py`

**What:** No rate limiting exists on any update endpoint. A client can hammer
`POST /{workspace_id}/updates` or `PATCH` endpoints without restriction beyond
the unique constraint.

**Impact:** Low for a closed team product. Higher if you open to the public or
add a free tier. The unique constraint prevents duplicate data but doesn't
prevent wasted compute.

**Fix:** Add rate limiting via a Redis-backed middleware or FastAPI dependency.
`slowapi` integrates cleanly with FastAPI:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/{workspace_id}/updates")
@limiter.limit("10/minute")
async def submit_update(...):
    ...
```

**Effort:** Low — library install + decorator per endpoint.

---

## Summary Table

| #   | Issue                       | Impact                   | Fix Milestone | Effort     |
| --- | --------------------------- | ------------------------ | ------------- | ---------- |
| 1   | N+1 profile queries         | Medium (team use)        | Milestone 5   | Low        |
| 2   | Client-controlled date      | Medium (integrity)       | Milestone 3   | Low        |
| 3   | No pagination               | High (history feature)   | Milestone 5   | Medium     |
| 4   | Status stuck at pending     | Low (backfill needed)    | Milestone 3   | Low        |
| 5   | No idempotency on submit    | Low (flaky networks)     | Milestone 3   | Low–Medium |
| 6   | Lazy repo on service        | Low (Celery risk)        | Milestone 3   | Near-zero  |
| 7   | `updated_at` not DB-managed | Low                      | Anytime       | Low        |
| 8   | No rate limiting            | Low (now), High (public) | Pre-launch    | Low        |
