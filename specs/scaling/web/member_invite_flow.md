# SoarUp — Scaling & Technical Debt: Member Management & Invite Flow (Web)

# Path: specs/scaling/web/member_invite_flow.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 5

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the member management and invite flow introduced
in Milestone 5. This covers `MembersPanel`, `useWorkspaceMembers`,
`useInviteMembers`, `invite-page.tsx`, `onboarding-form.tsx`, and the
WebSocket reconnect layer. Items are ordered by expected impact, not urgency.
None of these are blockers for early-stage use.

---

## Issue 1 — Single Workspace Per User (No Multi-Workspace Support)

**Where:** `apps/web/src/hooks/useWorkspace.ts` → `useWorkspace`

**What:** `useWorkspace` fetches `GET /workspaces/` and returns only the
first workspace in the array (`workspaces[0] ?? null`). The UI renders a
single workspace in the sidebar, a single member list in settings, and a
single update feed on the dashboard. A user who accepts an invite to a
second workspace becomes a member in the DB but has no way to switch to
or view that workspace from the UI.

```typescript
// Current — only the first workspace is used
.then((res) => res.data[0] ?? null),
```

**Impact:** Medium — any user who is invited to a second workspace after
creating their own will silently be a member but unable to access it. The
invite acceptance succeeds and the `workspace_members` row is created, but
the frontend ignores all workspaces beyond index 0.

**Fix (post-M9):** Add a workspace switcher to the sidebar that lists all
workspaces the user belongs to. `useWorkspace` becomes `useWorkspaces`
(returning an array) with a selected workspace tracked in Zustand. React
Query cache keys that currently use `workspaceId` stay the same — only
the source of `workspaceId` changes.

**Effort:** Medium — sidebar UI + Zustand workspace selector + React Query
key updates across hooks.

---

## Issue 2 — Resend Domain Not Verified — Invite Emails Limited to Resend Account Owner

**Where:** `apps/api/app/lib/email.py` → `send_invite_email`

**What:** Invite emails are currently sent from `onboarding@resend.dev` —
Resend's shared test address. Emails from this address are only deliverable
to the email address registered on your Resend account. Inviting any other
email address will result in the email being silently dropped by Resend,
even though the invite record is created in the DB and the API returns 201.

```python
# Current — test address, delivery limited to Resend account owner
"from": f"SoarUp <{settings.resend_from_email}>",
# RESEND_FROM_EMAIL defaults to onboarding@resend.dev
```

**Impact:** High for production — the invite email flow is non-functional
for any invitee who is not the Resend account owner. The invite link is
logged to the API at `invite_email_dev_mode` level and can be shared
manually, but this is not a viable production workflow.

**Fix (pre-launch):**

1. Sign up for a Resend account if not already done
2. Add and verify `soarup.app` (or your sending domain) in the Resend
   dashboard under Domains — requires adding DNS TXT/MX records
3. Set `RESEND_FROM_EMAIL=invites@soarup.app` in your production environment
4. The production validator in `config.py` will enforce this is set before
   startup

**Effort:** Near-zero code change. DNS propagation takes 10-30 minutes.

---

## Issue 3 — OAuth Buttons (Google, GitHub) Are Non-Functional Placeholders

**Where:** `apps/web/src/components/domain/auth/oauth-buttons.tsx`

**What:** The Google and GitHub sign-in buttons rendered on the login and
signup pages are UI placeholders. They display correctly but are not wired
to any OAuth flow. Clicking them either does nothing or triggers a stub
handler. No Supabase OAuth provider is configured, no redirect URIs are
set, and no callback route exists.

**Impact:** Medium UX — users who attempt to sign in with Google or GitHub
will encounter a broken or no-op interaction. The buttons create a false
impression of supported functionality.

**Fix (post-M9, after core milestones complete):**

1. Enable Google and GitHub providers in Supabase dashboard →
   Authentication → Providers
2. Configure OAuth app credentials (Google Cloud Console / GitHub OAuth Apps)
   and add the Supabase callback URL as an authorised redirect URI
3. Wire `oauth-buttons.tsx` to `supabase.auth.signInWithOAuth({ provider })`
4. Handle the OAuth callback in a new route `/auth/callback` that reads
   the session from the URL hash and syncs it into the Zustand store via
   `syncSupabaseSession`
