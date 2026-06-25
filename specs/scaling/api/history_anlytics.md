# SoarUp — Scaling & Technical Debt: History & Analytics Pipeline (API)

# Path: specs/scaling/api/history_analytics.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 7

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the history and analytics pipeline introduced in
Milestone 7. This covers `routers/updates.py` (history endpoint),
`routers/analytics.py`, `services/analytics_service.py`,
`repositories/analytics_repo.py`, `repositories/update_repo.py`
(paginated query), and `models/update.py` / `models/digest.py` (new indexes).
Items are ordered by expected impact, not urgency. None of these are blockers
for early-stage use.

---

## Issue 1 — Team Analytics Makes 2N Queries Per Request (One Per Member)

**Where:** `apps/api/app/services/analytics_service.py`
→ `get_team_analytics`

**What:** For each workspace member, `get_team_analytics` fires two separate
database queries: one `get_user_submission_dates` for streak calculation and
one `get_member_submission_counts` for the 14-day sparkline. A workspace
with 20 members produces 40 sequential async queries per team analytics
request.

```python
# Current — 2 queries per member, executed sequentially
for member, profile in members_with_profiles:
    submission_dates = await analytics_repo.get_user_submission_dates(...)
    sparkline_counts = await analytics_repo.get_member_submission_counts(...)
```

**Impact:** Low at current scale — small teams (< 10 members) produce
< 20 queries, each hitting indexed columns and completing in < 5ms. At
50+ members, total query time approaches 500ms+, making the endpoint
noticeably slow.

**Fix (post-M9):** Replace per-member queries with two workspace-scoped
`GROUP BY user_id` queries that fetch all member data in one round trip:

```sql
-- All submission dates for all members in one query
SELECT user_id, update_date
FROM updates
WHERE workspace_id = :ws AND update_date >= :from AND is_deleted = false
ORDER BY user_id, update_date DESC;

-- All sparkline counts in one query
SELECT user_id, update_date, COUNT(*) as count
FROM updates
WHERE workspace_id = :ws AND update_date >= :fourteen_days_ago AND is_deleted = false
GROUP BY user_id, update_date;
```

Streak calculation then runs in Python over the pre-fetched result set
rather than per-member DB round trips.

**Effort:** Medium — new batch repo methods + restructured service loop.

---

## Issue 2 — `_calculate_streak` Cannot Be Tested Deterministically

**Where:** `apps/api/app/services/analytics_service.py`
→ `_calculate_streak`

**What:** `_calculate_streak` calls `datetime.now(UTC)` internally to
determine today's date. This makes the Saturday-does-not-break-streak edge
case impossible to test deterministically — patching `datetime` at the
module level does not affect the already-bound reference inside the function.

```python
# Current — today resolved internally, cannot be pinned in tests
def _calculate_streak(submission_date_strs, digest_days):
    today = datetime.now(UTC).date()  # ← untestable without refactor
    ...
```

The Saturday edge case test was removed from the test suite with a deferred
note for this reason.

**Fix:** Accept `today` as an optional parameter with a default of `None`,
resolved to `datetime.now(UTC).date()` inside the function:

```python
def _calculate_streak(
    submission_date_strs: list[str],
    digest_days: list[int] | None,
    today: date | None = None,
) -> tuple[int, int]:
    _today = today or datetime.now(UTC).date()
    ...
```

All internal calls pass `today=None` (no behaviour change). Tests pin
`today` explicitly:

```python
current, best = _calculate_streak(dates, [1,2,3,4,5], today=date(2026, 6, 21))
```

**Effort:** Near-zero — one parameter addition + update test.

---

## Issue 3 — Analytics Data Has No Invalidation After Update Submission

**Where:** `apps/api/app/routers/analytics.py`
and `apps/web/src/hooks/useAnalytics.ts`

**What:** Personal and team analytics are cached with a 5-minute stale time
on the frontend. When a user submits an update and immediately views their
analytics tab, they will see stale streak and heatmap data for up to 5
minutes. There is no cache invalidation triggered by update submission on
either the frontend or backend.

**Impact:** Low — analytics are a reflection tool, not a real-time feed.
A 5-minute delay between submission and analytics update is acceptable for
async standups. Documented as a known tradeoff in `useAnalytics.ts`.

