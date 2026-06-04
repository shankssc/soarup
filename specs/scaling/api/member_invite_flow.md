# SoarUp — Scaling & Technical Debt: Member Management & Invite Flow (API)

# Path: specs/scaling/api/member_invite_flow.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 5

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the member management and invite flow introduced
in Milestone 5. This covers `routers/members.py`, `routers/invites.py`,
`services/invite_service.py`, `repositories/invite_repo.py`, `lib/email.py`,
`lib/events.py` (Redis Streams migration), and `services/update_service.py`
(N+1 fix). Items are ordered by expected impact, not urgency. None of these
are blockers for early-stage use.

---

## Issue 1 — Invite Creation Open to Any Workspace Member (Not Admin-Only)

**Where:** `apps/api/app/routers/invites.py` → `create_invite`

**What:** `POST /workspaces/{id}/invites` is protected by `OnboardedDep`
(any authenticated, onboarded user) rather than `WorkspaceAdminDep`. Any
workspace member can send an invite to any email address, regardless of their
role. This was a deliberate M5 tradeoff to ship quickly.

```python
# Current — any member can invite
async def create_invite(
    ...
    user_ctx: OnboardedDep,  # ← should be WorkspaceAdminDep
    ...
```

**Impact:** Low at current scale with trusted teams. In a multi-tenant
production environment, a rogue member could spam invites on behalf of a
workspace they belong to, using the workspace owner's Resend quota and
potentially harassing recipients.

**Fix:** Swap `OnboardedDep` → `WorkspaceAdminDep` on the `create_invite`
endpoint. This is a one-line change already documented in the router:

```python
user_ctx: WorkspaceAdminDep,  # tighten from OnboardedDep when ready
```

**Effort:** Near-zero — one dependency alias change.

---

## Issue 2 — No Pre-Check for "Already a Member" Before Sending Invite Email

**Where:** `apps/api/app/services/invite_service.py` → `create_invite`

**What:** `Profile` does not store an `email` column (only
`email_notifications: bool`). Because of this, `create_invite` cannot check
whether the invitee email belongs to an existing workspace member before
creating the invite record and sending the email. The "already a member"
guard only fires at acceptance time, after the email has been delivered.

```python
# Intentionally absent — Profile has no email column
# get_member_by_email not implemented — see workspace_repo.py
```

**Impact:** Low UX — an admin who accidentally invites a current member will
get a 409 at acceptance time. The member receives an unnecessary email. No
data integrity issue.

**Fix options:**
Option A — Add an `email` column to the `Profile` model (requires migration)
and implement `get_member_by_email` in `WorkspaceRepository`. This enables
the pre-check at invite creation time.

Option B — Accept the current behaviour and surface a clearer error message
at acceptance time ("This person is already a member of your workspace").

**Recommendation:** Option B immediately (already implemented). Option A
when the profile model is next touched for other reasons.

**Effort:** Near-zero for Option B. Low for Option A (one column + migration).

---

## Issue 3 — Resend `client.emails.send` Is Synchronous in an Async Context

**Where:** `apps/api/app/lib/email.py` → `send_invite_email`

**What:** The Resend Python SDK's `resend.Emails.send()` is a synchronous
blocking call. It is called directly inside an `async` function without
`asyncio.to_thread` wrapping. This blocks the FastAPI event loop for the
duration of the HTTP request to Resend's API (typically 100-500ms).

```python
# Current — blocking call in async context
resend.Emails.send(params)
```

**Impact:** Low at current scale — invite sends are infrequent and the
block duration is short. Under concurrent load (multiple invites sent
simultaneously), this could cause observable latency on other requests
sharing the same event loop.

**Fix:** Wrap the Resend call with `asyncio.to_thread`:

```python
import asyncio
await asyncio.to_thread(resend.Emails.send, params)
```

**Effort:** Near-zero — one line change.

---

## Issue 4 — Redis Streams Not Trimmed Per-Workspace on Inactivity

**Where:** `apps/api/app/lib/events.py` → `append_event`

**What:** Redis Streams are trimmed to `MAXLEN=1000` entries per workspace
using approximate trimming (`~` operator). This works correctly for active
workspaces but has no time-based expiry. An inactive workspace that had
1000 events and then goes dormant for months will retain those 1000 entries
in Redis memory indefinitely until a new event triggers the next trim.

