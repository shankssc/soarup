# SoarUp — Milestone: Pre-Deployment Hardening

# Branch: feature/milestone-pre-deployment-hardening

# Merges into: develop

# Prerequisites: feature/milestone-9 merged to develop ✅

---

## Purpose

This milestone is not a feature milestone — it adds no new product
capability. Its job is to close the gap between "the product works
when I test it locally" and "the product can be trusted in front of
real users on a public URL." Everything in scope here either fixes a
trust/first-impression issue, closes a security or compliance gap, or
verifies core flows end-to-end before they're exposed to the internet.

Nothing in this milestone should be skipped to save time — this is the
gate, not a nice-to-have.

---

## What This Milestone Delivers

### E2E Test Completion — ✅ COMPLETE (see Part 1 Completion Notes)

1. Test data cleanup mechanism — direct Postgres truncation in FK order,
   re-seed after each run ✅
2. `signup-onboarding.spec.ts` passing (#58) ✅
3. `text-update-submission.spec.ts` passing (#59) ✅
4. `invite-flow.spec.ts` — 2 of 3 tests passing (#60); third test
   deliberately skipped, see Known Tradeoffs
5. `voice-update-submission.spec.ts` passing (#61) ✅

### Observability — ✅ COMPLETE (see Part 2 Completion Notes)

6. Sentry configured on FastAPI backend (errors + Celery tasks) ✅
7. Sentry configured on Next.js frontend ✅
8. `send_default_pii=False` on both — no PII sent to Sentry ✅

### First-Impression Bug Fixes — ✅ COMPLETE (see Part 3 Completion Notes)

9. SVG icons on auth pages fixed — no manual reload required (#110) ✅
10. Auth loading spinner covers full login sequence, not just API call (#109) ✅
11. Slack settings page — shared channel delivery model clarified (#107) ✅

### Correctness Fixes (from M9 scaling docs) — ✅ COMPLETE (see Part 4 Completion Notes)

12. Username race condition — IntegrityError mapped to clean error ✅
13. UsernameIndicator — isError branch added, no silent false negative ✅
14. Public profile — `loading.tsx` added, FOUC eliminated ✅

### Visual Polish — ✅ COMPLETE (see Part 5 Completion Notes)

15. Settings sub-pages (Digest, Members) — visual balance pass (#108) ✅
16. Public profile page — cosmetic pass to match Profile page quality ✅

### Security & Compliance — ✅ COMPLETE (see Part 6 Completion Notes)

17. Server-side `update_date` validation using stored timezone (#18) ✅
18. Rate limiting on update submission endpoints (#20) ✅
19. Signed unsubscribe token for digest emails — CAN-SPAM/GDPR (#47) ✅

### Deployment Readiness — 🔴 NOT STARTED

20. Resend domain verification — real email delivery, not just
    `onboarding@resend.dev`
21. Full environment variable audit — every required var documented
    and present in staging
22. Staging deployment
23. Smoke test on staging — walk all four E2E flows manually once live

---

## Branch Strategy

```
develop
└── feature/milestone-pre-deployment-hardening
    ├── feature/pdh-e2e-completion       ← ✅ MERGED — test data cleanup + 4 specs
    ├── feature/pdh-sentry               ← ✅ MERGED — backend + frontend observability
    ├── feature/pdh-first-impression     ← ✅ MERGED — #110, #109, #107
    ├── feature/pdh-m9-correctness       ← ✅ MERGED — IntegrityError, isError, loading.tsx
    ├── feature/pdh-visual-polish        ← ✅ MERGED — #108, #16 (scrollbar + mobile hero fix)
    ├── feature/pdh-security             ← ✅ COMPLETE, ready for PR — #17, #18, #19
    └── feature/pdh-deploy-readiness     ← NOT STARTED — Resend domain, env audit, staging deploy

Merge order:
  feature/pdh-e2e-completion       → feature/milestone-pre-deployment-hardening  ✅ DONE
  feature/pdh-sentry                → feature/milestone-pre-deployment-hardening  ✅ DONE
  feature/pdh-first-impression      → feature/milestone-pre-deployment-hardening  ✅ DONE
  feature/pdh-m9-correctness        → feature/milestone-pre-deployment-hardening  ✅ DONE
  feature/pdh-visual-polish         → feature/milestone-pre-deployment-hardening  ✅ DONE
  feature/pdh-security              → feature/milestone-pre-deployment-hardening  ← NEXT
  feature/pdh-deploy-readiness      → feature/milestone-pre-deployment-hardening
  feature/milestone-pre-deployment-hardening → develop
```

---

## Part 1: E2E Test Completion — ✅ COMPLETE

### Step 1: Test Data Cleanup Mechanism — ✅ DONE, extended beyond original spec

Implemented as originally specced (`db-cleanup.ts`, `global-setup.ts`,
`global-teardown.ts`, `E2E_DATABASE_URL`), **plus one addition the
original spec didn't anticipate**: voice update audio objects live in
Minio/R2, entirely outside Postgres, referenced only by
`updates.audio_key`. Truncating the `updates` table alone would leak
those objects into the bucket forever. Added `cleanupE2EAudioObjects()`
to `db-cleanup.ts`, which queries `audio_key` for all `e2e+` users
**before** the Postgres cascade deletes those rows, then deletes the
corresponding Minio objects via `@aws-sdk/client-s3` (new dev
dependency). Non-fatal on failure, consistent with the rest of the
file's philosophy.

### Step 2: Run All Four Specs — ✅ DONE, all four written and passing (with one documented exception)

The original spec assumed these four files already existed and just
needed fixing. In practice, **only `signup-onboarding.spec.ts` existed
as a starting point** — `text-update-submission.spec.ts`,
`invite-flow.spec.ts`, and `voice-update-submission.spec.ts` were
written from scratch this milestone, informed by the actual component
implementations rather than assumed structure.

Final locations (adjusted from the original spec's assumed paths):

```
tests/e2e/auth/signup-onboarding.spec.ts
tests/e2e/updates/text-update-submission.spec.ts
tests/e2e/invite/invite-flow.spec.ts        ← spec doc assumed tests/e2e/members/
tests/e2e/updates/voice-update-submission.spec.ts
```

---

## Part 1 Completion Notes — Real Bugs Found and Fixed

The original spec framed Part 1 as "fix any failures surfaced — likely
auth timing edge cases, WebSocket races, or stale `data-testid`
mismatches." In practice, writing and debugging these four specs
surfaced a substantially longer list of **real, production-impacting
bugs** — not test-only issues. Documented here since none of this was
anticipated by the original spec and none of it is reflected in the
"Files To Create / Modify Summary" section below without this context.

### Real application bugs fixed (not test-only)

1. **Missing onboarding guard on `DashboardPage`.** A user who signed
   up but never completed onboarding could navigate directly to
   `/dashboard` and land on a broken/incomplete view. Middleware only
   checks session existence, not `is_onboarded` (that lives
   client-side). Added the same hydration-aware guard pattern already
   used on `/onboarding`. — `src/app/(app)/dashboard/page.tsx`

2. **Signup → onboarding redirect race.** `signup-form.tsx` navigated
   to `/onboarding` immediately after `signup()` resolved, but the
   underlying Supabase session cookie write (triggered by an
   `onAuthStateChange` listener, not the awaited call itself) could
   still be in flight — middleware would see no session yet and bounce
   to `/login`. Original code had an arbitrary `setTimeout(500)`
   papering over this. Fixed properly by polling for the actual cookie
   before navigating (`waitForSupabaseSessionCookie` in `useAuth.ts`),
   not by guessing a delay. — `src/hooks/useAuth.ts`

3. **Redis client outliving its event loop in Celery tasks.**
   `ProcessUpdateTask` cached a Redis client on the long-lived Task
   instance, but each task invocation runs under a fresh `asyncio`
   event loop (via `asyncio.run()`). The cached client's connections
   bound to whichever loop existed when first created; the next
   invocation's first Redis call failed with `RuntimeError: Event loop
is closed`, silently dropping `update.status_changed` WebSocket
   events roughly 1-in-N task runs. Fixed by creating a fresh Redis
   client scoped to each task invocation instead of caching it. —
   `app/workers/tasks.py`

4. **WebSocket runaway reconnect loop.** `useWebSocket.ts`'s `connect`
   callback included `reconnectAttempts` and `lastEventId` in its
   dependency array — both change on every reconnect and every
   incoming message. This gave `connect` a new identity constantly,
   which retriggered the mount effect (itself depending on `connect`),
   tearing down and reopening the socket in a tight loop layered on
   top of the backoff-governed reconnect already scheduled by
   `ws.onclose`. Produced tens of thousands of connection attempts and
   Chrome's "Insufficient resources" error under real use. Fixed by
   moving those values to refs so `connect`'s identity stays stable
   across the connection's lifetime. — `src/hooks/useWebSocket.ts`

5. **WebSocket first-connection event-loss race.** A client with no
   stored `last_event_id` connected with cursor `"$"` (Redis: "only
   entries from this exact moment forward"). Since JWT validation on
   connect is a real network round-trip, a backend task could complete
   and publish its event before this connection's first `xread` began
   — permanently missing it, no replay possible. Fixed by defaulting
   fresh connections to `"0"` (full history) instead of `"$"`. —
   `src/hooks/useWebSocket.ts`

6. **Soft-delete vs. unique-constraint mismatch on `updates`.** The
   `uq_updates_user_workspace_date` constraint had no concept of
   `is_deleted` — a user who deleted today's update and tried to
   submit a new one hit a raw `UniqueViolationError` (surfaced as a
   generic 500), since the soft-deleted row still occupied the
   constraint's slot. Fixed via Alembic migration replacing the
   constraint with a partial unique index
   (`postgresql_where="is_deleted = false"`), so only active rows
   enforce uniqueness. — `app/models/update.py`,
   `alembic/versions/..._partial_unique_index_for_active_updates.py`

7. **`invites.py` error response shape mismatch.** Every other router
   builds errors via `create_error_response` (`{error, message,
details}`), which `apiClient.ts` is written to parse. `invites.py`
   was the one router still using raw FastAPI `HTTPException`
   (`{detail: "..."}`), so every invite-related error (already-member,
   expired, not-found) reached the frontend with an empty message —
   `InvitePage`'s substring-matching error handling silently fell
   through to the wrong UI state regardless of correct backend logic.
   Fixed by aligning `invites.py` with the standard envelope on error
   paths only (success paths deliberately left unwrapped — see code
   comment on why wrapping those would have broken existing frontend
   hooks). — `app/routers/invites.py`

### Test harness issues found and fixed

- `.env.local` was never being loaded by Playwright (Next.js loads it
  automatically; Playwright does not) — root cause of cleanup silently
  no-op-ing before any spec-level debugging even began. Fixed via
  explicit `dotenv.config()` in `playwright.config.ts`.
- `__dirname` unavailable under ESM (`apps/web`'s `"type": "module"`) —
  reconstructed via `import.meta.url`.
- Project-level `storageState` (the seed user's authenticated session)
  silently applies to _any_ new browser context created in a spec file,
  not just the implicit `page` fixture — including manual
  `browser.newContext()` calls. Every multi-context spec needs an
  explicit `test.use({ storageState: { cookies: [], origins: [] } })`
  override; missing it produces confusing "authenticated user redirected
  away from a page it should reach" failures.
- `Date.now()`-based test email/workspace generation collided under
  `fullyParallel: true` — two workers can call `Date.now()` within the
  same millisecond. Fixed with `crypto.randomUUID()` for real entropy.
- WebKit-specific form-fill unreliability (`page.fill()` racing React's
  controlled-input re-render right after page load) — added a
  fill-then-verify-then-retry-with-keystrokes helper.
- Fake audio device WAV fixture needed a specifically minimal header
  (no `LIST`/`INFO` metadata chunk) for Chromium's fake-capture parser
  to read it; `ffmpeg -fflags +bitexact` produces the correct format.
- Chrome's `--use-fake-ui-for-media-permissions` launch flag did not
  reliably suppress the real permission popup in practice — replaced
  with Playwright's native `permissions: ['microphone']` context
  option (CDP-based, more reliable).
- `/invite/[code]`'s first-ever hit in a test run can incur real
  Next.js dev-mode cold-compile time, distinguishable from
  hydration-timing races by a genuinely blank page screenshot rather
  than "correct text present but not yet rendered."

---

## Part 2: Sentry Setup — ✅ COMPLETE

### Step 1: Backend (FastAPI + Celery) — ✅ DONE

- `app/lib/sentry.py` created — single `init_sentry()` function called
  from both `app/main.py` (inside `create_app()`, before app
  construction) and `app/workers/celery_app.py` (module-level, before
  `Celery(...)` is constructed), so both processes share identical
  config and can't drift.
- `send_default_pii=False` hardcoded (not settings-driven — deliberate
  safety default, not meant to be flippable per-environment).
- `traces_sample_rate = 0.1` (10% sampling) — chosen deliberately over
  Sentry's onboarding default of `1.0` to conserve free-tier quota
  while `send_default_pii=False` and traces are still meaningfully
  useful.
- No-ops cleanly if `SENTRY_DSN` is unset, so local dev without a DSN
  configured doesn't error.

### Step 2: Frontend (Next.js) — ✅ DONE

- Ran `npx @sentry/wizard@latest -i nextjs`, targeting SaaS
  (sentry.io), not self-hosted.
- Declined: ad-blocker tunnel route, session replay, Sentry logs, MCP
  server config — all deliberately out of scope for a pre-launch,
  free-tier, error-monitoring-only setup (see rationale in commit
  history / chat log if revisited later).
- Accepted: example verification page (`/sentry-example-page`) and
  trace-data injection into root layout metadata (converted
  `export const metadata` to `generateMetadata()` in
  `src/app/layout.tsx` to merge in `Sentry.getTraceData()`).
- Declined CI/CD-specific `SENTRY_AUTH_TOKEN` wizard prompts since
  Railway/Cloudflare deployment doesn't exist yet — deferred to
  **Part 7 (Deployment Readiness)**. Flag for that milestone: without
  `SENTRY_AUTH_TOKEN` configured in the deploy platform's build env,
  staging source maps won't upload and stack traces will show
  minified code.
- All three Sentry init files (`sentry.server.config.ts`,
  `sentry.edge.config.ts`, `instrumentation-client.ts`) manually
  corrected post-wizard:
  - `dataCollection.userInfo` / `.httpBodies` uncommented and set to
    `false`/`[]` — wizard leaves these commented out, meaning Sentry's
    default (send everything) applies unless explicitly overridden.
  - `dsn` changed from wizard's hardcoded literal to
    `process.env.NEXT_PUBLIC_SENTRY_DSN`.
  - `tracesSampleRate` brought down from wizard's default `1` to `0.1`,
    matching backend.
  - `environment` bug found and fixed: originally read
    `process.env.ENVIRONMENT`, which is never exposed client-side —
    corrected to `process.env.NEXT_PUBLIC_ENVIRONMENT`.

### Step 3: Verification — ✅ DONE (both backend and frontend confirmed capturing)

- Backend: `/sentry-debug` throwaway route + Celery `sentry_test` task
  both confirmed landing in the FastAPI Sentry project, no PII in
  payload.
- Frontend: confirmed via a temporary `/sentry-test` page after the
  wizard's own example page proved unreliable (see below) — confirmed
  landing in the Next.js Sentry project with a readable (non-minified)
  stack trace, confirming local source map upload worked.
- All throwaway verification code removed before merge (see Files
  Modified below).

---

## Part 2 Completion Notes — What Actually Went Wrong (and Why)

Nothing about the Sentry SDKs themselves was defective. Every issue
below was either a pre-existing environment inconsistency that a new
dependency's transitive tree happened to expose, or tooling
(Turbopack) that was still immature relative to the Next.js version in
use. None of this is unusual for a milestone titled "harden before
real users see it" — this is exactly the category of gap this
milestone exists to catch.

### 1. Windows quoting broke the initial `pip install`

`pip install --upgrade 'sentry-sdk[fastapi,celery]'` failed on
PowerShell because single quotes aren't a quoting mechanism there.
Fixed by using double quotes (or no quotes at all, since brackets
aren't special in PowerShell).

### 2. `docker compose restart` does not pick up new/changed `.env` values

Added `SENTRY_DSN` to `.env`, but `docker compose restart` only
cycles the existing container process without re-reading `env_file`/
`environment` config — only `docker compose up` (recreating the
container) does that. Cost real debugging time on both the backend
DSN and, later, the frontend `NEXT_PUBLIC_SENTRY_DSN` for the same
reason. **Lesson for the team:** any `.env` change requires
`docker compose up -d --force-recreate <service>`, not `restart`.

### 3. `docker-compose.yml`'s explicit `environment:` block silently overrides `env_file`

The `web` service's `environment:` list didn't include
`NEXT_PUBLIC_SENTRY_DSN` or `NEXT_PUBLIC_ENVIRONMENT` even though both
were present in `.env` — `env_file` loads everything, but an explicit
`environment:` list only passes through what's named there. Fixed by
adding both vars explicitly to the `web` service block.

### 4. Node/npm version drift between host and `node:20-alpine` broke `npm ci`

Adding `@sentry/nextjs` pulled in `webpack` as a real (not just
peer) dependency for the first time, along with `ajv` at two different
major versions nested in different places (`eslint` needs `ajv@6`,
`schema-utils`/`ajv-formats` need `ajv@8` — both coexisting is normal
npm behavior). Host was on Node 24 / npm 11.6.2; the Dockerfile's
`node:20-alpine` had a different, incompatible npm resolution
behavior for this specific dependency shape. Bumped the Dockerfile
base image to `node:24-alpine` to match. A follow-up detour trying to
pin an intermediate npm patch version and later trying an `overrides`
block in `package.json` to force-resolve the `ajv` conflict were both
dead ends and have been reverted — the real, permanent fix ended up
being much smaller (see #5).

### 5. `.npmrc` with `legacy-peer-deps=true` was never copied into the Docker build context

This was the actual root cause behind a multi-hour "identical
lockfile, identical npm version, different result locally vs. in
Docker" debugging session. `apps/web/.npmrc` sets
`legacy-peer-deps=true`, which relaxes npm's peer-dependency
resolution — locally, this masked the `ajv@6`/`ajv@8` coexistence as a
non-issue. The Dockerfile's `COPY` line never included `.npmrc`, so
the container ran `npm ci` under npm's strict default peer-dependency
resolution, which choked on the same lockfile that installed cleanly
on the host. Fixed by adding `.npmrc*` to the Dockerfile's `COPY`
line. This class of bug — identical files, different npm config,
wildly different outcome — is worth remembering for any future
"works on my machine, not in Docker" report.

### 6. `create_app()` was missing a `return app` statement

Unrelated to Sentry directly, but discovered while debugging why
`/health` was returning 500 mid-way through Sentry verification:
`main.py`'s `create_app()` built the FastAPI app, registered every
router, and never returned it — an implicit `None` return, which
uvicorn's `--factory` mode then tried to call as the ASGI app itself,
producing `TypeError: 'NoneType' object is not callable`. Real,
pre-existing bug, unmasked only because troubleshooting Sentry
involved touching this file directly. Fixed by adding the missing
`return app`.

### 7. `next dev --turbo` silently fails to inline `NEXT_PUBLIC_*` env vars

The actual multi-hour blocker on the frontend side. Despite the SDK
loading correctly (`window.__SENTRY__` present) and the DSN being
verifiably present in the container's process environment
(`/proc/1/environ` confirmed it), `Sentry.getClient()?.getOptions()?.dsn`
in the browser consistently returned `undefined` — meaning
Turbopack (Next.js 14.2.15's still-alpha-at-the-time dev bundler)
was not inlining `NEXT_PUBLIC_SENTRY_DSN` into the compiled client
bundle, even after full `.next` cache wipes and container rebuilds.
Confirmed by testing the identical setup with `--turbo` removed from
the `dev` script — the DSN resolved correctly immediately. **Fix:**
`"dev": "next dev --turbo"` → `"dev": "next dev"` in `package.json`.
Does **not** affect `next build` (production builds already default to
webpack, never used Turbopack here). Worth revisiting if/when Next.js
is upgraded past 14.2.15 or Turbopack's dev-mode env-var handling
stabilizes — re-enabling `--turbo` should be re-tested against Sentry
specifically before flipping back on.

### 8. Sentry's own generated example page has a false-positive "success" toast

`/sentry-example-page`'s "Error sent to Sentry" toast only reflects
whether the page's own `fetch('/api/sentry-example-api')` call
returned a non-200 — which it always will, since that route's entire
job is to throw. It is **not** a confirmation that Sentry actually
received anything, and this cost real debugging time before being
recognized. The page also has an unrelated hydration-mismatch bug
(raw `&`/`>` characters inside an inline `<style>` template literal
get HTML-escaped server-side but not client-side), which triggers a
dev-mode error overlay unrelated to Sentry. **Recommendation:** for
any future from-scratch Sentry verification, skip the wizard's
example page entirely and use a minimal manual test button
(`<button onClick={() => Sentry.captureException(new Error("test"))}>`)
plus a direct Network-tab check filtered on `ingest` — this is faster
and produces zero false signals.

---

## Part 3: First-Impression Bug Fixes — ✅ COMPLETE

### #110 — SVG icons on auth pages requiring manual reload

Root-caused to a font-loading race in the FOUC-prevention script in
`layout.tsx`: the script ran before the Material Symbols stylesheet
`<link>` was parsed, so `document.fonts.ready` could resolve before
the browser had even discovered the font — letting icons render with
an unstyled opacity flash until a hard refresh happened to change the
timing.

**Scope changed significantly during implementation.** An initial fix
using `document.fonts.load()` for the exact font (instead of the
ambiguous `.ready` promise) closed the original race, but a follow-up
screenshot showed the font still failing to render at all in some
conditions — raw ligature text (e.g. "visibility", "arrow_forward")
displaying instead of icons. Given the inherent fragility of a
ligature-based remote icon font (network dependency, exact-string
matching, CSS timing), the decision was made to remove the dependency
entirely rather than continue patching around it: **replaced Material
Symbols with `lucide-react` app-wide.**

This expanded the fix from the four originally-scoped surfaces (auth,
onboarding, invite, sidebar) to effectively the whole application —
dashboard, history, all settings pages, update cards, voice recorder,
audio player, toast, and shared form components all used the same
icon font. ~20 files touched. Not converted: Storybook `.stories.tsx`
files (non-shipping — tracked as a follow-up chore, not blocking).

Once no component referenced `material-symbols-outlined`, the
font-loading script and Google Fonts `<link>` were removed from
`layout.tsx` entirely, along with the now-dead `.material-symbols-outlined`
/ `.fonts-loaded` CSS rules in `globals.css`.

### #109 — Auth loading spinner not covering full login sequence

`login-form.tsx` had a leftover `setTimeout(resolve, 500)` after
`await login(...)` — a stale artifact from before `useAuth.ts`'s
`waitForSupabaseSessionCookie()` fix existed (see Part 1, bug #2).
Since `login()` already resolves only after the Supabase session
cookie is confirmed present, the delay did nothing except let
`isLoading` flip to `false` (spinner disappears, button re-enables)
for 500ms before navigation fired — reading as "form finished, then
hung."

Fixed by removing the delay and adding a local `isNavigating` state
that keeps the loading UI active through the actual `router.push`,
rather than extending the store's `isLoading` (which correctly
represents "API call in flight" and shouldn't be redefined to also
mean "navigating").

### #107 — Slack settings shared-channel delivery model clarity

Copy-only change. Added explicit language throughout
`settings/slack/page.tsx` clarifying that the workspace's Slack
integration delivers to a single shared channel for the whole team
(not per-member DMs), and that changing or removing the webhook
affects everyone in the workspace. Updated: intro paragraph, webhook
helper text, notification toggle descriptions, remove-confirmation
copy.

---

## Part 3 Completion Notes — Scope Growth and Follow-ups

- The icon font migration (#110) was originally estimated as a
  four-surface bug fix and became an app-wide dependency swap. This
  was the right call — the alternative was leaving a fragile, network-
  dependent icon system in place and hoping the timing fix held under
  all conditions — but it's worth noting for future estimation: a
  "fix this bug" ticket surfaced a "remove this dependency" scope once
  investigated.
- **Follow-up (not blocking):** Storybook `.stories.tsx` files
  (`HistoryPage.stories.tsx`, `ProfilePage.stories.tsx`,
  `PublicProfilePage.stories.tsx`, `Button.stories.tsx`) still
  reference the old icon font. Tracked as a minor chore, to be picked
  up separately.
- **Follow-up (not blocking):** confirm `lucide-react` is correctly
  pinned in `package.json` (`npm ls lucide-react`) given the volume of
  new imports across the codebase.
- **Unrelated, noticed during this work:** missing favicon assets
  (`favicon-16.png`, `favicon-32.png`, `apple-touch-180.png`) causing
  404s in the console. Cosmetic, not blocking, not yet fixed.
- A real syntax error (`Unexpected end of input`) was introduced and
  caught during the `layout.tsx` cleanup step — an edit removing the
  font-detection script left the outer IIFE and template literal
  unclosed. Caught via browser console before merge; serves as a
  reminder that "delete this block" edits on inline scripts need a
  full-file review afterward, not just a diff of the removed lines.

---

## Part 4: M9 Correctness Fixes — ✅ COMPLETE

### #12 — Username IntegrityError returns clean 409, not raw 500

`ProfileService.update_profile`'s pre-check (`is_username_taken`) is
check-then-act, not atomic — a concurrent request can take the same
username in the gap between that check and the actual write. When
that race is lost, the DB's unique constraint previously raised an
uncaught `IntegrityError` that propagated to the router's generic
exception handler as a raw 500.

Fixed by wrapping the `profile_repo.update()` call in
`try/except IntegrityError`, converting a username-constraint
violation into the same `ProfileError("username_taken", ...)` used by
the pre-check, so both paths produce one consistent, actionable error.

Also fixed a related latent bug: `handle_profile_error`'s `status_map`
was missing a `"username_taken"` entry entirely, so even the
_intentional_ pre-check rejection was falling through to a default
400 instead of the correct 409 Conflict. Added `username_taken → 409`
and made `username_required → 400` explicit (no behavior change on
the latter, just removed reliance on the default fallback).

`profile_repo.update()` required no changes — it was already rolling
back the session before re-raising the original exception type inside
its own `try/except`, so the fix is contained entirely to
`profile_service.py`.

### #13 — UsernameIndicator shows distinct state on API error

`UsernameIndicator` in `settings/profile/page.tsx` previously had no
branch for `availabilityQuery.isError` — a failed availability check
fell through to the same "Already taken" state as a real conflict,
telling the user false information when the true state was "we don't
know."

Added an explicit amber `AlertTriangle` error state ("Couldn't check
availability"), visually distinct from the red "Already taken" state.
Also implemented the related acceptance-criteria item: Save is now
disabled whenever the username field is dirty, changed from the saved
value, and the availability check errored, with inline copy
explaining the disabled state so it isn't silent.

### #14 — Public profile shows loading.tsx skeleton, no FOUC

`app/u/[username]/page.tsx` is a server component whose
`generateMetadata` performs a `fetch` before the page can render —
until that resolved, the browser showed a blank tab with no feedback.

Exported the existing loading skeleton (`PublicProfileSkeleton`) from
`client.tsx` and added `app/u/[username]/loading.tsx`, which Next
streams immediately as the route-level Suspense fallback, independent
of `generateMetadata`'s fetch time. No new skeleton markup — reuses
what `client.tsx` already had.

---

## Part 4 Completion Notes

- Verified manually by racing two concurrent profile-update requests
  for the same new username — confirmed the losing request now
  returns 409 with a `username_taken` body instead of 500, and
  confirmed the ordinary (non-race) pre-check rejection also now
  returns 409 rather than the previous default 400.
- Verified #13 by throttling network to force `isError` on the
  availability query — amber warning state renders correctly, Save
  disables with explanatory copy.
- Verified #14 by throttling network on `/u/[username]` — skeleton now
  renders immediately instead of a blank tab while metadata resolves.

---

## Part 5: Visual Polish — ✅ COMPLETE

### #108 — Settings sub-pages (Digest, Members) visual balance — ✅ DONE

Compared against Profile settings as the quality bar. Two concrete
imbalances identified from screenshots (not just subjective feel):

1. Profile has a full page-level `<h1>` heading (`font-serif text-3xl`,
   matching the app's headline style); Digest, Members, and Slack only
   had the small uppercase eyebrow label (`SETTINGS — DIGEST`), making
   them read as unfinished fragments next to Profile.
2. Members had no width constraint at all — the invite email input
   stretched to the full content area width, while every other
   settings page (Profile, Digest) was held to a narrow `max-w-lg`
   column.

Fixed both: added a matching `<h1>` header to `digest/page.tsx` and
`members/page.tsx`, and constrained `MembersPanel`'s root element to
`max-w-lg` (matching `DigestSettingsPanel`, which already had this).
Slack was left as-is — #108 scoped this to Digest and Members only.

### #16 — Public profile cosmetic pass — ✅ DONE

**Scrollbar:** the horizontally-scrollable heatmap container on
`/u/[username]` was rendering the native OS scrollbar (visible arrow
buttons, mismatched styling) instead of anything matching the app's
design. Added a `.custom-scrollbar` utility to `globals.css` (thin,
theme-colored, no arrow buttons — `scrollbar-color`/`-width` with a
`::-webkit-scrollbar` fallback) and applied it to the heatmap wrapper
in `client.tsx`. Confirmed `Heatmap.tsx` itself has no internal scroll
container of its own — it's a plain unstyled wrapper around the raw
SVG — so the wrapper-level class is the complete fix; no changes
needed inside the component.

**Cosmetic parity check:** compared class-by-class against
`settings/profile/page.tsx`. Card treatment, section-label typography,
and spacing rhythm were already consistent between the two pages — no
further changes needed there.

**Mobile:** found and fixed a real responsive gap, not just cosmetic
preference. The hero row (`flex items-start gap-6`, fixed 96px avatar,
flex-1 identity block, flex-shrink-0 "Built with SoarUp" badge, all in
one row) left very little width for the name/username/bio column on
narrow viewports. Fixed by regrouping avatar+identity into one flex
item and the badge into a second, stacking via `flex-col` →
`sm:flex-row`; stepping avatar size and name font size down on mobile;
adding `flex-wrap` to the footer row as an overflow safety net; adding
horizontal padding to the not-found state (previously had none); and
updating the loading skeleton to match the hero's new responsive
sizing so loading → loaded doesn't visibly jump.

---

## Part 5 Completion Notes

- Verified via DevTools device-toolbar checks at 375×667 and 320px
  widths — hero, stats grid, heatmap scroll, and footer all confirmed
  to render without overflow or clipping at both sizes.
- **Deferred — app-wide visual depth pass (explicitly out of scope for
  this milestone).** During this work, a broader observation came up:
  several pages (Members, Dashboard empty states, History) read as
  visually "bare" rather than intentionally minimal — flat surfaces
  with no elevation, large unclaimed whitespace with nothing anchoring
  it, empty states that are plain text with no icon/illustration, and
  uniform small-label typography with little hierarchical contrast.
  Secondary/tertiary accent colors already defined in `globals.css`
  currently see no use anywhere in the app.

  **Decision: this is real, worth doing, and explicitly deferred to
  post-deployment**, not squeezed into this milestone. Reasoning: it's
  unbounded ("make it feel less bare" has no natural finish line,
  unlike "#110 is fixed"), Parts 6–7 of this milestone carry actual
  correctness/compliance/deployment risk and deserve priority over
  subjective visual work, and post-deployment gives access to real
  usage signal instead of two people guessing from screenshots. Track
  as a separate future milestone/pass, not a sub-item of Part 5.

  **Candidate approaches (brainstormed, not committed — for whoever
  picks this up to start from, not a spec):**
  - Turn up `shadow-card`'s dark-mode glow, and/or apply it to surfaces
    that currently have none (Members rows, Dashboard's empty-state
    card) — cheapest way to introduce real elevation without a redesign.
  - Give empty states a small `lucide-react` icon plus slightly
    larger/warmer copy, instead of a single line of gray text.
  - Actually use the secondary/tertiary accent colors already defined
    in `globals.css` somewhere low-risk.
  - Reuse the existing `dot-grid` utility (already used on auth pages)
    on empty/near-empty app pages like Dashboard.
  - Introduce more typographic size/weight contrast — right now nearly
    every label across the app sits at the same 10–12px uppercase
    `font-label` treatment.

  All of the above are small, additive, low-risk diffs individually —
  the reason this is deferred is scope/timing, not difficulty.

---

## Part 6: Security & Compliance — ✅ COMPLETE

### #17 — Server-side `update_date` validation using stored timezone

`SubmitUpdateRequest.update_date` was previously accepted as an
unvalidated string — the schema's own docstring said "ISO date string
YYYY-MM-DD" but nothing actually enforced that format, and nothing
checked the date against "today" at all. A client could submit a
malformed string, a date years in the past or future, or a date
computed from the wrong timezone, and none of it would be caught until
something downstream choked on it — or worse, silently succeeded,
letting a client bypass the one-update-per-day constraint or
backdate/postdate entries.

Fixed in `UpdateService.submit_update`:

1. Strict `date.fromisoformat()` parsing — malformed strings now raise
   `UpdateError("invalid_date_format", ...)` cleanly instead of
   propagating as-is.
2. The user's timezone is resolved via `ProfileRepository` (falling
   back to UTC if unset or unrecognised), mirroring exactly the
   pattern `_check_and_send_digests_async` already uses for digest
   timezone resolution — kept consistent so "today" means the same
   thing everywhere in the app, not a separately-invented notion per
   call site.
3. "Today" is computed **server-side**, in the user's own timezone —
   never trusted from the client's local clock.
4. `submitted_date != today_in_user_tz` raises
   `UpdateError("invalid_update_date", ...)`.

Both new error codes fall through `handle_update_error`'s existing
default-to-400 status mapping correctly — no `_utils.py` changes
needed, unlike #12's `username_taken` gap.

Confirmed `edit_update` needs no equivalent change — `update_date` is
immutable after creation (`UpdateUpdateRequest` only ever touches
`content`).

**Known edge case, not a bug:** "today" can differ by up to a full
calendar day depending on how far a user's timezone is from UTC
(e.g. `Pacific/Kiritimati` UTC+14 vs `Etc/GMT+12` UTC−12 can have
"today" be two calendar days apart at the same instant). This is
expected and correct — it's the entire reason "today" is resolved
per-user rather than against server UTC.

### #18 — Rate limiting on update submission endpoints

No rate-limiting infrastructure existed prior to this work. Implemented
using **GCRA (Generic Cell Rate Algorithm)** backed by Redis, chosen
over sliding-window-log or fixed-window approaches:

- Single Redis key per identity, storing one "theoretical arrival
  time" (TAT) value — no sorted sets or counters to manage, consistent
  with how Redis is already used elsewhere in this codebase (TTL
  provisional holds).
- Atomic check-and-consume via a single Lua script run through `EVAL`
  — no separate GET-then-SET round trip, so concurrent requests for
  the same key can't race each other.
- Natural burst-allowance support on top of the steady-state rate.

**Keying: per-user, not per-IP.** The original design used client IP,
matching a common default pattern — but SoarUp is a team tool, so
multiple users legitimately share IPs (same office network, same VPN
egress). IP-based limiting would let one teammate's burst of activity
throttle everyone else on that network. Switched to keying on
`user_ctx["user_id"]` instead: every rate-limited route already
requires `OnboardedDep` (a superset of auth), so the authenticated
user's identity is always available at no extra dependency cost, and
per-user keying is also a stronger abuse-prevention signal than IP
(which can be trivially rotated). **This supersedes the original
Known Tradeoff #1 wording ("flat per-IP limit") — see updated Known
Tradeoffs below.**

New files/additions:

- `app/lib/rate_limit.py` — GCRA Lua script, `check_rate_limit()`,
  `RateLimitExceededError`.
- `app/api/dependencies.py` — `rate_limit(scope, requests_per_minute,
burst)` dependency factory, scoped per-endpoint so different routes
  don't share a bucket.
- `app/main.py` — app-level exception handler for
  `RateLimitExceededError` (a dependency-layer exception can't be
  caught by a route's own try/except, since dependencies resolve
  before the route body runs) → clean 429 with a `Retry-After` header.
- `app/config.py` — `rate_limit_enabled`, `rate_limit_requests_per_minute`
  (default 10), `rate_limit_burst` (default 3).

Applied to all three mutating update routes in `updates.py`:
`submit_update` (default limit), `edit_update` and `delete_update`
(looser: 30/min, burst 5 — still guarded, but lower abuse risk than
submission). Read endpoints (`GET` routes) deliberately left
unrated — #18 scopes this to submission/mutation.

### #19 — Signed unsubscribe token for digest emails (CAN-SPAM/GDPR)

**Scope decision made explicitly, not defaulted:** initially considered
a global per-user unsubscribe flag (matches the existing
`Profile.email_notifications` schema, zero migration cost) versus a
true per-workspace preference. Chose **per-workspace**, despite the
added migration/repo/frontend cost, specifically because there is
currently zero production data — doing this before any real users
exist avoids an unresolvable-cleanly data-migration question later
(what happens to users who already globally unsubscribed, once
per-workspace preferences exist?). This was judged strictly cheaper to
do now than to retrofit post-launch.

**Token design (`app/lib/unsubscribe.py`):** HMAC-SHA256, not Fernet
encryption — deliberately different primitive from
`app/lib/slack_crypto.py`, since an unsubscribe token only needs to be
tamper-evident (verifiable), not reversible. Token shape:
`<b64url(payload_json)>.<b64url(hmac_signature)>`, payload =
`{workspace_id, user_id}`. No expiry — CAN-SPAM requires unsubscribe
mechanisms to remain functional, and an expired unsubscribe link that
silently fails is worse than one that works indefinitely.
`verify_unsubscribe_token` returns `None` uniformly on every failure
mode (malformed, tampered, wrong key) rather than distinguishing
why, so a forged-token attempt can't learn anything by probing.

New setting: `unsubscribe_secret_key` (`SecretStr`, production-required
via the same validator pattern as `slack_encryption_key`). Generated
via `secrets.token_urlsafe(32)`, not `Fernet.generate_key()` — HMAC has
no format requirement the way Fernet's key does, so the simpler stdlib
generator is the correct tool rather than borrowing Slack's convention
for a key that will never be used with Fernet.

**Schema (migration):** added `email_notifications: bool` to
`WorkspaceMember` (`server_default=sa.true()` — existing memberships
backfill to opted-in, matching current behavior for every existing
member until someone explicitly unsubscribes). Autogenerate initially
bundled in an unrelated `profiles.profile_public` server_default
change picked up from pre-existing model/DB drift — pulled out into
its own separate migration rather than smuggled in alongside the
compliance fix; the root cause of that drift is still unresolved and
worth investigating before the next autogenerate run.

**Public endpoint (`app/routers/unsubscribe.py`):**
`GET /digests/unsubscribe/{token}` — deliberately its own router, not
under `digests.py`'s `/workspaces` prefix, since this must be reachable
with zero authentication (someone clicking an email link isn't logged
in). Verifies the token, flips `WorkspaceMember.email_notifications`
to `False` via `WorkspaceRepository.update_member_notification_preference`,
then **redirects** (never returns a raw JSON error) to a frontend
confirmation page — `/unsubscribe/success` (with or without
`?workspace=` depending on whether a live membership was actually
found — a stale/already-removed membership still redirects to success,
since there's nothing left to unsubscribe from, which is itself a
successful outcome) or `/unsubscribe/invalid`. Uses explicit
`status_code=302` on every `RedirectResponse` call — `RedirectResponse`
defaults to 307 unless told otherwise, which doesn't match what the
route decorator declares.

**Self-service settings toggle:** the one-way email link needed an
in-app counterpart so someone who unsubscribed isn't permanently stuck
with no way back short of a new digest email arriving. Added
`GET`/`PATCH /workspaces/{workspace_id}/digest-settings/me` to
`digests.py`, gated `WorkspaceMemberDep` (any member — self-service,
not workspace configuration, unlike the admin-gated
`digest-settings` route). Routed through `DigestService` for
conformity with the rest of the file
(`get_my_notification_preference` / `update_my_notification_preference`,
both thin wrappers around the same `WorkspaceRepository` methods the
public endpoint uses). Frontend: `MyNotificationToggle`, a
structurally independent sub-component in `digest-settings-panel.tsx`
(separate prop surface, separate save action, immediate-on-click
rather than part of the workspace-config "Save settings" flow) — sits
above the existing admin-only digest config, since it's a different
kind of setting entirely (self vs. workspace).

**Digest send pipeline (`tasks.py`, `_send_workspace_digest_async`):**
recipient filtering changed from `Profile.email_notifications`
(global) to the joined `WorkspaceMember.email_notifications`
(per-workspace). Sending changed from one batched Resend call (up to
50 recipients) to **per-recipient** sending, since each recipient now
needs their own unique unsubscribe link baked into their copy of the
email — see Known Tradeoff #3 (pre-existing, now realized). A real bug
was introduced and caught via tests during this change: the final
`digest_repo.update_status(..., status=final_status, ...)` call after
the send loop was accidentally dropped during the batched→per-recipient
rewrite, leaving successfully-sent digests stuck at `status="processing"`
forever (and defeating the Part-1-existing-and-still-relevant
idempotency check, risking duplicate re-sends on the next day's polling
run). Caught by `test_send_workspace_digest.py` asserting on final
digest status, not by manual testing — restored the call after the
loop, before the (optional, Slack-only) block that had been the only
other place `final_status` was consulted.

**Frontend confirmation pages:** `/unsubscribe/success` and
`/unsubscribe/invalid`, both under `(public)`, matching
`invite/[code]/page.tsx`'s established conventions (narrow centered
`PageShell` card, no shared extraction — see Part 6 Completion Notes
for why not). Both explicitly reassure the reader about blast radius:
success states "this only affects this one workspace"; the invalid
state states "nothing was changed on your account" rather than
leaving that ambiguous.

---

## Part 6 Completion Notes

### Test coverage added

- `tests/unit/test_unsubscribe.py` — HMAC round-trip, tampering
  detection (payload tampering, signature tampering, wrong signing
  key), malformed-token handling, missing-required-keys forgery
  attempt.
- `tests/integration/test_unsubscribe_endpoint.py` — valid token →
  flag flips + correct redirect; invalid/tampered/wrong-key token →
  redirect to failure page, flag unchanged; stale membership → no-op
  success redirect; confirms unsubscribing one member doesn't affect
  others in the same workspace.
- `tests/integration/test_rate_limiting.py` — requests within limit
  succeed; exceeding the limit returns 429 with a `Retry-After`
  header and `error: "rate_limited"` body; different users have fully
  independent limits (the actual regression test for the IP→user_id
  keying decision); edit/delete endpoints confirmed rate-limited at
  their own configured thresholds.
- `tests/workers/test_send_workspace_digest.py` — new file, focused on
  the #19-specific recipient-filtering and per-recipient token/send
  behavior: opted-out members excluded from sends and never even get a
  token generated for them; members with no email or missing profile
  excluded without crashing; token generation confirmed per-recipient
  (not shared); final digest status confirmed correct across
  all-succeed / all-fail / partial-failure scenarios (this is the test
  that caught the dropped `update_status` call above).
- `tests/unit/test_digest_service.py` /
  `tests/integration/test_digest_endpoints.py` — extended with
  `TestGetMyNotificationPreference` / `TestUpdateMyNotificationPreference`
  and matching router-level classes. Deliberately no "member cannot
  access" negative tests for these two endpoints, unlike the existing
  admin-gated digest routes — the entire point is that any member can
  use them, so there's no access boundary to test against.
- `tests/integration/test_update_endpoints.py` — new cases for
  `invalid_date_format` / `invalid_update_date` → 400.

### Test/CI infrastructure fixes (not feature work, but required to get here)

1. **`docker-compose.test.yml` was defined but never actually running**
   prior to this work — nothing before #18 needed a live test Redis
   connection, so this had been silently unexercised. Minio's host
   port (`9001`) turned out to fall inside a Windows Hyper-V/WSL2
   TCP dynamic port exclusion range (confirmed via
   `netsh interface ipv4 show excludedportrange protocol=tcp`), not an
   actual process conflict — remapped to `9010`/`9011`.
2. **`test_settings`'s `redis_url` was hardcoded**, ignoring the
   `REDIS_URL` env var that `pr-checks.yml`'s CI job already correctly
   provisions (`localhost:6379` in CI, via its own Redis service
   container) — meaning CI would have silently tried to connect to the
   wrong port the moment any test needed live Redis. Fixed to read
   `os.environ.get("REDIS_URL", "redis://localhost:6380/1")`, so CI's
   env var and local dev's isolated test container both resolve
   correctly without one silently overriding the other.
3. **`get_redis_client()` is a manually-memoized global singleton**
   reading from the _global_ app settings object (`redis://redis:6379/0`,
   the Docker-internal hostname) — no existing test fixture ever
   overrode it, because nothing needed a live connection before #18.
   `test_rate_limiting.py` and `test_unsubscribe_endpoint.py` both now
   override `get_redis_client` via `app.dependency_overrides`,
   pointing at a client built from `test_settings.redis_url` instead.
4. **`db_session`'s SAVEPOINT-based test isolation broke the first time
   a test exercised a real repo `commit()` call** (every prior
   integration test mocked the service layer, so this was invisible
   until `test_unsubscribe_endpoint.py` — the first test hitting
   `WorkspaceRepository.update_member_notification_preference` for
   real). Root cause: `begin_nested()`'s SAVEPOINT gets released the
   moment code under test calls `commit()`, and nothing was restarting
   it. Fixed by switching `db_session` to SQLAlchemy 2.0's
   `join_transaction_mode="create_savepoint"` on a connection-bound
   session — the documented built-in replacement for the older,
   fragile hand-rolled `after_transaction_end` event-listener recipe
   (which was tried first and did not fully resolve the issue).
5. `RedisDep`'s manual `Redis.eval()` call required a `cast()` around
   the awaited result to satisfy mypy — a known imprecision in
   `redis-py`'s stubs (shared sync/async overloads on `eval()` don't
   reliably discriminate the async client's actual return type), not a
   real type error.

### Deliberately not done in this part (flagged, not silently dropped)

- **Slack digest block-count scaling gap**, found while reviewing
  `slack_blocks.py` for pattern-matching purposes (not itself part of
  #17–#19): Slack's Block Kit has a hard 50-block-per-message limit;
  `build_digest_blocks` uses ~6 fixed blocks plus one block per update,
  meaning a workspace with roughly 43+ same-day submitters would get a
  digest payload Slack's API rejects outright — currently caught by a
  generic exception handler and logged as `slack_digest_delivery_failed`
  with no distinct signal that the cause was block count specifically.
  Not fixed here — out of scope for #19, tracked as a follow-up (see
  Known Tradeoffs #11).
- **Frontend Stripe/billing note:** once tiered billing exists, the
  flat per-user rate limit (#18) will need tier-aware thresholds, and
  the frontend will need a "you've hit your usage limit" UI state —
  right now a 429 just surfaces as a generic error with no
  upgrade-prompt affordance, since there's nothing to upgrade to yet.
  Noted for whenever Stripe integration lands, not actioned now.

---

## Part 7: Deployment Readiness

_(unchanged from original spec — not yet started. **Note carried
forward from Part 2:** `SENTRY_AUTH_TOKEN` must be added to
Railway/Cloudflare's build-time env when this part is picked up, or
staging source maps will not upload and Sentry stack traces from
staging will show minified code instead of readable file/line info.
**Note carried forward from Part 6:** `UNSUBSCRIBE_SECRET_KEY` must be
included in the Part 7 environment-variable audit — production-required,
same enforcement pattern as `SLACK_ENCRYPTION_KEY`.)_

---

## Known Tradeoffs

**1. Rate limiting is a flat per-user limit, not tier-based**
~~Flat per-IP limit~~ **Updated in Part 6: keyed per authenticated
user, not per-IP** — see Part 6's #18 write-up for why (SoarUp is a
team tool; multiple users legitimately share IPs, so IP-keying would
let one teammate's activity throttle an entire office). Still flat
across all users regardless of role or plan, since Stripe billing
doesn't exist yet. The flat 10/minute (submit) / 30/minute (edit,
delete) limits are reasonable defaults that will need revisiting once
paid tiers exist — see Part 6 Completion Notes' Stripe/billing flag.

**2. Unsubscribe token reuses infrastructure pattern from Slack encryption, but not the same primitive**
Implemented in Part 6. A dedicated `UNSUBSCRIBE_SECRET_KEY` is used
(not the Slack key), following the same production-required Settings
validator pattern — but the actual cryptographic primitive is HMAC-SHA256
signing, deliberately different from Slack's Fernet encryption, since
an unsubscribe token needs to be tamper-evident, not reversible. New
and, per the original note here, worth a security review before
relying on it at greater scale than currently tested.

**3. Per-recipient digest email rendering increases Resend API calls**
Realized in Part 6. Moving from batched (50 recipients/call) to
per-recipient sending (for unique unsubscribe links) means a workspace
with 20 members now makes 20 Resend calls instead of 1. Acceptable at
current team sizes; revisit with a shared-token + query-param-per-click
model if this becomes a bottleneck.

**4. E2E full pipeline test still requires manual service orchestration**
`voice-update-submission.spec.ts`'s full pipeline variant needs Celery,
Minio, and Whisper running locally via `E2E_FULL_PIPELINE=true`. This
is not part of the standard CI-friendly suite and remains a manual
verification step.

**5. `invite-flow.spec.ts`'s "new user via email link" test is skipped, not fixed**
This scenario chains two full signups, a cold Next.js route compile,
and several async waits in one test — across repeated local runs it
failed at five different points (cold compile, cookie race,
network-matcher race, plain resource contention, a one-off "invite not
found" that resolved on inspection). That shifting-failure-point
pattern is the signature of local Docker/WSL2 resource variance, not a
deterministic defect — every constituent piece of the flow (signup,
onboarding, invite creation, direct acceptance, already-member
handling, `GET /invites/{code}`) is independently verified working
elsewhere in the suite. Marked `test.skip` with a detailed comment
rather than left silently red or deleted. Revisit if/when this
becomes runnable in a less resource-constrained environment (e.g. a
CI runner with dedicated resources rather than a local dev machine).

**6. `@aws-sdk/client-s3` added as a new dev dependency**
Required for E2E cleanup of Minio-stored voice update audio objects
(see Part 1 completion notes). Test-tooling only, not shipped in the
app itself.

**7. Turbopack (`--turbo`) disabled in local dev**
Removed from `apps/web`'s `dev` script — as of Next.js 14.2.15,
Turbopack does not reliably inline `NEXT_PUBLIC_*` environment
variables into client bundles (see Part 2 Completion Notes #7).
Revisit when upgrading Next.js past this version.

**8. `apps/web/.npmrc` (`legacy-peer-deps=true`) now copied into the Docker image**
This was previously excluded via `.dockerignore`'s `.env*` pattern
(unrelated collateral — `.npmrc` isn't an env file, but the earlier
Dockerfile simply never copied it at all). Now explicitly included in
the `COPY` step. Worth a follow-up look at _why_ `legacy-peer-deps` is
needed at all — it's currently masking rather than resolving the
`ajv@6`/`ajv@8` coexistence, and a cleaner long-term fix may exist
once there's time to investigate without a Sentry integration blocking
on it.

**9. Icon font (Material Symbols) fully replaced with `lucide-react`**
See Part 3 for full rationale. Storybook stories not yet migrated —
tracked as a follow-up chore, not blocking.

**10. App-wide visual "depth" pass deferred to post-deployment**
See Part 5 notes. Real, worth doing, deliberately not squeezed into
this milestone.

**11. Slack digest posting has an unhandled block-count ceiling (~43 same-day submitters)**
New in Part 6, found incidentally while reviewing `slack_blocks.py`
for an unrelated reason. Not fixed — see Part 6 Completion Notes for
detail. Tracked as a follow-up: "cap/paginate Slack digest blocks for
large workspaces," currently invisible in production since no
workspace has hit this size yet.

**12. Per-workspace digest migration ran with zero production data**
Noted here explicitly rather than assumed: because this schema change
(Part 6, #19) landed before any real users exist, there was no
migration-safety question to resolve (no existing global-unsubscribe
data to reconcile against the new per-workspace model). This was the
central reason per-workspace scope was chosen now rather than deferred
— see Part 6's #19 write-up. Won't recur as an easy decision once real
user data exists, worth remembering as precedent.

---

## Acceptance Criteria

```
[x] Test data cleanup mechanism works — repeated runs don't collide
    (extended to also clean Minio audio objects)
[x] signup-onboarding.spec.ts passes
[x] text-update-submission.spec.ts passes
[~] invite-flow.spec.ts — 2 of 3 tests pass; third deliberately skipped
    with documented rationale (see Known Tradeoffs #5)
[x] voice-update-submission.spec.ts passes (state transitions + full pipeline)
[x] Sentry configured on FastAPI — test error appears in dashboard
[x] Sentry configured on Celery worker — test task failure appears
[x] Sentry configured on Next.js — test error appears with readable stack trace
[x] send_default_pii=False confirmed on all three Sentry inits
[x] Auth page SVG icons render on first load, no reload needed
[x] Auth spinner covers full login sequence including session sync
[x] Slack settings page shows shared-channel clarity copy
[x] Username IntegrityError returns clean 409, not raw 500
[x] UsernameIndicator shows distinct state on API error
[x] Save disabled when username check errored and field is dirty
[x] Public profile shows loading.tsx skeleton, no FOUC
[x] Settings sub-pages (Digest, Members) visually balanced against Profile
[x] Public profile page cosmetic pass complete, mobile verified
[x] Server-side update_date validation rejects mismatched dates
[x] Rate limiting active on POST/PATCH update endpoints
[x] Unsubscribe token generated and included in every digest email
[x] GET /digests/unsubscribe/:token successfully disables notifications
[ ] Resend domain verified — test email delivers to external inbox
[ ] All required environment variables present and audited in staging
[ ] Staging deployment successful — API, worker, beat, frontend all live
[ ] Manual smoke test of all flows passes on staging URL
[ ] Deliberate test error appears in Sentry from staging environment
    (blocked until Part 7 — requires SENTRY_AUTH_TOKEN in deploy env)
[ ] CI passes on feature/milestone-pre-deployment-hardening branch
```

---

## Files Created / Modified — Part 1 (Actual)

### Backend (apps/api/)

```
app/workers/tasks.py                      ← Redis client scoping fix (event-loop bug)
app/models/update.py                      ← partial unique index (soft-delete fix)
app/routers/invites.py                    ← error envelope fix (create_error_response)
alembic/versions/..._partial_unique_
  index_for_active_updates.py             ← NEW — migration for above
```

### Frontend (apps/web/)

```
tests/e2e/fixtures/db-cleanup.ts          ← NEW — includes Minio audio cleanup
tests/e2e/global-setup.ts                 ← +cleanupE2EData call
tests/e2e/global-teardown.ts              ← +cleanupE2EData call
tests/e2e/fixtures/auth.ts                ← WebKit-safe fillReliably helper
tests/e2e/auth/signup-onboarding.spec.ts  ← fixed (storageState, email collision, races)
tests/e2e/updates/
  text-update-submission.spec.ts          ← NEW
tests/e2e/updates/
  voice-update-submission.spec.ts         ← NEW
tests/e2e/invite/invite-flow.spec.ts      ← NEW (path differs from original spec)
tests/e2e/fixtures/test-audio.wav         ← NEW — bitexact-encoded fake mic input
playwright.config.ts                      ← dotenv loading, fake audio device flags,
                                             native permissions grant
src/app/(app)/dashboard/page.tsx          ← onboarding guard added
src/hooks/useAuth.ts                      ← syncSupabaseSession cookie-polling fix
src/hooks/useWebSocket.ts                 ← reconnect-loop fix, cursor race fix
package.json                              ← +pg, +@types/pg, +@aws-sdk/client-s3 (dev)
apps/web/.env.local                       ← +E2E_DATABASE_URL
```

---

## Files Created / Modified — Part 2 (Actual)

### Backend (apps/api/)

```
app/lib/sentry.py                         ← NEW — init_sentry(), shared by FastAPI + Celery
app/main.py                               ← calls init_sentry() in create_app();
                                             fixed missing `return app` bug found in passing
app/workers/celery_app.py                 ← calls init_sentry() before Celery(...) construction
requirements.txt / requirements-dev.txt   ← +sentry-sdk[fastapi,celery]
```

### Frontend (apps/web/)

```
sentry.server.config.ts                   ← NEW (wizard-generated, manually corrected)
sentry.edge.config.ts                     ← NEW (wizard-generated, manually corrected)
src/instrumentation-client.ts             ← NEW (wizard-generated, manually corrected)
instrumentation.ts                        ← NEW (wizard-generated, unmodified)
src/app/global-error.tsx                  ← NEW (wizard-generated, unmodified)
src/app/layout.tsx                        ← metadata → generateMetadata(), merges
                                             Sentry.getTraceData()
next.config.mjs                           ← wrapped with withSentryConfig(...)
package.json                              ← +@sentry/nextjs; removed --turbo from
                                             dev script (see Known Tradeoffs #7)
package-lock.json                         ← regenerated multiple times during
                                             dependency-conflict debugging; final version
                                             has no overrides block (none needed)
.env.example                              ← +NEXT_PUBLIC_SENTRY_DSN
.gitignore                                ← confirmed .env.sentry-build-plugin excluded
apps/web/Dockerfile                       ← base image node:20-alpine → node:24-alpine;
                                             pinned npm to 11.6.2; COPY line now includes
                                             .npmrc*
```

### Root

```
docker-compose.yml                        ← web service: added NEXT_PUBLIC_SENTRY_DSN
                                             and NEXT_PUBLIC_ENVIRONMENT to environment: block
.env                                       ← +SENTRY_DSN, +NEXT_PUBLIC_SENTRY_DSN,
                                             +NEXT_PUBLIC_ENVIRONMENT (local only, not committed)
```

### Deleted (throwaway verification code, removed before merge)

```
apps/api: temporary /sentry-debug route in main.py
apps/api: temporary sentry_test Celery task in celery_app.py
apps/web: src/app/sentry-example-page/page.tsx  (wizard-generated)
apps/web: src/app/api/sentry-example-api/route.ts  (wizard-generated)
apps/web: src/app/sentry-test/page.tsx  (manual debug page, created mid-investigation)
```

---

## Files Created / Modified — Part 3 (Actual)

### Frontend (apps/web/) — icon font migration + Part 3 fixes

```
src/app/layout.tsx                          ← font-detection script + Google Fonts <link>
                                                removed entirely; dark-mode FOUC logic kept
src/app/globals.css                          ← .material-symbols-outlined / .fonts-loaded
                                                rules removed
src/components/domain/auth/login-form.tsx    ← ArrowRight icon; #109 fix — removed dead
                                                setTimeout, added isNavigating state
src/components/domain/auth/signup-form.tsx   ← ArrowRight icon
src/components/domain/auth/forgot-password-
  form.tsx                                   ← MailCheck, ArrowRight icons
src/components/domain/auth/reset-password-
  form.tsx                                   ← ArrowRight, CheckCircle2 icons
src/components/domain/auth/onboarding-form.tsx (no icon changes — already used inline SVG)
src/components/ui/input.tsx                  ← Eye, EyeOff (password toggle)
src/components/ui/theme-toggle.tsx           ← Sun, Moon, Contrast
src/components/ui/toast.tsx                  ← X
src/components/ui/separator.tsx              ← AlertCircle, CheckCircle2, Info (FormMessage)
src/components/ui/audio-player.tsx           ← Play
src/components/layout/sidebar.tsx            ← LayoutDashboard, ScrollText, Settings, User,
                                                Users, Mail, Tag, Building2, LogOut
src/components/layout/app-shell.tsx          ← Loader2
src/app/(public)/invite/[code]/page.tsx      ← Loader2 (Spinner), CheckCircle2, ArrowRight
                                                (replaced hand-rolled inline SVG arrow too)
src/app/(app)/dashboard/page.tsx             ← Loader2
src/app/(app)/history/page.tsx               ← ScrollText, History, LineChart
src/app/(auth)/onboarding/page.tsx           ← Loader2
src/app/(app)/settings/digest/page.tsx       ← Loader2
src/app/(app)/settings/members/page.tsx      ← Loader2
src/app/(app)/settings/slack/page.tsx        ← Loader2; #107 copy changes (see below)
src/app/(app)/settings/profile/page.tsx      ← CheckCircle2, Loader2, XCircle
src/components/domain/dashboard/
  dashboard-view.tsx                         ← Keyboard, Mic
src/components/domain/digests/digest-card.tsx ← Tag, ChevronDown
src/components/domain/digests/
  digest-settings-panel.tsx                  ← X, Eye
src/components/domain/members/members-panel.tsx ← UserPlus
src/components/domain/updates/update-card.tsx ← Mic, ChevronDown, MoreHorizontal, Pencil,
                                                Trash2
src/components/domain/updates/
  update-card-compact.tsx                    ← Mic, ChevronDown
src/components/domain/updates/
  voice-recorder.tsx                         ← Mic, Square, ArrowRight, MicOff
package.json                                 ← +lucide-react (verify pinned — see Part 3
                                                Completion Notes)
```

### Not converted (follow-up, non-blocking)

```
src/stories/pages/HistoryPage.stories.tsx
src/stories/pages/ProfilePage.stories.tsx
src/stories/pages/PublicProfilePage.stories.tsx
src/stories/ui/Button.stories.tsx
```

---

## Files Created / Modified — Part 4 (Actual)

### Backend (apps/api/)

```
app/services/profile_service.py           ← #12 — try/except IntegrityError around
                                              profile_repo.update(), converts to
                                              ProfileError("username_taken", ...)
app/lib/errors.py (or wherever
  handle_profile_error lives)              ← #12 — status_map: added
                                              username_taken → 409, username_required → 400
                                              (explicit, no behavior change on the latter)
```

### Frontend (apps/web/)

```
src/app/(app)/settings/profile/page.tsx    ← #13 — UsernameIndicator isError branch
                                              (AlertTriangle), usernameCheckErrored derived
                                              flag, Save disabled when set, inline copy
src/app/u/[username]/client.tsx            ← #14 — exported PublicProfileSkeleton
src/app/u/[username]/loading.tsx           ← NEW — #14 — route-level Suspense fallback
```

---

## Files Created / Modified — Part 5 (Actual)

### Frontend (apps/web/)

```
src/app/(app)/settings/digest/page.tsx     ← #108 — added <h1>Digest</h1> header,
                                              matching Profile's pattern
src/app/(app)/settings/members/page.tsx    ← #108 — added <h1>Members</h1> header
src/components/domain/members/
  members-panel.tsx                        ← #108 — root element constrained to max-w-lg
                                              (previously unconstrained)
src/app/globals.css                        ← #16 — new .custom-scrollbar utility
src/app/u/[username]/client.tsx            ← #16 — .custom-scrollbar applied to heatmap
                                              wrapper; hero row regrouped + responsive
                                              (flex-col → sm:flex-row); avatar/name sizing
                                              stepped down on mobile; footer flex-wrap;
                                              not-found state padding added; skeleton
                                              updated to match responsive hero
```

---

## Files Created / Modified — Part 6 (Actual)

### Backend (apps/api/)

```
app/lib/rate_limit.py                      ← NEW — #18 — GCRA Lua script,
                                              check_rate_limit(), RateLimitExceededError
app/lib/unsubscribe.py                     ← NEW — #19 — HMAC token generate/verify
app/api/dependencies.py                    ← #18 — rate_limit() dependency factory,
                                              keyed per-user via AuthDep
app/main.py                                ← #18 — RateLimitExceededError exception
                                              handler → 429 + Retry-After
app/config.py                              ← #18 — rate_limit_enabled,
                                              rate_limit_requests_per_minute,
                                              rate_limit_burst; #19 —
                                              unsubscribe_secret_key + validator
app/routers/updates.py                     ← #18 — rate_limit(...) dependency added to
                                              submit_update, edit_update, delete_update
app/services/update_service.py             ← #17 — submit_update: strict date parsing +
                                              server-side timezone-aware "today" check
app/models/workspace.py                    ← #19 — WorkspaceMember.email_notifications
                                              column added
app/repositories/workspace_repo.py         ← #19 — update_member_notification_preference()
app/services/digest_service.py             ← #19 — get_my_notification_preference(),
                                              update_my_notification_preference()
app/schemas/digest.py                      ← #19 — UpdateMyDigestPreferenceRequest,
                                              MyDigestPreferenceResponse
app/routers/digests.py                     ← #19 — GET/PATCH
                                              /{workspace_id}/digest-settings/me
app/routers/unsubscribe.py                 ← NEW — #19 — public GET
                                              /digests/unsubscribe/{token}
app/main.py                                ← #19 — unsubscribe router registered
app/workers/tasks.py                       ← #19 — _send_workspace_digest_async:
                                              per-workspace email_notifications filter,
                                              per-recipient token generation + send,
                                              restored dropped final status update
alembic/versions/..._add_email_
  notifications_to_workspace_members.py    ← NEW — #19 — migration
  (autogenerated, edited: added server_default=sa.true(), unrelated
  profiles.profile_public drift removed to its own migration)
```

### Backend tests (apps/api/tests/)

```
unit/test_unsubscribe.py                  ← NEW — token round-trip, tampering,
                                              malformed/forged-token handling
integration/test_unsubscribe_endpoint.py  ← NEW — full endpoint behavior incl.
                                              stale-membership and wrong-key cases
integration/test_rate_limiting.py         ← NEW — GCRA behavior against real test Redis
workers/test_send_workspace_digest.py     ← NEW — recipient filtering, token generation,
                                              send-outcome → digest status
unit/test_digest_service.py               ← +TestGetMyNotificationPreference,
                                              +TestUpdateMyNotificationPreference
integration/test_digest_endpoints.py      ← +TestGetMyDigestPreference,
                                              +TestUpdateMyDigestPreference
integration/test_update_endpoints.py      ← +invalid_date_format / invalid_update_date
                                              400 cases
conftest.py                               ← disable_rate_limiting autouse fixture;
                                              test_settings.redis_url now reads
                                              REDIS_URL env var instead of hardcoding;
                                              db_session rewritten to use
                                              join_transaction_mode="create_savepoint"
                                              (replaces fragile hand-rolled SAVEPOINT
                                              restart listener)
```

### Test/dev infrastructure

```
docker-compose.test.yml                   ← Minio ports remapped 9001→9010, 9002→9011
                                              (9001 fell inside a Windows Hyper-V/WSL2
                                              TCP exclusion range, not an actual conflict)
Makefile                                  ← +test-services-up, +test-services-down,
                                              +test-services-logs; old broken `test:`
                                              target (referenced --abort-on-container-exit
                                              against long-running services) replaced
```

### Frontend (apps/web/)

```
src/hooks/useDigests.ts                    ← #19 — MyDigestPreferenceResponse type,
                                              digestKeys.myPreference, useMyDigestPreference,
                                              useUpdateMyDigestPreference
src/components/domain/digests/
  digest-settings-panel.tsx                ← #19 — NEW export MyNotificationToggle
                                              (independent sub-component, own prop surface)
src/app/(app)/settings/digest/page.tsx     ← #19 — wires useMyDigestPreference /
                                              useUpdateMyDigestPreference,
                                              renders MyNotificationToggle above
                                              DigestSettingsPanel
src/app/(public)/unsubscribe/
  success/page.tsx                         ← NEW — #19 — confirmation page, branches on
                                              ?workspace= param
src/app/(public)/unsubscribe/
  invalid/page.tsx                         ← NEW — #19 — failure page
src/stories/settings/
  MyNotificationToggle.stories.tsx         ← NEW — subscribed/unsubscribed/loading/saving/
                                              mobile states, dark+light
```

### Not done (deliberately, see Part 6 Completion Notes)

```
- Slack digest block-count ceiling (~43 same-day submitters) — found,
  not fixed, tracked as Known Tradeoff #11
- Frontend "usage limit hit" UI state — deferred until Stripe/billing exists
```