5. Integrate with the existing `is_onboarded` check — OAuth users who have
   never completed onboarding need to be routed to `/onboarding`

**Effort:** Medium — Supabase config + callback route + `useAuth` integration

- onboarding gate for OAuth users.

**Priority:** Defer until after Milestone 9 and post-launch critical features
(in-app chat, notifications, etc.) are complete. Core email/password auth is
fully functional for early-stage use.

---

## Issue 4 — Invite Acceptance Requires Second Click for New Users (Two-Step Join)

**Where:** `apps/web/src/components/domain/auth/onboarding-form.tsx`
and `apps/web/src/app/(public)/invite/[code]/page.tsx`

**What:** A brand new user who receives an invite must complete onboarding
before they can join the workspace. The flow is:

1. Click invite link → store code in localStorage → redirect to `/signup`
2. Sign up → `/onboarding` Step 1 (profile) → Step 2 (join with pre-filled code)
3. Join Workspace → `/dashboard`

This is functional but requires the user to navigate through the full
onboarding flow before joining. If the user creates a workspace in Step 2
instead (by switching away from the pre-filled join path), they end up with
their own workspace and the invite code is cleared — they would need to click
the invite link again.

**Impact:** Low for most users — the pre-filled code and locked join path
guide the user correctly. Edge case: user taps "Use a different code" and
then creates a workspace instead.

**Fix (Milestone 6):** After signup and profile completion (Step 1), skip the
workspace Step 2 entirely if a pending invite exists and call `acceptInvite`
automatically before redirecting to `/dashboard`. This collapses the flow to:

1. Click invite link → localStorage → `/signup`
2. Sign up → `/onboarding` Step 1 (profile only, no workspace step)
3. Auto-accept invite → `/dashboard`

**Effort:** Low — modify `handleStep1Complete` to check for pending invite
and call `acceptInvite` directly, then skip `setStep(2)`.

---

## Issue 5 — localStorage Invite Code Not Cleared on Signup Abandonment

**Where:** `apps/web/src/app/(public)/invite/[code]/page.tsx`
→ `storeInviteCode`

**What:** When an unauthenticated user clicks "Sign up to accept", the invite
code is stored in `localStorage` under `soarup_pending_invite`. If the user
abandons the signup flow (closes the tab, navigates away, or dismisses the
browser), the code remains in localStorage indefinitely. On the next visit
to the same browser, `OnboardingForm` will read the stale code and pre-fill
it in Step 2 — even if the invite has since expired or been revoked.

```typescript
// Stored on redirect, never cleared on abandonment
localStorage.setItem(PENDING_INVITE_KEY, code);
```

**Impact:** Low — the stale code will fail at the API level (`invite_not_found`
or `invite_expired`), and the error is displayed to the user in the join form.
It's a minor UX friction point, not a data integrity issue.

**Fix:** Two mitigations:

1. Store a timestamp alongside the code and clear it if older than 7 days
   (matching the invite expiry window):
   ```typescript
   localStorage.setItem(
     PENDING_INVITE_KEY,
     JSON.stringify({ code, storedAt: Date.now() }),
   );
   ```
2. On `OnboardingForm` mount, validate the stored code against the API
   (`GET /invites/{code}`) before pre-filling, and clear it if `is_valid: false`.

**Effort:** Low — timestamp storage + expiry check on read.

---

## Issue 6 — Member List Has No Pagination

**Where:** `apps/web/src/hooks/useWorkspaceMembers.ts` → `useWorkspaceMembers`
and `apps/api/app/routers/members.py` → `list_members`

**What:** `GET /workspaces/{id}/members` returns all members in a single
response with no pagination. `MembersPanel` renders them all in a flat list.
There is no cursor, page number, or limit parameter.

```typescript
// Current — all members fetched and rendered in one request
queryFn: () =>
  apiClient.get<MemberListResponse>(
    `/workspaces/${workspaceId}/members`,
    tokens?.access_token,
  ),
```

**Impact:** Low at current scale — a workspace with 10-50 members is well
within acceptable range for a flat list. At 500+ members the DOM list becomes
unwieldy and the API response grows proportionally.

**Fix (post-M9):** Add `limit` and `cursor` query params to the members
endpoint and implement virtualised rendering in `MembersPanel` using a
library like `@tanstack/react-virtual`.

