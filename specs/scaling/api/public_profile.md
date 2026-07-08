# SoarUp — Scaling & Technical Debt: Public Profile Pipeline (API)

# Path: specs/scaling/api/public_profile.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 9

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the public profile pipeline introduced in
Milestone 9. This covers `routers/public_profiles.py`,
`routers/auth.py` (`/check-username`), `services/analytics_service.py`
(`get_public_profile_analytics`), `repositories/analytics_repo.py`
(`get_user_submission_dates_all_workspaces`), `repositories/profile_repo.py`
(`get_by_username`, `is_username_taken`), and `models/profile.py`
(new columns + unique index). Items are ordered by expected impact, not
urgency. None of these are blockers for early-stage use.

---

## Issue 1 — Public Profile Analytics Counts Duplicate Submissions Across Workspaces

**Where:** `apps/api/app/services/analytics_service.py`
→ `get_public_profile_analytics`
and `apps/api/app/repositories/analytics_repo.py`
→ `get_user_submission_dates_all_workspaces`

**What:** `get_user_submission_dates_all_workspaces` returns one row per
update record, not one row per calendar day. A user who submits in two
workspaces on the same day gets that date returned twice. The service counts
each occurrence separately for the heatmap:

```python
date_counts: dict[str, int] = {}
for d in submission_date_strs:
    date_counts[d] = date_counts.get(d, 0) + 1
```

This means a user who is active in 3 workspaces can show a heatmap count
of 3 for a single day, giving the impression of 3 separate units of work
when it is effectively the same working day represented differently.

For streak calculation, `_calculate_streak` deduplicates via a `set`
conversion, so streaks are unaffected. Only the heatmap intensity is inflated.

**Impact:** Low — most users belong to one or two workspaces. The behaviour
is defensible (more workspaces = more active) but may look odd if a user is
a member of many workspaces. `total_submissions` in `StreakResponse` also
counts raw update records rather than unique days, which may mislead users
comparing their count to others.

**Fix (post-M9):** Deduplicate at the repo level using `DISTINCT update_date`
and accept that cross-workspace heatmap counts max out at 1 per day:

```sql
SELECT DISTINCT update_date
FROM updates
WHERE user_id = :user_id
  AND is_deleted = false
  AND update_date >= :from_date
  AND update_date <= :to_date
ORDER BY update_date DESC;
```

Or keep per-workspace counts and cap intensity at the single-workspace
maximum for visual consistency. Document the chosen semantic clearly.

**Effort:** Near-zero — one SQL keyword change or a Python `set` conversion
before counting.

---

## Issue 2 — `get_public_profile_analytics` Has No Caching Layer

**Where:** `apps/api/app/routers/public_profiles.py`
→ `get_public_profile` → `AnalyticsService.get_public_profile_analytics`

**What:** Every request to `GET /api/v1/profiles/:username` triggers a full
analytics computation: one DB query for submission dates across all
workspaces, then Python-side streak calculation and heatmap construction
over up to 364 days of data. This computation runs on every page load,
including link preview crawlers (which may request the page multiple times).

```python
# Current — full analytics recomputed on every request
streak, heatmap = await analytics_service.get_public_profile_analytics(
    user_id=profile.id
)
```

The Next.js server component (`generateMetadata`) also fetches the profile
independently with `revalidate: 300`, meaning the same endpoint may be
hit by both the OG metadata fetch and the client-side React Query fetch
in close succession.

**Impact:** Low at current scale — the DB query hits indexed columns and
completes in < 10ms. At 1000+ daily profile views (e.g. if a user shares
their profile link publicly), the redundant computation adds unnecessary
DB load.

**Fix (post-M9):** Add a Redis cache layer in `get_public_profile_analytics`
with a 5-minute TTL, keyed by `user_id`:

```python
cache_key = f"public_profile_analytics:{user_id}"
cached = await redis.get(cache_key)
if cached:
    return deserialise(cached)

streak, heatmap = compute(...)
await redis.setex(cache_key, 300, serialise(streak, heatmap))
return streak, heatmap
```

Invalidate on update submission (post via Celery task completion).

**Effort:** Low — Redis is already in the stack; add one get/set pair.

---

## Issue 3 — Username Uniqueness Enforced at DB Level But Not Validated at Application Level on Race Condition

**Where:** `apps/api/app/services/auth_service.py` (removed — now in
`profile_service.py`) → `update_profile`
and `apps/api/app/repositories/profile_repo.py` → `is_username_taken`

**What:** Username availability is checked with `is_username_taken()` before
the update is committed. Between the check and the commit, another concurrent
request could claim the same username:

```python
# Check
taken = await repo.is_username_taken(username, exclude_user_id=user_id)
if taken:
    raise ProfileError("username_taken", ...)

# Window of vulnerability — another request could claim "username" here

# Commit
profile.username = username
await db.commit()  # ← unique constraint violation if race occurred
```

The DB-level `UNIQUE` constraint on `profiles.username` will correctly reject
the duplicate and raise an `IntegrityError`, but this error is currently not
caught and mapped to a clean API error — it will surface as a 500.

**Impact:** Low — race conditions on username claims are extremely unlikely
at current user volumes. When they do occur, the user gets a 500 instead of
a clear "username taken" message.

**Fix (post-M9):** Catch `IntegrityError` in `update_profile` and map it
to a `ProfileError("username_taken", ...)`:

```python
from sqlalchemy.exc import IntegrityError

try:
    await db.commit()
except IntegrityError:
    await db.rollback()
    raise ProfileError(
        "username_taken",
        "This username was just claimed. Please choose another.",
    )
```

**Effort:** Near-zero — one try/except block.

---