```python
# Current — count-based trim only, no TTL
entry_id: str = await redis.xadd(
    _stream_key(workspace_id),
    {"data": json.dumps(envelope)},
    maxlen=STREAM_MAXLEN,
    approximate=True,
)
```

**Impact:** Low at current scale — 1000 JSON entries per workspace is
approximately 500KB-1MB. With 100 dormant workspaces, that's 50-100MB.
Not significant early on but grows linearly with workspace count.

**Fix:** Add a Redis key TTL on the stream key after each `xadd`. The stream
key is reset to a 30-day expiry on every new event, so active workspaces
never expire and dormant ones are cleaned up:

```python
await redis.expire(_stream_key(workspace_id), 30 * 24 * 60 * 60)  # 30 days
```

**Effort:** Near-zero — one `redis.expire` call after `xadd`.

---

## Issue 5 — WebSocket Per-Connection Redis Client Not Pooled

**Where:** `apps/api/app/routers/websockets.py` → `_get_redis`

**What:** Each WebSocket connection creates a dedicated Redis client via
`Redis.from_url(...)`. This is intentional (blocking `xread` calls hold
the connection open and would starve a shared pool), but it means each
concurrent WebSocket connection consumes one Redis TCP connection. With
100 concurrent WebSocket connections, that's 100 Redis connections.

```python
# Current — one Redis connection per WebSocket
def _get_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)
```

**Impact:** Low — Redis supports thousands of concurrent connections by
default. At early scale (< 100 concurrent users) this is not an issue.
At 1000+ concurrent WebSocket connections, Redis connection count becomes
a concern.

**Fix (post-M9):** Use a Redis connection pool with a max size configured
to the expected concurrent WebSocket count. Alternatively, migrate to
Server-Sent Events (SSE) which can share a single Redis pubsub connection
across many clients via asyncio broadcast.

**Effort:** Medium — requires rethinking the xread blocking model.

---

## Issue 6 — `broadcaster` Package Still in Requirements After Pub/Sub Migration

**Where:** `apps/api/requirements.txt` or `pyproject.toml`

**What:** `broadcaster[redis]` was the pub/sub dependency used before the
Redis Streams migration in Milestone 5. It was deliberately left in
requirements during the transition to confirm Streams was working correctly
before removal. It is no longer imported or used anywhere in the codebase.

**Impact:** None functional — dead dependency adds minor image bloat and
a potential attack surface for unused code.

**Fix:** Remove `broadcaster[redis]` from `pyproject.toml` dependencies
and rebuild the Docker image:

```toml
# Remove this line
"broadcaster[redis]>=0.3.0",
```

**Effort:** Near-zero.

---

## Issue 7 — Invite Accept Endpoint Uses `AuthDep` (Onboarding Gate Bypassed)

**Where:** `apps/api/app/routers/invites.py` → `accept_invite`

**What:** `POST /invites/{code}/accept` was changed from `OnboardedDep` to
`AuthDep` in Milestone 5 to allow invite acceptance before onboarding is
complete (required for the invite-during-signup flow). This means a user
who has never completed onboarding can accept an invite and become a workspace
member without a `Profile` record that has `is_onboarded=true`.

```python
# Current — bypasses onboarding check
user_ctx: AuthDep,  # was OnboardedDep — changed for invite flow
```

**Impact:** Low — the frontend forces all users through onboarding before
they can access any app route. The only path to accept an invite without
completing onboarding is via the API directly (e.g. via Swagger/curl).
In practice, legitimate users always complete onboarding via the UI.

**Fix:** No code change needed. Document this as an intentional design
decision. If API-level abuse becomes a concern, add a check in
`InviteService.accept_invite` that verifies the profile exists (even if
`is_onboarded=False`) rather than relying solely on the JWT.

**Effort:** Near-zero — documentation only.

---

## Issue 8 — Role Change Restricted to Owner But No Ownership Transfer

**Where:** `apps/api/app/routers/members.py` → `update_member_role`

**What:** Only the workspace owner can change member roles (`WorkspaceOwnerDep`).
However, there is no endpoint to transfer ownership — the `owner` role
cannot be assigned to another member via the role change endpoint (blocked
by the `role == "owner"` guard on the target). If the owner leaves or
their account needs to be changed, there is no mechanism to promote another
member to owner.

```python
# Current — owner role cannot be changed, no transfer mechanism
if target_member.role == "owner":
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="The owner role cannot be changed via this endpoint.",
    )
```

**Impact:** Low at early stage with small teams. Becomes a support problem
when workspace owners leave organisations or become inactive.