**Effort:** Medium — pagination on both API and frontend, virtualised list.

---

## Issue 7 — WebSocket `last_event_id` Not Persisted Across Page Reloads

**Where:** `apps/web/src/stores/websocket-store.ts` → `lastEventId`
and `apps/web/src/hooks/useWebSocket.ts`

**What:** `lastEventId` is stored in the Zustand in-memory store but is not
persisted to localStorage. On a full page reload, `lastEventId` resets to
`null` and the WebSocket reconnects with `last_event_id="$"` (new events only),
losing the ability to replay events that arrived during the reload window.
The React Query cache invalidation on reconnect provides a fallback but only
refreshes the updates query — other event types (member joined, etc.) are lost.

```typescript
// Current — in-memory only, lost on reload
lastEventId: null,
setLastEventId: (id) => set({ lastEventId: id }),
```

**Impact:** Low — page reloads are rare in a tab-based app and the React Query
invalidation covers the most critical update status events. Events like
`member.joined` or `member.left` would be missed on reload.

**Fix:** Persist `lastEventId` to `sessionStorage` (not `localStorage` — it
should reset when the browser session ends):

```typescript
// On set
sessionStorage.setItem("soarup_ws_last_event_id", id);

// On connect
const stored = sessionStorage.getItem("soarup_ws_last_event_id");
const cursor = stored ?? "$";
```

**Effort:** Low — two sessionStorage calls.

---

## Issue 8 — Invite Page Not Added to Middleware PROTECTED_ROUTES or AUTH_ROUTES

**Where:** `apps/web/src/middleware.ts`

**What:** The invite acceptance page at `/invite/[code]` is under the `(public)`
route group and is intentionally unprotected. However, the middleware's
`PROTECTED_ROUTES` and `AUTH_ROUTES` arrays do not explicitly account for
`/invite` paths. Currently this is harmless because the middleware's
`isAuthRoute` check only redirects authenticated users away from `/login`,
`/signup` etc. — `/invite` is not in either list so it passes through.

The risk is future middleware changes that add a catch-all protected route
rule accidentally capturing `/invite` paths and breaking the public flow.

**Impact:** None currently. Potential future regression risk.

**Fix:** Add an explicit comment in `middleware.ts` documenting that `/invite`
is intentionally public and must never be added to `PROTECTED_ROUTES`:

```typescript
// PUBLIC_ROUTES — these must never appear in PROTECTED_ROUTES
// /invite/* — invite acceptance page, requires no auth to view
```

**Effort:** Near-zero — documentation only.

---

## Summary Table

| #   | Issue                                                | Impact                            | Fix Milestone | Effort    |
| --- | ---------------------------------------------------- | --------------------------------- | ------------- | --------- |
| 1   | Single workspace per user (no switcher)              | Medium (multi-workspace blocked)  | Post-M9       | Medium    |
| 2   | Resend domain not verified (limited delivery)        | High (production blocker)         | Pre-launch    | Near-zero |
| 3   | OAuth buttons are non-functional placeholders        | Medium (broken UX)                | Post-M9       | Medium    |
| 4   | New users require two-step join via invite           | Low (guided but multi-step)       | Milestone 6   | Low       |
| 5   | localStorage invite code not cleared on abandonment  | Low (stale code UX friction)      | Milestone 6   | Low       |
| 6   | Member list has no pagination                        | Low (fine under 500 members)      | Post-M9       | Medium    |
| 7   | lastEventId not persisted across page reloads        | Low (React Query fallback covers) | Milestone 6   | Low       |
| 8   | Invite route not explicitly documented in middleware | None (future regression risk)     | Immediate     | Near-zero |

---

## Pre-Production Checklist (Web items)

```
[ ] Issue 2:  Verify soarup.app domain in Resend dashboard + set RESEND_FROM_EMAIL
[ ] Issue 8:  Add comment in middleware.ts documenting /invite as intentionally public
[ ] Issue 5:  Add timestamp to localStorage invite code + expiry check on read
[ ] Issue 3:  Wire OAuth buttons after Milestone 9 (Google + GitHub via Supabase)
[ ] Issue 1:  Build workspace switcher when multi-workspace is needed
```