**Fix (post-M9):** Invalidate `analyticsKeys.personal(workspaceId)` in the
`onSuccess` handler of `useSubmitUpdate`:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: updateKeys.byDate(...) });
  queryClient.invalidateQueries({ queryKey: analyticsKeys.personal(workspaceId) });
},
```

On the backend, no change needed — analytics are computed fresh on each
request.

**Effort:** Near-zero — one additional `invalidateQueries` call in
`useSubmitUpdate`.

---

## Issue 4 — Heatmap Covers Fixed 52-Week Window Regardless of Account Age

**Where:** `apps/api/app/services/analytics_service.py`
→ `get_personal_analytics`

**What:** The personal heatmap always queries the trailing 52 weeks
(364 days), regardless of when the user joined the workspace. A user who
joined 2 weeks ago receives a heatmap response with 350 empty days, wasting
both query time and response payload size.

```python
# Current — always 52 weeks regardless of join date
heatmap_start = today - timedelta(weeks=52)
submission_date_strs = await analytics_repo.get_user_submission_dates(
    workspace_id=workspace_id,
    user_id=user_id,
    from_date=heatmap_start,
    to_date=today,
)
```

**Impact:** Low — the query hits an indexed column and the empty days are
filled in Python without additional DB calls. Response payload is ~10KB
of JSON for 364 days, acceptable on all connection types.

**Fix (post-M9):** Fetch the user's `joined_at` date from
`workspace_members` and use `max(joined_at, today - 52w)` as `from_date`.
Cap at 52 weeks to prevent excessive historical queries for very long-tenured
members.

**Effort:** Low — one additional repo call + `max` comparison.

---

## Issue 5 — Cursor Pagination Cursor is the Raw Update ID (Opaque by Convention Only)

**Where:** `apps/api/app/repositories/update_repo.py`
→ `get_workspace_updates_paginated`

**What:** The pagination cursor is the raw `update.id` (a UUID string)
returned directly to the client as `next_cursor`. This leaks the internal
primary key format to API consumers and makes it trivially easy for clients
to construct arbitrary cursors.

```python
# Current — raw UUID exposed as cursor
next_cursor = updates[-1].id
```

While not a security vulnerability (the endpoint is scoped to workspace
members and the cursor only controls pagination position), leaking PKs is
generally poor API hygiene.

**Impact:** None functional — workspace membership scoping prevents any
meaningful misuse of a guessed cursor. Cosmetic API hygiene issue.

**Fix (post-M9):** Base64-encode the cursor before returning it and decode
it on receipt:

```python
import base64

def _encode_cursor(update_id: str) -> str:
    return base64.b64encode(update_id.encode()).decode()

def _decode_cursor(cursor: str) -> str:
    return base64.b64decode(cursor.encode()).decode()
```

**Effort:** Near-zero — two utility functions + encode on return + decode
on receipt.

---

## Issue 6 — No Pagination on Team Analytics Member List

**Where:** `apps/api/app/services/analytics_service.py`
→ `get_team_analytics`
and `apps/api/app/routers/analytics.py`
→ `get_team_analytics`

**What:** `get_team_analytics` returns all workspace members in a single
response with no pagination. A workspace with 200 members produces a single
JSON response containing 200 `MemberParticipationRow` objects, each with a
14-element sparkline array, plus the workspace heatmap. At 200 members this
is approximately 80-120KB of JSON.

**Impact:** Low at current scale — workspaces with 50+ members are unlikely
at early stage. At 200+ members, the response size and the N+1 query problem
(Issue 1) compound to produce a slow, large response.

**Fix (post-M9):** Add `limit` and `cursor` params to the team analytics
endpoint, returning a paginated member list sorted by `participation_rate_30d`
descending. The aggregate stats (participation rate, avg updates/day,
workspace heatmap) remain unpaginated — only the member table is paged.

**Effort:** Medium — new pagination logic in service + frontend table
pagination UI.

---

## Issue 7 — Streak Calculation Walks Up to 730 Days Even for Short Streaks

**Where:** `apps/api/app/services/analytics_service.py`
→ `_calculate_streak`

**What:** `_calculate_streak` has a safety cap of 730 iterations (2 years)
and always walks backward through all 730 days to find the `best_streak`,
even if the user joined 2 weeks ago or the current streak is 3 days.

```python
# Current — always iterates up to 730 days
max_lookback = 730
while days_walked < max_lookback:
    ...
```

The early-exit condition only triggers if `current_streak_locked` is True
AND `temp_streak` resets — but `best_streak` tracking requires walking the
full history to find past streaks that may exceed the current one.

**Impact:** None visible — Python iterates 730 date comparisons in < 1ms.
This is a code clarity issue, not a performance one.

**Fix:** Pass the actual submission date list length as the upper bound
instead of a fixed 730:

```python
max_lookback = min(730, len(submission_date_strs) + 14)
# +14 accounts for non-digest days (weekends) in a 2-week window
```

**Effort:** Near-zero — one `min` call.

---

## Summary Table

| #   | Issue                                                        | Impact                                | Fix Milestone | Effort    |
| --- | ------------------------------------------------------------ | ------------------------------------- | ------------- | --------- |
| 1   | Team analytics makes 2N queries per request (one per member) | Low (slow at 50+ members)             | Post-M9       | Medium    |
| 2   | `_calculate_streak` not testable without refactor            | Low (one test case missing)           | Post-M9       | Near-zero |
| 3   | Analytics not invalidated after update submission            | Low (5-min stale window documented)   | Post-M9       | Near-zero |
| 4   | Heatmap always queries 52 weeks regardless of join date      | Low (acceptable payload + query time) | Post-M9       | Low       |
| 5   | Cursor is raw UUID (opaque by convention only)               | None (API hygiene only)               | Post-M9       | Near-zero |
| 6   | Team analytics member list has no pagination                 | Low (large response at 200+ members)  | Post-M9       | Medium    |
| 7   | Streak walks 730 days regardless of actual history           | None (< 1ms in Python)                | Post-M9       | Near-zero |

---

## Pre-Production Checklist (API — History & Analytics)

```
[ ] Issue 2:  Add `today` parameter to `_calculate_streak` + restore Saturday test
[ ] Issue 3:  Invalidate analyticsKeys.personal on update submission
[ ] Issue 1:  Replace per-member queries with two GROUP BY workspace queries
[ ] Issue 4:  Use member join date as heatmap lower bound
[ ] Issue 6:  Add pagination to team analytics member list
[ ] Issue 5:  Base64-encode cursor before returning to client
[ ] Issue 7:  Cap streak lookback at len(submission_dates) + 14
```