## Issue 4 — `/check-username` Endpoint Has No Rate Limiting

**Where:** `apps/api/app/routers/auth.py`
→ `GET /auth/check-username`

**What:** The username availability endpoint is fully unauthenticated and
accepts any string as a query parameter. There is no rate limiting, so a
bad actor could enumerate all taken usernames by cycling through a wordlist:

```
GET /api/v1/auth/check-username?username=suyash → available: false
GET /api/v1/auth/check-username?username=john   → available: false
GET /api/v1/auth/check-username?username=xyz    → available: true
```

This leaks the full set of taken usernames to anyone who queries the
endpoint systematically.

**Impact:** Low — usernames are semi-public by design (they appear in
shareable URLs). However, enumerating the full taken set could enable
targeted phishing (e.g. "your username is taken, register here instead").

**Fix (post-M9):** Add IP-based rate limiting at the reverse proxy or
FastAPI middleware level. A reasonable limit is 30 requests per minute per
IP. Also consider adding a minimum 3-character validation at the router
level (currently only validated by `validate_username` which returns 200
with `available=false` for invalid formats, adding unnecessary DB round trips
for clearly invalid inputs).

**Effort:** Low — middleware-level rate limiting; no schema changes needed.

---

## Issue 5 — Public Profile OG Metadata Fetch is Not Deduplicated With Client Fetch

**Where:** `apps/web/src/app/u/[username]/page.tsx`
→ `generateMetadata`

**What:** When a user visits `/u/:username`, two separate requests hit
`GET /api/v1/profiles/:username`:

1. `generateMetadata` runs server-side during SSR and fetches the profile
   with `next: { revalidate: 300 }` for OG tag generation.
2. `PublicProfileClient` mounts and `usePublicProfile` fires a client-side
   React Query fetch for the same profile data.

These are independent fetches — Next.js ISR cache and React Query cache do
not share state. The profile endpoint is therefore hit twice per page view
on cold cache, and the analytics computation runs twice.

**Impact:** Low — two lightweight DB reads per page view is negligible.
At scale with high-traffic profiles, this doubles the effective request rate
on the public profile endpoint.

**Fix (post-M9):** Pass the server-fetched profile data as a prop from
`PublicProfilePage` to `PublicProfileClient` and use it to pre-populate the
React Query cache via `initialData`. This eliminates the client-side fetch
on first render:

```typescript
// page.tsx — pass profile as prop
export default async function PublicProfilePage({ params }: Props) {
  const profile = await fetchProfile(params.username);
  return <PublicProfileClient username={params.username} initialData={profile} />;
}

// client.tsx — use initialData to skip the client fetch
const { data: profile } = usePublicProfile(username, {
  initialData: props.initialData,
});
```

**Effort:** Low — prop threading + `initialData` option in React Query.

---

## Issue 6 — `get_user_submission_dates_all_workspaces` Has No Workspace Membership Guard

**Where:** `apps/api/app/repositories/analytics_repo.py`
→ `get_user_submission_dates_all_workspaces`

**What:** The repo method queries all updates for a `user_id` across all
workspaces with no validation that the user is still an active member of
those workspaces. If a user is removed from a workspace, their historical
updates in that workspace still count toward their public profile heatmap
and streak.

```python
# Current — no workspace membership filter
result = await self.db.execute(
    select(Update.update_date)
    .where(
        and_(
            Update.user_id == user_id,
            Update.is_deleted == False,
            Update.update_date >= from_date.isoformat(),
            Update.update_date <= to_date.isoformat(),
        )
    )
)
```

**Impact:** Low and arguably correct — historical work done while a member
of a workspace is legitimate activity and should count toward a user's public
record. This is only a problem if workspaces contain sensitive or private
standup data that should not be surfaced publicly after a user is removed.

**Fix (post-M9):** If the decision is made that removed members' data should
not appear publicly, add a `JOIN workspace_members` filter:

```sql
JOIN workspace_members wm
  ON wm.workspace_id = updates.workspace_id
  AND wm.user_id = updates.user_id
  AND wm.is_active = true
```

Or add a `profile_public` override that resets to `false` when a user is
removed from all workspaces.

**Effort:** Low — one JOIN clause; depends on policy decision.

---

## Summary Table

| #   | Issue                                                  | Impact                                       | Fix Milestone | Effort    |
| --- | ------------------------------------------------------ | -------------------------------------------- | ------------- | --------- |
| 1   | Heatmap counts duplicate submissions across workspaces | Low (inflated counts, streaks unaffected)    | Post-M9       | Near-zero |
| 2   | Public profile analytics has no caching layer          | Low (redundant computation at scale)         | Post-M9       | Low       |
| 3   | Race condition on username claim surfaces as 500       | Low (unlikely at current scale)              | Post-M9       | Near-zero |
| 4   | `/check-username` has no rate limiting                 | Low (username enumeration possible)          | Post-M9       | Low       |
| 5   | OG metadata fetch not deduplicated with client fetch   | Low (double DB read per cold page view)      | Post-M9       | Low       |
| 6   | All-workspaces query includes removed member history   | Low (policy decision, defensible either way) | Post-M9       | Low       |

---

## Pre-Production Checklist (API — Public Profile)

```
[ ] Issue 3:  Catch IntegrityError on username commit → map to ProfileError
[ ] Issue 4:  Add rate limiting to /check-username endpoint
[ ] Issue 1:  Decide on duplicate-day semantics → DISTINCT or keep counts
[ ] Issue 2:  Add Redis cache to get_public_profile_analytics (5-min TTL)
[ ] Issue 5:  Pass server-fetched profile as initialData to client component
[ ] Issue 6:  Decide on removed-member history policy → add JOIN if needed
```
