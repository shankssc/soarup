# SoarUp — Milestone 5: Team Features

# Branch: feature/milestone-5

# Merges into: develop

# Prerequisites: feature/milestone-4 merged to develop ✅

# Status: COMPLETE ✅

# Last updated: June 2026

---

## What This Milestone Delivers

### ✅ Delivered

1. **Invite flow** — Any workspace member can invite teammates via email.
   Resend delivers the invite; recipient signs up or logs in and joins the
   workspace via the `/invite/:code` acceptance page.
2. **Member management** — View member list with profiles, remove members
   (admin+), change roles (owner only).
3. **Role-based access control** — `require_workspace_role` dependency factory
   with `WorkspaceMemberDep`, `WorkspaceAdminDep`, `WorkspaceOwnerDep` aliases.
4. **N+1 profile query fixed** — `get_workspace_updates` now uses a single
   batch IN query via `get_profiles_for_updates` replacing per-update lookups.
5. **Redis Streams migration** — `lib/events.py` migrated from
   `redis.publish` to `redis.xadd`/`xread`. WebSocket reconnect passes
   `last_event_id` to resume from last confirmed delivery. `broadcaster`
   lifecycle hooks removed from `main.py`.
6. **Invite expiry** — 7-day TTL, single-use, revocable by admin.
7. **Invite acceptance page** — Public `(public)` route group, handles
   unauthenticated/authenticated states, email mismatch warning, already-a-member
   state, localStorage persistence for new user signup flow.
8. **Onboarding invite integration** — New users arriving via invite have
   the code stored in localStorage, onboarding Step 2 auto-switches to
   join path and pre-fills the code.
9. **`is_onboarded` fix** — `PATCH /auth/profile` now called with
   `is_onboarded: true` in onboarding Step 1 (profile), ensuring the DB
   flag is set before Step 2 (workspace), which fixed `OnboardedDep`
   failures on `accept_invite`.
10. **Settings → Members page** — `/settings/members` with invite form,
    member list, pending invites, role dropdowns (owner), remove buttons.
    Sidebar Settings link points to `/settings/members` with `activePrefix`
    for highlighting.
11. **`login-form.tsx` `?next=` redirect** — Post-login redirect honours
    `?next=` query param set by middleware and invite page.
12. **Resend integration** — Environment-aware email sending. No API key →
    `invite_email_dev_mode` logs URL. API key present → sends via
    `RESEND_FROM_EMAIL` (defaults to `onboarding@resend.dev` for local dev).
13. **Backend tests** — `test_rbac.py`, `test_member_router.py` (integration),
    `test_invite_repo.py`, `test_invite_service.py`, `test_invite_router.py`
    (integration), `test_events.py`, `test_update_service_batch.py`.
14. **Frontend tests** — `useWorkspaceMembers.test.ts`, `useInviteMembers.test.ts`,
    `MembersPanel.test.tsx` per M5 frontend testing spec.
15. **Storybook stories** — `MembersPanel.stories.tsx` (domain),
    `MembersSettingsPage.stories.tsx` (page), `InvitePage.stories.tsx` (page).

### ⚠️ Partially Delivered

16. **`accept_invite` uses `AuthDep` not `OnboardedDep`** — Changed from
    `OnboardedDep` to `AuthDep` to allow acceptance before onboarding
    completes (required for new user invite flow). Documented as intentional
    tradeoff — see Known Tradeoffs section.

### ❌ Deferred to Milestone 6

17. **Team dashboard pending section** — `PendingMembersRow` component and
    the multi-member dashboard view showing who hasn't submitted yet.
    Backend delivers all members' updates correctly; frontend dashboard
    view not yet updated to show pending members section.
18. **`member.update_submitted` WebSocket event** — Event type defined in
    `EVENT_TYPES` but not yet published from `UpdateService.submit_update`.
    Frontend `useDashboardUpdates` handler for this event also deferred.
19. **Profile settings page** — `/settings/profile` with display name,
    timezone, and avatar upload. `useUpdateProfile`, `useUploadAvatar`,
    `useDeleteAvatar` hooks deferred. Avatar upload endpoint already exists
    from M1 but the settings UI was not built.