**Fix (Milestone 6):** Add a `POST /workspaces/{id}/transfer-ownership`
endpoint that atomically changes the current owner's role to `admin` and
the target member's role to `owner`. Requires `WorkspaceOwnerDep`.

**Effort:** Low — one new endpoint + two role updates in a transaction.

---

## Issue 9 — `get_workspace_members_with_profiles` JOIN Silently Drops Members Without Profiles

**Where:** `apps/api/app/repositories/workspace_repo.py`
→ `get_workspace_members_with_profiles`

**What:** The query uses an `INNER JOIN` between `workspace_members` and
`profiles`. If a `WorkspaceMember` row exists for a user who has no
corresponding `Profile` row (e.g. a profile creation failure during signup,
or manual DB manipulation), that member is silently excluded from the results.
The member list will be incomplete without any error or warning.

```python
# Current — INNER JOIN silently drops members without profiles
select(WorkspaceMember, Profile)
.join(Profile, WorkspaceMember.user_id == Profile.id)
```

**Impact:** Low — profile creation is idempotent and failures are logged.
In normal operation every `WorkspaceMember` has a corresponding `Profile`.
Only edge cases (signup failures, data corruption) would trigger this.

**Fix:** Change to `LEFT OUTER JOIN` and handle `None` profiles gracefully:

```python
select(WorkspaceMember, Profile)
.outerjoin(Profile, WorkspaceMember.user_id == Profile.id)
```

The `MembersPanel` frontend already handles `profile=None` with null
`full_name` and `avatar_url`, so no frontend change is needed.

**Effort:** Near-zero — one keyword change in the query.

---

## Issue 10 — Pending Invite List Not Scoped by Expiry on the Frontend

**Where:** `apps/web/src/hooks/useInviteMembers.ts` → `usePendingInvites`
and `apps/api/app/repositories/invite_repo.py` → `get_pending_by_workspace`

**What:** `get_pending_by_workspace` correctly filters to non-expired,
non-used invites via `expires_at > now()`. However, the React Query cache
has a `staleTime: 30 * 1000` (30 seconds). If an admin opens the pending
invites list and leaves it open for more than 7 days (the invite TTL),
the cached list will show expired invites as still pending until the next
refetch. In practice, browser sessions don't last 7 days, so this is a
non-issue.

**Impact:** None in practice.

**Fix:** Document as expected behaviour. No code change needed.

**Effort:** Near-zero — documentation only.

---

## Summary Table

| #   | Issue                                              | Impact                              | Fix Milestone | Effort    |
| --- | -------------------------------------------------- | ----------------------------------- | ------------- | --------- |
| 1   | Invite creation open to any member (not admin)     | Low (trusted teams only)            | Milestone 6   | Near-zero |
| 2   | No pre-check for already-a-member before invite    | Low (UX friction at acceptance)     | Milestone 6   | Low       |
| 3   | Resend send is synchronous in async context        | Low (short block, infrequent)       | Immediate     | Near-zero |
| 4   | Redis Streams not trimmed on inactivity (no TTL)   | Low (grows with dormant workspaces) | Milestone 6   | Near-zero |
| 5   | Per-connection Redis client not pooled             | Low (fine under 100 concurrent WS)  | Post-M9       | Medium    |
| 6   | broadcaster package still in requirements          | None (dead dependency)              | Immediate     | Near-zero |
| 7   | accept_invite uses AuthDep (onboarding bypassed)   | Low (frontend enforces onboarding)  | Document only | Near-zero |
| 8   | No ownership transfer mechanism                    | Low (support issue at scale)        | Milestone 6   | Low       |
| 9   | INNER JOIN silently drops members without profiles | Low (only on data corruption)       | Immediate     | Near-zero |
| 10  | Pending invite list not live-updated on expiry     | None in practice                    | Document only | Near-zero |

---

## Pre-Production Checklist (API items)

```
[ ] Issue 6:  Remove broadcaster[redis] from pyproject.toml
[ ] Issue 9:  Change INNER JOIN to LEFT OUTER JOIN in get_workspace_members_with_profiles
[ ] Issue 3:  Wrap resend.Emails.send with asyncio.to_thread
[ ] Issue 4:  Add redis.expire call after xadd in append_event
[ ] Issue 1:  Tighten create_invite to WorkspaceAdminDep
[ ] Issue 8:  Add POST /workspaces/{id}/transfer-ownership endpoint
```
