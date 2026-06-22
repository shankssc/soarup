# SoarUp — Polish Milestone: UI + E2E Testing + Quick Fixes

# Branch: feature/milestone-polish

# Merges into: develop

# Prerequisites: feature/milestone-6 merged to develop ✅

---

## What This Milestone Delivers

### Quick Fixes ✅

1. Replace pytz with stdlib zoneinfo (#49)
2. Frontend guard on digest preview — skip Claude if HTML already set (#50 partial — frontend guard only)
3. Cap DigestCard skeleton rows at 5 (#53)
4. Invalidate workspaceKeys.mine() after digest settings save (#54)
5. Consolidate digest task DB commits into single transaction (#48)
6. Chunk digest email recipients into batches of 50 (#46)
7. Add digest settings form re-sync on tab visibility change (#52)

### UI Polish ✅

8. Electric glow shadow system applied consistently to surface cards (#12)
9. Light mode contrast refinement + surface separation (#13)
10. Loading state indicators across auth and app pages (#14)
11. DM Sans headline font — replaced Newsreader serif (#14 adjacent)
12. ConnectionIndicator redesigned as pill/badge (#12 adjacent)
13. Digest preview empty state — "No updates today" modal (#12 adjacent)
14. Post-auth refresh routing fix — middleware + AppShell (#14 adjacent)

### E2E Testing — Infrastructure built, full suite deferred ⚠️

15. Playwright infrastructure: global-setup, global-teardown, storageState (#58–#61 partial)
16. data-testid attributes added across all interactive components (#58–#61 partial)
17. Auth fixes required by E2E work — applied to production code (#58–#61 adjacent)
18. Unauthenticated routing tests — passing (#58 partial)
19. Full E2E suite deferred — see notes below

### Mobile Testing — Deferred ⏳

20. Voice recording on iOS Safari, iOS Chrome, Android Chrome (#8 — deferred)

---

## Branch Strategy

```
develop
└── feature/milestone-polish
    ├── feature/polish-quick-fixes        ← #46, #48, #49, #52, #53, #54 ✅
    ├── feature/polish-ui-depth           ← #12, #13 ✅
    ├── feature/polish-loading-states     ← #14 ✅
    └── feature/polish-e2e-tests          ← #58–#61 partial ⚠️
```

---

## Part 1: Quick Fixes ✅ COMPLETE

### Fix 1 — Replace pytz with stdlib zoneinfo (#49) ✅

```python
# apps/api/app/workers/tasks.py
# Removed: import pytz
# Added:
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
tz = ZoneInfo(tz_str)
# except ZoneInfoNotFoundError replaces except pytz.UnknownTimeZoneError
# pytz removed from requirements.txt
```

### Fix 2 — Frontend preview guard (#50 partial) ✅

```typescript
// apps/web/src/components/domain/digests/digest-settings-panel.tsx
async function handlePreviewClick() {
  if (!previewHtml || previewHtml === "") await onPreview();
  setShowPreview(true);
}
// Empty HTML case now shows "No updates today" modal instead of blank iframe
```

### Fix 3 — Cap DigestCard skeleton rows (#53) ✅

```typescript
// apps/web/src/components/domain/digests/digest-card.tsx
Array.from({ length: Math.min(digest.update_count, 5) });
```

### Fix 4 — Invalidate workspace cache after digest settings save (#54) ✅

```typescript
// apps/web/src/hooks/useDigests.ts — useUpdateDigestSettings
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: digestKeys.settings(workspaceId) });
  queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
},
```

### Fix 5 — Consolidate digest task commits (#48) ✅

```python
# apps/api/app/workers/tasks.py — _send_workspace_digest_async
# All repo methods use flush() only
# Three explicit db.commit() calls — one per exit path:
#   - no updates found → update_status("failed") → db.commit() → return
#   - no recipients   → update_status("sent")   → db.commit() → return
#   - happy path      → update_status(final)    → db.commit()
```

### Fix 6 — Chunk email recipients (#46) ✅

```python
# apps/api/app/lib/email.py
RESEND_BATCH_SIZE = 50

async def send_digest_email(...) -> bool:
    if not to_emails:
        return True
    for i in range(0, len(to_emails), RESEND_BATCH_SIZE):
        batch = to_emails[i : i + RESEND_BATCH_SIZE]
        params: Emails.SendParams = {
            "from": ..., "to": batch, "subject": ..., "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
```

### Fix 7 — Digest settings form re-sync on tab visibility (#52) ✅

```typescript
// apps/web/src/app/(app)/settings/digest/page.tsx
React.useEffect(() => {
  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && !isDirty) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () =>
    document.removeEventListener("visibilitychange", handleVisibilityChange);
}, [isDirty, queryClient]);
```

---

## Part 2: UI Polish ✅ COMPLETE

### Shadow system (#12) ✅

Added to `globals.css` under `@layer utilities`:

```css
.shadow-card {
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
}
.shadow-card-hover {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.06);
}
.dark .shadow-card {
  box-shadow:
    0 0 0 1px var(--color-outline-variant),
    0 0 12px rgba(83, 221, 252, 0.07);
}
.dark .shadow-card-hover {
  box-shadow:
    0 0 0 1px var(--color-primary),
    0 0 20px rgba(83, 221, 252, 0.18);
}
.shadow-modal {
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
}
.dark .shadow-modal {
  box-shadow:
    0 0 0 1px var(--color-outline-variant),
    0 8px 40px rgba(0, 0, 0, 0.6),
    0 0 24px rgba(83, 221, 252, 0.1);
}
.card-interactive {
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}
.card-interactive:hover {
  @apply shadow-card-hover;
}
```

Applied to:

- `UpdateCard` — `shadow-card card-interactive`
- `DigestCard` — `shadow-card card-interactive`
- `VoiceRecorder` — `shadow-card`
- `DigestPreviewModal` — `shadow-modal`
- Auth layout card — `shadow-card` + dark mode glow

### Light mode contrast + surface separation (#13) ✅

```css
/* globals.css :root */
--color-surface-high: #d0e6e5; /* was #daeceb */
--color-container: #e2f2ed; /* was #dff1f0 */
```

### Loading states (#14) ✅

**PageTransition** — `apps/web/src/components/ui/page-transition.tsx`

- Cyan top bar on every route change
- Wired into root `layout.tsx` inside `Suspense` boundary
- Covers both `(auth)` and `(app)` routes

**DashboardSkeleton** — `apps/web/src/components/domain/dashboard/dashboard-skeleton.tsx`

- Shown while `workspace?.id` is unavailable
- Mirrors UpdateCard structure for smooth transition

**Auth form submission overlay**

- Frosted glass overlay on `LoginForm` and `SignupForm` during in-flight requests
- Prevents double submission

**VoiceRecorder**

- `requesting_permission` state has text label
- `shadow-card` added to recorder container

### Typography ✅

- `Newsreader` replaced with `DM Sans` via `next/font/google`
- `--font-dm-sans` CSS variable wired into `tailwind.config.ts`
- `italic` stripped from all primary headings
- Italic retained only on AI-generated summary blocks

### ConnectionIndicator redesign ✅

```tsx
// Replaced bare dot with pill/badge across all 5 states:
// connected/idle  → green pill  "Live"
// connecting      → amber pulse "Connecting"
// reconnecting    → amber pulse "Reconnecting..."
// disconnected    → red pill    "Connection lost · Reconnect" (clickable)
```

### Sidebar improvements ✅

- `bg-surface-low` background for visual separation
- Active nav item switched from `border-r` to `border-l` accent
- `border-transparent` on inactive items prevents layout shift
- Sub-links follow same pattern

### Digest preview empty state ✅

```tsx
// digest-settings-panel.tsx
// Empty HTML → "No updates today" modal instead of blank iframe
// Re-fetch guard ensures stale empty string doesn't block re-preview
```

### Post-auth refresh routing fix ✅

```typescript
// app-shell.tsx — passes current pathname as ?next= on unauthenticated redirect
// middleware.ts — honours ?next= param on auth routes
// Prevents post-refresh redirect to /dashboard regardless of actual route
```

### Auth hydration fix ✅

```typescript
// onboarding/page.tsx + app-shell.tsx
// Zustand persist hydration guard via onFinishHydration()
// Prevents premature routing decisions before localStorage rehydrates
```

---

## Part 3: E2E Testing ⚠️ INFRASTRUCTURE COMPLETE, SUITE DEFERRED

### What was built

**Infrastructure**

- `global-setup.ts` — seed user creation, storageState saved to
  `.auth/seed-user.json`
- `global-teardown.ts` — deletes all `e2e+*` Supabase auth users via
  service role admin API
- `playwright.config.ts` — globalSetup, globalTeardown, storageState per
  project, split authenticated vs unauthenticated projects
- `fixtures/auth.ts` — `login`, `signUp`, `completeOnboarding` helpers

**Specs written**

- `auth/routing-unauth.spec.ts` — unauthenticated routing redirects ✅ passing
- `auth/signup-onboarding.spec.ts` — full signup → onboarding → dashboard
- `updates/text-update-submission.spec.ts` — scaffolded
- `members/invite-flow.spec.ts` — scaffolded
- `updates/voice-update-submission.spec.ts` — scaffolded

**data-testid additions — all complete ✅**

```
login-form.tsx          email-input, password-input, login-submit
signup-form.tsx         full-name-input, email-input, password-input,
                        confirm-password-input, signup-submit
onboarding-form.tsx     display-name-input, onboarding-step1-submit,
                        workspace-name-input, create-workspace-submit
                        (InputField + CtaButton updated to forward prop)
dashboard-view.tsx      submit-update-cta, voice-note-cta
update-form.tsx         update-textarea, update-submit-btn
update-card.tsx         update-card, update-status-badge, update-summary
voice-recorder.tsx      voice-recorder-idle, voice-recorder-requesting-permission,
                        voice-recorder-recording, voice-recorder-preview,
                        voice-recorder-uploading, record-btn, stop-btn,
                        rerecord-btn, submit-voice-btn
members-panel.tsx       invite-email-input, invite-send-btn, pending-invite-row
```

### Why full suite is deferred

Test data cleanup requires truncating PostgreSQL tables in foreign-key
order across profiles, workspaces, workspace_members, updates, digests,
and digest_items — not just deleting Supabase auth users. Without this,
each test run accumulates orphaned rows that cause unique constraint
violations on subsequent runs. This is scoped as a dedicated E2E cleanup
task rather than bolted onto the polish milestone.

### Auth fixes applied during E2E work (production improvements)

```typescript
// useAuth.ts — syncSupabaseSession now called BEFORE Zustand store update
// Guarantees Supabase cookie is written before signup/login resolves
// Eliminates race condition between cookie write and router.push()

signup: async (email, password, fullName) => {
  // ...API call...
  await syncSupabaseSession(data.access_token, refresh_token); // ← first
  set({ user: data.user, tokens: { ... } });                   // ← then
}
// Same pattern applied to login
```

---

## Acceptance Criteria

```
[x] pytz removed, zoneinfo used throughout
[x] Preview modal reuses cached HTML on re-open
[x] Preview modal shows "No updates today" when html is empty
[x] DigestCard skeleton capped at 5 rows
[x] Workspace cache invalidated after digest settings save
[x] Digest task uses single DB commit per exit path
[x] Digest email batched in groups of 50
[x] Digest settings form re-syncs on tab visibility change
[x] Shadow system applied to UpdateCard, DigestCard, VoiceRecorder,
    DigestPreviewModal, auth layout card
[x] Dark mode: cyan glow shadows on cards
[x] Light mode: drop shadows + surface separation visible
[x] DM Sans headline font — Newsreader removed
[x] Italic stripped from primary headings, retained on AI summary blocks
[x] ConnectionIndicator redesigned as pill/badge across all 5 states
[x] Sidebar active state uses left border accent
[x] Loading overlay shown during login/signup form submissions
[x] Dashboard skeleton shown while workspace loads
[x] VoiceRecorder requesting_permission state has text label
[x] PageTransition cyan bar on every route change
[x] Post-auth refresh stays on current page (not always /dashboard)
[x] Zustand hydration guard on onboarding page and AppShell
[x] syncSupabaseSession called before Zustand update in login + signup
[x] data-testid attributes added across all interactive components
[x] E2E infrastructure: global-setup, teardown, storageState, fixtures
[x] Unauthenticated routing tests passing on chromium
[ ] E2E: signup → onboarding → dashboard — deferred (test data cleanup)
[ ] E2E: text update → AI summary — deferred
[ ] E2E: invite → accept → team dashboard — deferred
[ ] E2E: voice recorder state transitions — deferred
[ ] E2E suite in CI — deferred
[ ] Mobile: voice recording verified on iOS Safari — deferred
[ ] Mobile: voice recording verified on Android Chrome — deferred
```

---

## Files Modified

### Backend (apps/api/)

```
app/workers/tasks.py      pytz → zoneinfo, single commit pattern
app/lib/email.py          batch recipients, empty guard
requirements.txt          pytz removed
```

### Frontend (apps/web/src/)

```
app/layout.tsx                              DM Sans font, PageTransition
app/(auth)/onboarding/page.tsx              Zustand hydration guard
app/(auth)/login/page.tsx                   heading style
app/(auth)/signup/page.tsx                  heading style
app/(app)/dashboard/page.tsx                DashboardSkeleton guard
app/(app)/settings/digest/page.tsx          visibility re-sync
components/ui/page-transition.tsx           NEW
components/domain/dashboard/
  dashboard-skeleton.tsx                    NEW
  dashboard-view.tsx                        data-testid
components/domain/updates/
  update-card.tsx                           shadow-card, data-testid
  update-form.tsx                           data-testid
  voice-recorder.tsx                        shadow-card, data-testid,
                                            requesting_permission label
components/domain/digests/
  digest-card.tsx                           shadow-card, skeleton cap
  digest-settings-panel.tsx                 preview guard, empty state modal
components/domain/members/
  members-panel.tsx                         data-testid
components/domain/auth/
  login-form.tsx                            data-testid, submission overlay
  signup-form.tsx                           data-testid, submission overlay
  onboarding-form.tsx                       data-testid (InputField + CtaButton)
components/layout/
  sidebar.tsx                               bg-surface-low, border-l active,
                                            ConnectionIndicator pill redesign
  app-shell.tsx                             Zustand hydration guard,
                                            pathname-aware login redirect
hooks/useAuth.ts                            syncSupabaseSession order fix
hooks/useDigests.ts                         workspaceKeys invalidation
globals.css                                 shadow utilities, surface variables
tailwind.config.ts                          DM Sans headline token
middleware.ts                               ?next= param honoured on auth routes
```

### E2E (apps/web/tests/e2e/)

```
global-setup.ts                             seed user + storageState
global-teardown.ts                          Supabase auth user cleanup
playwright.config.ts                        globalSetup/Teardown, storageState
fixtures/auth.ts                            login, signUp, completeOnboarding
auth/routing-unauth.spec.ts                 ✅ passing
auth/signup-onboarding.spec.ts              scaffolded
updates/text-update-submission.spec.ts      scaffolded
members/invite-flow.spec.ts                 scaffolded
updates/voice-update-submission.spec.ts     scaffolded
.gitignore additions                        tests/e2e/.auth/, debug-*.png
```