20. **Workspace member count in sidebar** — Not implemented.
21. **`PATCH /workspaces/:id/prompts` owner gate** — Was planned to apply
    `WorkspaceOwnerDep` to the workspace prompt config endpoint but was not
    explicitly verified as applied this milestone.

---

## Branch Strategy

```
develop
└── feature/milestone-5                         ✅ complete
    ├── feature/milestone-5-member-management   ✅ merged
    ├── feature/milestone-5-invite-flow         ✅ merged
    ├── feature/milestone-5-websocket-fanout    ✅ merged
    └── feature/milestone-5-team-dashboard      ✅ merged (partial — see deferred above)
```

---

## Actual Implementation Notes

### Backend

#### `app/api/rbac.py` — RBAC Dependency Factory

- `require_workspace_role(required_role)` returns an async checker that
  reads `workspace_id` from path params, calls `WorkspaceRepository.get_member`,
  and enforces role hierarchy `owner > admin > member`.
- Returns enriched `user_ctx` dict with `workspace_role` key.
- `WorkspaceMemberDep`, `WorkspaceAdminDep`, `WorkspaceOwnerDep` type aliases.
- **Limitation:** Only works on routes with `{workspace_id}` path parameter.

#### `app/models/invite.py` — WorkspaceInvite

- `code` is `secrets.token_urlsafe(24)` — URL-safe, 32 chars.
- Lifecycle: `PENDING` → `USED` (accepted) or `REVOKED` (is_used=True, used_at=None).
- Migration: `c246201ec040_add_workspace_invites_table.py`
  (note: `ece9056e024c` was an empty migration due to missing model import
  in `env.py` — fixed by adding `from app.models.invite import WorkspaceInvite`
  to `alembic/env.py`).

#### `app/lib/events.py` — Redis Streams

- `append_event(redis, event_type, workspace_id, payload)` replaces
  `publish_event` — uses `xadd` with `MAXLEN=1000, approximate=True`.
- `read_events(redis, workspace_id, last_event_id="$")` — blocking `xread`
  with 5s timeout, returns decoded envelope list.
- `event_id` in the envelope is overwritten with the Redis stream entry ID
  in `read_events` so clients can use it for reconnect resume.
- Celery task files reference `append_event` — patch targets in worker
  tests updated from `publish_event` → `append_event`.

#### `app/lib/email.py` — Resend Integration

- Uses module-level API style (`resend.api_key = ...`, `resend.Emails.send(params)`)
  matching the official Resend Python SDK docs — not the `resend.Resend()`
  class constructor (which does not exist in the SDK).
- `RESEND_FROM_EMAIL` setting in `config.py` controls the from address.
  Defaults to `onboarding@resend.dev` for local dev.
  Production validator rejects `resend.dev` domain when `environment=production`.
- Non-fatal: send failures logged, function returns `False`, invite record
  already created in DB.

#### `app/config.py` additions

- `app_base_url: str` — used to construct invite links. Defaults to
  `http://localhost:3000`. Production validator rejects `localhost`.
- `resend_from_email: str` — from address. Defaults to `onboarding@resend.dev`.
  Production validator rejects `resend.dev`.
- `RESEND_API_KEY` must be set in the container environment (not just `.env`)
  to be picked up — root cause was `environment:` block in `docker-compose.yml`
  overriding `env_file` values with empty `${RESEND_API_KEY:-}` expansion.
  Fixed by removing optional keys from `environment:` block and relying on
  `env_file` alone.

#### `accept_invite` endpoint — `AuthDep` not `OnboardedDep`

Changed to `AuthDep` during M5 to allow new users to accept invites as
part of the onboarding flow. New users complete profile setup (Step 1),
which sets `is_onboarded=true` in the DB via `PATCH /auth/profile`, before
proceeding to workspace join (Step 2) which calls `accept_invite`.
The onboarding gate is enforced by the frontend (`AppShell`) rather than
at the API level for this endpoint.

### Frontend

#### Route architecture

- `(public)` route group added at `app/(public)/` with minimal layout.
  No auth guard — invite page lives here.
- `(app)` layout passes through `AppShell` which has client-side auth guard.
- `/invite/*` is intentionally public and must not be added to
  `PROTECTED_ROUTES` in `middleware.ts`.

#### `onboarding-form.tsx` — invite integration

- Reads `soarup_pending_invite` from localStorage on mount.
- If present: StepTwo auto-switches to `join` path, hides create/join
  toggle, pre-fills code (read-only with "Use a different code" escape hatch).
- `handleStep1Complete` sends `is_onboarded: true` in `PATCH /auth/profile`
  but keeps Zustand store at `is_onboarded: false` until Step 2 completes —
  this prevents `AppShell` from redirecting away from `/onboarding` before
  Step 2 finishes.
- `handleStep2Complete` sets `is_onboarded: true` in Zustand store and
  clears `soarup_pending_invite` from localStorage.
- `joinWorkspace` replaced with `acceptInvite` calling
  `POST /invites/{code}/accept` (was calling the deprecated
  `POST /workspaces/join` endpoint).

#### `invite-page.tsx` — edge cases handled

- **Unauthenticated:** stores code in localStorage → redirects to
  `/signup?next=/invite/{code}?accept=1`. "Sign in instead" link available.
- **Authenticated:** calls `POST /invites/{code}/accept` on CTA click.
- **Auto-accept:** `?accept=1` param triggers `useEffect` auto-accept when
  user returns from login/signup authenticated.
- **Email mismatch:** warning banner shown, not blocked.
- **Already a member:** `alreadyMember` state with dashboard link.
- **Expired/used:** `is_valid: false` state from `GET /invites/{code}`.
- **Not found:** API error state.

#### `login-form.tsx` — `?next=` redirect

Added `useSearchParams` and post-login redirect to `decodeURIComponent(next)`
when `?next=` param is present. Onboarding check takes priority over `?next=`.

#### `signup-form.tsx` — always goes to `/onboarding`

`?next=` param deliberately ignored after signup — new users always go to
`/onboarding` so the localStorage invite code is processed through the
onboarding flow rather than bypassing it.

#### `sidebar.tsx` — Settings link

```typescript
{ href: '/settings/members', label: 'Settings', icon: 'settings', activePrefix: '/settings' }
```

`activePrefix` used to highlight Settings for any `/settings/*` route.

---

## Known Tradeoffs

**1. Invite creation open to any workspace member (not admin-only)**
`POST /workspaces/{id}/invites` uses `OnboardedDep` — any authenticated
member can send invites. Admin-only restriction deferred. Tightening requires
swapping to `WorkspaceAdminDep` — one-line change tracked in
`specs/scaling/api/member_invite_flow.md` Issue 1.

**2. No pre-check for "already a member" before sending invite email**
`Profile` has no `email` column (only `email_notifications: bool`).
`get_member_by_email` cannot be implemented without joining through
`auth.users` (Supabase) or adding `email` to `Profile`. The guard fires
at acceptance time (409) rather than invite creation time. Tracked in
`specs/scaling/api/member_invite_flow.md` Issue 2.

**3. Email mismatch on invite acceptance warned but not blocked**
A user invited via work email who signs up with a personal email can still
accept. Warning logged. Frontend shows a mismatch banner. Deliberate
usability choice.

**4. Invite email uses plain HTML**
React Email templates deferred to M6 alongside digest email templates.
A coordinated template pass is more efficient.

**5. `accept_invite` uses `AuthDep` — onboarding gate bypassed at API level**
Changed from `OnboardedDep` to `AuthDep` to support the new-user invite
flow. Frontend enforces onboarding completion before acceptance. Direct
API access (Swagger/curl) by a non-onboarded user is technically possible
but not a realistic threat vector at current scale. Tracked in
`specs/scaling/api/member_invite_flow.md` Issue 7.

**6. `is_onboarded` was previously only set in Zustand store, not in DB**
`PATCH /auth/profile` was called without `is_onboarded: true` in prior
milestones. `handleStep2Complete` was patching only the Zustand store.
The bug was latent — it only surfaced when the invite flow called a route
protected by `OnboardedDep` before the store was cleared (e.g. page refresh
after onboarding but before a full re-login). Fixed in M5 by sending
`is_onboarded: true` explicitly in the Step 1 `patchProfile` call.

**7. Single workspace per user**
`useWorkspace` returns only `workspaces[0]`. Multi-workspace UI deferred
to post-M9. A user who accepts a second workspace invite becomes a DB member
but cannot access that workspace from the frontend. Tracked in
`specs/scaling/web/member_invite_flow.md` Issue 1.

**8. Resend domain not verified — invite emails limited to Resend account owner**
Local dev and staging use `onboarding@resend.dev`. Emails only deliver to
the Resend account owner's email. Invite links are logged at `invite_email_dev_mode`
level for manual sharing. Full delivery requires domain verification and
`RESEND_FROM_EMAIL=invites@soarup.app` in production. Tracked in
`specs/scaling/web/member_invite_flow.md` Issue 2.

**9. OAuth buttons are non-functional placeholders**
Google and GitHub buttons on login/signup pages are UI stubs. OAuth flow
deferred to post-M9 after core milestone features are complete. Tracked in
`specs/scaling/web/member_invite_flow.md` Issue 3.

**10. localStorage invite code not cleared on signup abandonment**
If a user starts the signup flow from an invite link but abandons before
completing, the code stays in localStorage and pre-fills on next onboarding
visit — even if the invite has since expired. The API returns an appropriate
error; UX friction only. Fix: add timestamp + expiry check on read.
Tracked in `specs/scaling/web/member_invite_flow.md` Issue 5.

---

## Acceptance Criteria — Final Status

```
[✅] Any member can invite a user by email — Resend delivers if API key set
[✅] Invite link works — recipient signs up/logs in and joins workspace
[✅] Invite expires after 7 days — expired invites show error on acceptance page
[✅] Invites are single-use — reusing a code shows error
[✅] Admin can revoke pending invites
[✅] Admin can remove a member
[✅] Owner can change member role (member ↔ admin)
[✅] Member cannot change roles or remove members
[✅] N+1 profile query fixed — batch fetch in get_workspace_updates
[✅] Redis Streams replaces pub/sub — missed events replayed on reconnect
[✅] useWebSocket passes last_event_id on reconnect
[✅] Settings → Members page functional (invite, list, revoke, role, remove)
[✅] Backend unit + integration tests pass
[✅] Frontend unit tests pass
[✅] Storybook stories added for MembersPanel + InvitePage

[⚠️] Resend email delivery limited to Resend account owner (domain not verified)
[⚠️] accept_invite uses AuthDep (intentional — see tradeoffs)

[❌] Team dashboard pending section (PendingMembersRow) — deferred to M6
[❌] member.update_submitted WebSocket event from UpdateService — deferred to M6
[❌] Profile settings page (/settings/profile) — deferred to M6
[❌] Avatar upload/delete in settings — deferred to M6
[❌] Workspace member count in sidebar — deferred to M6
[❌] PATCH /workspaces/:id/prompts owner gate — verify/apply in M6
```

---

## Files Created — Actual

### Backend (apps/api/)

```
app/models/invite.py                          ✅
app/schemas/invite.py                         ✅
app/repositories/invite_repo.py               ✅
app/services/invite_service.py                ✅
app/routers/invites.py                        ✅
app/routers/members.py                        ✅
app/api/rbac.py                               ✅
app/lib/email.py                              ✅
alembic/versions/c246201ec040_add_workspace_invites_table.py  ✅
tests/integration/test_rbac.py                ✅
tests/integration/test_member_router.py       ✅
tests/unit/test_invite_repo.py                ✅
tests/unit/test_invite_service.py             ✅
tests/integration/test_invite_router.py       ✅
tests/unit/test_events.py                     ✅
tests/unit/test_update_service_batch.py       ✅
```

### Frontend (apps/web/src/)

```
hooks/useWorkspaceMembers.ts                  ✅ (was useMembers.ts in spec)
hooks/useInviteMembers.ts                     ✅
components/domain/members/members-panel.tsx   ✅
app/(public)/layout.tsx                       ✅ (new route group)
app/(public)/invite/[code]/page.tsx           ✅
app/(app)/settings/members/page.tsx           ✅
stories/domain/members/MembersPanel.stories.tsx       ✅
stories/pages/settings/MembersSettingsPage.stories.tsx ✅
stories/pages/invite/InvitePage.stories.tsx   ✅
```

### Updated Files

```
apps/api/app/repositories/workspace_repo.py  ✅ +get_workspace_members_with_profiles,
                                                 +update_member_role, +remove_member,
                                                 +get_profiles_for_updates
                                                 (get_member_by_email NOT added —
                                                  Profile has no email column)
apps/api/app/services/update_service.py      ✅ batch profile fetch,
                                                 _to_response_batch (sync),
                                                 _get_workspace_repo lazy init
apps/api/app/lib/events.py                   ✅ Redis Streams (append_event,
                                                 read_events replaces publish_event)
apps/api/app/routers/websockets.py           ✅ xread loop, last_event_id param,
                                                 per-connection Redis client,
                                                 broadcaster removed
apps/api/app/main.py                         ✅ +invites, +members routers,
                                                 broadcaster lifecycle removed
apps/api/app/config.py                       ✅ +app_base_url, +resend_from_email
                                                 with validators
apps/api/alembic/env.py                      ✅ +import app.models.invite
apps/web/src/hooks/useWebSocket.ts           ✅ lastEventId from store,
                                                 URLSearchParams URL builder,
                                                 last_event_id on reconnect
apps/web/src/components/domain/auth/onboarding-form.tsx  ✅ localStorage invite
                                                           integration, acceptInvite,
                                                           is_onboarded fix
apps/web/src/components/domain/auth/login-form.tsx       ✅ ?next= redirect
apps/web/src/components/layout/sidebar.tsx   ✅ /settings/members href,
                                                 activePrefix for /settings
```

### Deferred (not created in M5)

```
components/domain/dashboard/pending-members-row.tsx  ❌ M6
app/(app)/settings/profile/page.tsx                  ❌ M6
hooks/useProfileSettings.ts                          ❌ M6
stories/domain/PendingMembersRow.stories.tsx         ❌ M6
stories/settings/ProfilePage.stories.tsx             ❌ M6
```

---

## Scaling & Technical Debt Documents

```
specs/scaling/web/member_invite_flow.md   ← Web M5 scaling doc (8 issues)
specs/scaling/api/member_invite_flow.md   ← API M5 scaling doc (10 issues)
```

Key pre-production items from these documents:

```
[ ] Verify soarup.app in Resend + set RESEND_FROM_EMAIL in production
[ ] Remove broadcaster[redis] from pyproject.toml
[ ] Change INNER JOIN → LEFT OUTER JOIN in get_workspace_members_with_profiles
[ ] Wrap resend.Emails.send with asyncio.to_thread
[ ] Add redis.expire after xadd in append_event (stream TTL)
[ ] Tighten create_invite to WorkspaceAdminDep (one-line change)
[ ] Add POST /workspaces/{id}/transfer-ownership endpoint
[ ] Wire OAuth buttons after M9 (Google + GitHub via Supabase)
```

---

## M6 Carry-Forward

The following items were scoped for M5 but deferred and must be picked up
in Milestone 6:

1. **Team dashboard pending section** — `PendingMembersRow` component, wire
   `useWorkspaceMembers` into `dashboard/page.tsx`, pass `members` to
   `DashboardView`, add pending section above update list.

2. **`member.update_submitted` event** — Publish from
   `UpdateService.submit_update` after creating the update. Add handler
   in `useDashboardUpdates` to invalidate the updates cache for the workspace.

3. **Profile settings page** — `/settings/profile` with display name,
   timezone, avatar upload/delete. `useUpdateProfile`, `useUploadAvatar`,
   `useDeleteAvatar` hooks. Avatar upload endpoint exists from M1.

4. **`PATCH /workspaces/:id/prompts` owner gate** — Confirm or apply
   `WorkspaceOwnerDep` on the workspace prompt config endpoint.

5. **Two-step join simplification** — After signup and profile Step 1,
   auto-accept pending invite and skip workspace Step 2 entirely if
   `soarup_pending_invite` exists in localStorage. Tracked as Issue 4 in
   web scaling doc.

6. **localStorage invite expiry check** — Add timestamp to stored invite code,
   validate against invite expiry window on `OnboardingForm` mount.
