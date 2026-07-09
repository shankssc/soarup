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

### E2E Test Completion

1. Test data cleanup mechanism — direct Postgres truncation in FK order,
   re-seed after each run
2. `signup-onboarding.spec.ts` passing (#58)
3. `text-update-submission.spec.ts` passing (#59)
4. `invite-flow.spec.ts` passing (#60)
5. `voice-update-submission.spec.ts` passing (#61)

### Observability

6. Sentry configured on FastAPI backend (errors + Celery tasks)
7. Sentry configured on Next.js frontend
8. `send_default_pii=False` on both — no PII sent to Sentry

### First-Impression Bug Fixes

9. SVG icons on auth pages fixed — no manual reload required (#110)
10. Auth loading spinner covers full login sequence, not just API call (#109)
11. Slack settings page — shared channel delivery model clarified (#107)

### Correctness Fixes (from M9 scaling docs)

12. Username race condition — IntegrityError mapped to clean error
13. UsernameIndicator — isError branch added, no silent false negative
14. Public profile — `loading.tsx` added, FOUC eliminated

### Visual Polish

15. Settings sub-pages (Digest, Members) — visual balance pass (#108)
16. Public profile page — cosmetic pass to match Profile page quality

### Security & Compliance

17. Server-side `update_date` validation using stored timezone (#18)
18. Rate limiting on update submission endpoints (#20)
19. Signed unsubscribe token for digest emails — CAN-SPAM/GDPR (#47)

### Deployment Readiness

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
    ├── feature/pdh-e2e-completion       ← test data cleanup + 4 specs green
    ├── feature/pdh-sentry               ← backend + frontend observability
    ├── feature/pdh-first-impression     ← #110, #109, #107
    ├── feature/pdh-m9-correctness       ← IntegrityError, isError, loading.tsx
    ├── feature/pdh-visual-polish        ← #108 + public profile cosmetics
    ├── feature/pdh-security             ← #18, #20, #47
    └── feature/pdh-deploy-readiness     ← Resend domain, env audit, staging deploy

Merge order:
  feature/pdh-e2e-completion       → feature/milestone-pre-deployment-hardening
  feature/pdh-sentry                → feature/milestone-pre-deployment-hardening
  feature/pdh-first-impression      → feature/milestone-pre-deployment-hardening
  feature/pdh-m9-correctness        → feature/milestone-pre-deployment-hardening
  feature/pdh-visual-polish         → feature/milestone-pre-deployment-hardening
  feature/pdh-security              → feature/milestone-pre-deployment-hardening
  feature/pdh-deploy-readiness      → feature/milestone-pre-deployment-hardening
  feature/milestone-pre-deployment-hardening → develop
```

Recommended order of work: E2E completion first (surfaces any lingering
integration bugs while you still have full context), then the quick
correctness/first-impression fixes, then security, then visual polish,
then Sentry, and deploy readiness last since it depends on everything
else being done.

---

## Part 1: E2E Test Completion

### Step 1: Test Data Cleanup Mechanism

The blocker identified during the polish milestone was that Supabase
auth user deletion alone isn't enough — orphaned rows in `profiles`,
`workspaces`, `workspace_members`, `updates`, `digests`, and
`digest_items` accumulate across test runs and cause unique constraint
violations on subsequent runs.

```typescript
// apps/web/tests/e2e/fixtures/db-cleanup.ts

import { Client } from "pg";

const TEST_EMAIL_PREFIX = "e2e+";

/**
 * Truncates all E2E test data in FK-safe order.
 * Connects directly to Postgres — bypasses the API entirely.
 * Only deletes rows belonging to e2e+* seeded users.
 */
export async function cleanupE2EData(): Promise<void> {
  const client = new Client({
    connectionString: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  await client.connect();

  try {
    // Find all profile IDs belonging to e2e+ test users
    const { rows } = await client.query(
      `SELECT id FROM profiles WHERE email LIKE $1`,
      [`${TEST_EMAIL_PREFIX}%`],
    );
    const userIds = rows.map((r) => r.id);

    if (userIds.length === 0) {
      await client.end();
      return;
    }

    // Delete in FK-safe order — children before parents
    await client.query(
      `DELETE FROM digest_items WHERE digest_id IN (
         SELECT id FROM digests WHERE workspace_id IN (
           SELECT id FROM workspaces WHERE owner_id = ANY($1)
         )
       )`,
      [userIds],
    );
    await client.query(
      `DELETE FROM digests WHERE workspace_id IN (
         SELECT id FROM workspaces WHERE owner_id = ANY($1)
       )`,
      [userIds],
    );
    await client.query(`DELETE FROM updates WHERE user_id = ANY($1)`, [
      userIds,
    ]);
    await client.query(
      `DELETE FROM workspace_members WHERE user_id = ANY($1)`,
      [userIds],
    );
    await client.query(
      `DELETE FROM workspace_invites WHERE workspace_id IN (
         SELECT id FROM workspaces WHERE owner_id = ANY($1)
       )`,
      [userIds],
    );
    await client.query(`DELETE FROM workspaces WHERE owner_id = ANY($1)`, [
      userIds,
    ]);
    await client.query(`DELETE FROM profiles WHERE id = ANY($1)`, [userIds]);

    console.log(
      `E2E cleanup: removed ${userIds.length} test user(s) and related data`,
    );
  } finally {
    await client.end();
  }
}
```

Update `global-setup.ts` to clean before seeding:

```typescript
// apps/web/tests/e2e/global-setup.ts

import { cleanupE2EData } from "./fixtures/db-cleanup";

async function globalSetup() {
  await cleanupE2EData(); // ← clean slate before every run

  const browser = await chromium.launch();
  const page = await browser.newPage();
  // ... existing seed user creation
}

export default globalSetup;
```

Update `global-teardown.ts` to clean after:

```typescript
// apps/web/tests/e2e/global-teardown.ts

import { cleanupE2EData } from "./fixtures/db-cleanup";

async function globalTeardown() {
  await cleanupE2EData(); // ← also clean after, belt and braces
}

export default globalTeardown;
```

Add `pg` as a dev dependency:

```bash
cd apps/web
npm install --save-dev pg @types/pg
```

Add `E2E_DATABASE_URL` to `.env.test` — should point directly at the
local Supabase Postgres instance (not through PgBouncer/connection
pooler if one is in front of it), since this connection needs to run
outside a transaction-scoped session.

---

### Step 2: Run All Four Specs

```bash
cd apps/web
npx playwright test tests/e2e/auth/signup-onboarding.spec.ts
npx playwright test tests/e2e/updates/text-update-submission.spec.ts
npx playwright test tests/e2e/members/invite-flow.spec.ts
npx playwright test tests/e2e/updates/voice-update-submission.spec.ts
```

For `voice-update-submission.spec.ts`, run the full pipeline test with
all services up:

```bash
docker compose up -d api worker beat redis minio
E2E_FULL_PIPELINE=true npx playwright test tests/e2e/updates/voice-update-submission.spec.ts
```

Fix any failures surfaced — these are likely to include auth timing
edge cases, WebSocket race conditions on slow CI-like environments, or
`data-testid` mismatches from components that changed since M6 when
the attributes were originally added. Update the specs to match current
component structure where things have legitimately moved (e.g. the
`/history` page tabs added in M7, the Slack settings link added in M8).

---

## Part 2: Sentry Setup

### Backend

```bash
cd apps/api
pip install "sentry-sdk[fastapi,celery]" --break-system-packages
```

Add to `requirements.txt`:

```
sentry-sdk[fastapi,celery]>=2.0.0
```

```python
# apps/api/app/config.py — add

sentry_dsn: str | None = Field(None, description="Sentry DSN for error tracking")
sentry_traces_sample_rate: float = Field(0.2, description="Fraction of requests traced")
```

```python
# apps/api/app/main.py — add before FastAPI app instantiation

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
            CeleryIntegration(),
        ],
        traces_sample_rate=settings.sentry_traces_sample_rate,
        environment=settings.environment,
        send_default_pii=False,   # no PII — request bodies, cookies, IPs excluded
        release=settings.app_version if hasattr(settings, "app_version") else None,
    )
```

```python
# apps/api/app/workers/celery_app.py — add Sentry init for worker process
# Celery workers run in a separate process from the FastAPI app, so
# Sentry needs its own init call here too.

import sentry_sdk
from sentry_sdk.integrations.celery import CeleryIntegration

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        integrations=[CeleryIntegration()],
        traces_sample_rate=settings.sentry_traces_sample_rate,
        environment=settings.environment,
        send_default_pii=False,
    )
```

Add to `.env` / `.env.example`:

```
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.2
```

### Frontend

```bash
cd apps/web
npx @sentry/wizard@latest -i nextjs
```

The wizard will:

- Add `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Wrap `next.config.mjs` with `withSentryConfig` for source map upload
- Add `NEXT_PUBLIC_SENTRY_DSN` to environment variables
- Optionally add an example error page for verification

After the wizard runs, manually set PII exclusion in all three config files:

```typescript
// sentry.client.config.ts / sentry.server.config.ts / sentry.edge.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.2,
  sendDefaultPii: false, // ← verify this is explicitly set false
});
```

Verify source maps upload correctly by triggering a test error and
confirming the Sentry dashboard shows original TypeScript, not
minified bundle output.

---

## Part 3: First-Impression Bug Fixes

### #110 — SVG icons requiring manual reload on auth pages

Identify the affected SVGs (likely in `login-form.tsx` / `signup-form.tsx`
— the eye icon for password visibility toggle, any decorative icons).

```typescript
// Replace inline SVG icons with Material Symbols, consistent with
// the rest of the app (Slack settings, digest card)

// Before:
<svg className="w-4 h-4" viewBox="0 0 24 24">...</svg>

// After:
<span className="material-symbols-outlined text-[16px]">
  visibility
</span>
```

Audit all `.tsx` files under `app/(auth)/` for raw inline `<svg>` tags:

```bash
grep -rl "<svg" apps/web/src/app/\(auth\)/ apps/web/src/components/domain/auth/
```

Replace each with the equivalent Material Symbol name. This resolves
the server/client hydration mismatch since icon fonts don't have the
same render-order dependency as inline SVG paths.

---

### #109 — Auth spinner clearing before login sequence completes

```typescript
// apps/web/src/hooks/useAuth.ts

// Current pattern likely resolves the mutation/promise as soon as
// the API call returns, before syncSupabaseSession and the Zustand
// store update have completed. Extend the loading state to cover
// the full sequence:

async function login(email: string, password: string) {
  setIsLoggingIn(true);
  try {
    const response = await apiClient.post("/auth/login", { email, password });
    await syncSupabaseSession(response.access_token, response.refresh_token);
    setUser(response.user);
    setTokens({
      access_token: response.access_token,
      refresh_token: response.refresh_token,
    });
    // Only now is the sequence actually complete
  } finally {
    setIsLoggingIn(false);
  }
}
```

```typescript
// login-form.tsx — spinner/overlay bound to isLoggingIn for the
// full duration, not just the fetch call
{isLoggingIn && <PageTransition isLoading={true} />}
```

Apply the same pattern to `signup`.

---

### #107 — Slack delivery model clarity copy

```typescript
// apps/web/src/app/(app)/settings/slack/page.tsx
// Add below the webhook URL helper text:

<p className="font-label text-[10px] text-outline mt-2">
  Notifications post to the Slack channel this webhook belongs to.
  Make sure all team members are in that channel to see updates —
  SoarUp does not send individual Slack DMs.
</p>
```

---

## Part 4: M9 Correctness Fixes

### Username IntegrityError → clean error

```python
# apps/api/app/services/profile_service.py — update_profile

from sqlalchemy.exc import IntegrityError

async def update_profile(
    self, user_id: str, request: UpdateProfileRequest
) -> UserResponse:
    # ... existing username uniqueness check via is_username_taken ...

    try:
        await self.db.commit()
    except IntegrityError:
        await self.db.rollback()
        raise ProfileError(
            "username_taken",
            "This username was just claimed. Please choose another.",
        )

    await self.db.refresh(profile)
    return self._map_user_to_response(profile)
```

Map `username_taken` to 409 in the router error handler if not already
mapped from the earlier pre-commit check path.

---

### UsernameIndicator isError branch

```typescript
// apps/web/src/app/(app)/settings/profile/page.tsx

function UsernameIndicator() {
  if (!usernameDirty || usernameInput.length < 3) return null;
  if (usernameInput === user?.username) {
    return <OwnUsernameIndicator />;
  }
  if (availabilityQuery.isError) {
    return (
      <span className="font-label text-[10px] text-outline flex items-center gap-1">
        <span className="material-symbols-outlined text-[12px]">help</span>
        Could not check — try again
      </span>
    );
  }
  if (availabilityQuery.isLoading) {
    return <LoadingSpinner />;
  }
  if (availabilityQuery.data?.available) {
    return <AvailableIndicator />;
  }
  return <TakenIndicator />;
}
```

Also disable the Save button when `availabilityQuery.isError` is true
and the username field is dirty — prevent saving on an unverified state:

```typescript
disabled={
  updateProfile.isPending ||
  (usernameDirty && availabilityQuery.isError)
}
```

---

### Public profile loading.tsx

```typescript
// apps/web/src/app/u/[username]/skeleton.tsx
// Extract the skeleton into its own file so both client.tsx
// and loading.tsx can import it

export function PublicProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8 animate-pulse">
      <div className="flex items-start gap-6">
        <div className="w-24 h-24 rounded-full bg-surface-high flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-7 w-48 bg-surface-high rounded-card" />
          <div className="h-4 w-24 bg-surface-high rounded-card" />
          <div className="h-4 w-64 bg-surface-high rounded-card" />
        </div>
      </div>
      <div className="h-20 bg-surface-high rounded-card" />
      <div className="h-40 bg-surface-high rounded-card" />
    </div>
  );
}
```

```typescript
// apps/web/src/app/u/[username]/loading.tsx — new file

import { PublicProfileSkeleton } from "./skeleton";

export default function Loading() {
  return <PublicProfileSkeleton />;
}
```

```typescript
// apps/web/src/app/u/[username]/client.tsx
// Update import — remove the inline skeleton definition, import shared one

import { PublicProfileSkeleton } from "./skeleton";
```

---

## Part 5: Visual Polish

### #108 — Settings sub-pages visual balance

Apply to `/settings/digest` and `/settings/members`:

```
[ ] Add helper/context text above sparse sections explaining what the
    page controls (mirrors the descriptive text pattern already used
    on /settings/slack)
[ ] Apply shadow-card consistently to all content blocks — verify
    Digest and Members pages match the depth treatment used on Profile
    and Slack pages
[ ] Add an empty-state illustration or icon treatment to Members when
    the workspace has only one member ("Invite your team to see them here")
[ ] Verify consistent section spacing (vertical rhythm) matches Profile
    page's established spacing scale
```

Do this as a visual audit pass — screenshot each settings page in both
dark and light mode, compare side by side with Profile and Slack, and
close the most visually obvious gaps first.

---

### Public profile page — cosmetic pass

```
[ ] Review hero section spacing/alignment against the original Stitch
    mockup from the M9 spec — confirm avatar, name, username, bio,
    tagline all have consistent vertical rhythm
[ ] Verify heatmap card matches the shadow-card treatment used
    elsewhere (digest cards, update cards)
[ ] Confirm "Built with SoarUp" badge and footer CTA don't feel like
    an afterthought — check contrast and spacing against the rest of
    the hero
[ ] Test on mobile viewport — hero section with avatar + text side by
    side may need to stack vertically below a breakpoint
[ ] Verify empty state (zero submissions) heatmap doesn't look broken —
    all-zero-intensity cells should still read as an intentional
    "not yet" state, not a rendering bug
```

This page is the one most likely to be shared externally — treat the
cosmetic pass with the same care as a landing page, since for someone
who's never seen SoarUp before, this may be their first impression of
the product.

---

## Part 6: Security & Compliance

### #18 — Server-side update_date validation

```python
# apps/api/app/services/update_service.py — submit_update

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from datetime import datetime, UTC

def _validate_update_date(user_timezone: str | None, submitted_date: str) -> bool:
    """
    Validate that the submitted date matches today's date in the
    user's timezone, with a small tolerance for midnight edge cases.
    """
    tz_str = user_timezone or "UTC"
    try:
        tz = ZoneInfo(tz_str)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")

    user_now = datetime.now(tz)
    expected_date = user_now.strftime("%Y-%m-%d")

    # Allow ±1 day tolerance for midnight boundary edge cases
    from datetime import timedelta
    yesterday = (user_now - timedelta(days=1)).strftime("%Y-%m-%d")
    tomorrow = (user_now + timedelta(days=1)).strftime("%Y-%m-%d")

    return submitted_date in (expected_date, yesterday, tomorrow)
```

```python
# In submit_update, before creating the Update record:

profile = await self._get_profile_repo().get_by_user_id(user_id)
if not _validate_update_date(profile.timezone if profile else None, request.update_date):
    raise UpdateError(
        "invalid_update_date",
        "The submission date does not match your current date. "
        "Please refresh and try again.",
    )
```

Add test coverage for the boundary cases (just before/after midnight
in a non-UTC timezone).

---

### #20 — Rate limiting on update submission endpoints

```bash
pip install slowapi --break-system-packages
```

```python
# apps/api/app/lib/rate_limit.py — new file

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

```python
# apps/api/app/main.py

from app.lib.rate_limit import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

```python
# apps/api/app/routers/updates.py

from app.lib.rate_limit import limiter

@router.post("/{workspace_id}/updates")
@limiter.limit("10/minute")
async def submit_update(request: Request, ...):
    ...

@router.patch("/{workspace_id}/updates/{update_id}")
@limiter.limit("20/minute")
async def edit_update(request: Request, ...):
    ...
```

Note: `slowapi` requires the raw `Request` object as the first
parameter of the decorated route — verify this doesn't conflict with
existing dependency injection patterns; adjust route signatures as
needed.

This is intentionally basic — a flat per-IP limit rather than
tier-based limits, since Stripe/billing tiers don't exist yet. Revisit
when Stripe billing lands post-launch.

---

### #47 — Signed unsubscribe token for digest emails

```python
# apps/api/app/lib/unsubscribe.py — new file

import hashlib
import hmac
import time
from app.config import settings


def generate_unsubscribe_token(user_id: str, workspace_id: str) -> str:
    """
    Generate a signed token for one-click digest unsubscribe.
    Token format: {user_id}.{workspace_id}.{timestamp}.{signature}
    """
    timestamp = str(int(time.time()))
    payload = f"{user_id}.{workspace_id}.{timestamp}"
    signature = hmac.new(
        settings.slack_encryption_key.get_secret_value().encode()
        if settings.slack_encryption_key else b"fallback-key",
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{signature}"


def verify_unsubscribe_token(token: str) -> tuple[str, str] | None:
    """
    Verify an unsubscribe token and return (user_id, workspace_id)
    if valid, None if invalid or expired (90 day expiry).
    """
    try:
        user_id, workspace_id, timestamp, signature = token.split(".")
    except ValueError:
        return None

    payload = f"{user_id}.{workspace_id}.{timestamp}"
    expected_signature = hmac.new(
        settings.slack_encryption_key.get_secret_value().encode()
        if settings.slack_encryption_key else b"fallback-key",
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        return None

    # 90 day expiry
    if int(time.time()) - int(timestamp) > 90 * 24 * 60 * 60:
        return None

    return user_id, workspace_id
```

⚠️ Note: reusing `slack_encryption_key` as the HMAC secret is a
shortcut — for correctness this should be its own dedicated
`UNSUBSCRIBE_SECRET_KEY` env var so rotating one doesn't affect the
other. Generate a dedicated key the same way as the Slack key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

```python
# apps/api/app/config.py — add

unsubscribe_secret_key: SecretStr | None = Field(
    None, description="HMAC secret for digest unsubscribe tokens"
)
```

Update `unsubscribe.py` to use `settings.unsubscribe_secret_key` instead
of reusing the Slack key.

```python
# apps/api/app/routers/digests.py — add

@router.get("/unsubscribe/{token}", status_code=200)
async def unsubscribe_from_digest(
    token: str,
    api_version: ApiVersionDep,
    db: DBSessionDep,
) -> Response:
    """
    One-click unsubscribe from digest emails. No auth required —
    the signed token itself is the authorization.
    """
    result = verify_unsubscribe_token(token)
    if not result:
        return create_error_response(
            "invalid_token", "This unsubscribe link is invalid or has expired.",
            400, api_version=api_version,
        )
    user_id, workspace_id = result

    profile_repo = ProfileRepository.from_session(db)
    profile = await profile_repo.get_by_user_id(user_id)
    if profile:
        profile.email_notifications = False
        await db.commit()

    return create_success_response(
        {"message": "You have been unsubscribed from digest emails."},
        api_version=api_version,
    )
```

Update the digest email template to include the unsubscribe link
per-recipient (this requires per-recipient rendering rather than one
shared HTML blob sent to all recipients):

```python
# apps/api/app/workers/tasks.py — _send_workspace_digest_async
# Change from batch send with shared HTML to per-recipient rendering

for member, profile in members_with_profiles:
    if not profile or not profile.email or not profile.email_notifications:
        continue
    token = generate_unsubscribe_token(profile.id, workspace_id)
    unsubscribe_url = f"{settings.app_base_url}/api/v1/digests/unsubscribe/{token}"
    html = render_digest_email(
        workspace_name=workspace.name,
        digest_date=digest_date,
        team_summary=team_summary,
        items=items_for_email,
        unsubscribe_url=unsubscribe_url,
    )
    await send_digest_email(
        to_emails=[profile.email],
        workspace_name=workspace.name,
        digest_date=digest_date,
        html=html,
    )
```

⚠️ This changes the digest email from batched (up to 50 recipients per
Resend call) to one Resend call per recipient. For current team sizes
this is fine — revisit batching + a shared token scheme if workspace
sizes grow significantly.

---

## Part 7: Deployment Readiness

### Resend Domain Verification

```
[ ] Add and verify soarup.app (or chosen sending domain) in Resend
    dashboard under Domains
[ ] Add required DNS TXT/MX records at your domain registrar
[ ] Wait for DNS propagation (10-30 minutes)
[ ] Set RESEND_FROM_EMAIL=invites@soarup.app (or similar) in staging
    environment variables
[ ] Send a test invite and test digest to a real external email
    address to confirm delivery
[ ] Confirm emails don't land in spam — check SPF/DKIM/DMARC records
    are correctly configured by Resend's domain verification
```

---

### Environment Variable Audit

Create a checklist of every required environment variable across both
services and confirm each is set in the staging environment:

```
Backend (apps/api/):
[ ] DATABASE_URL
[ ] SUPABASE_URL
[ ] SUPABASE_ANON_KEY
[ ] SUPABASE_JWT_SECRET
[ ] REDIS_URL
[ ] ANTHROPIC_API_KEY
[ ] RESEND_API_KEY
[ ] RESEND_FROM_EMAIL
[ ] APP_BASE_URL
[ ] R2_ENDPOINT_URL / R2_PUBLIC_ENDPOINT_URL
[ ] R2_ACCESS_KEY_ID
[ ] R2_SECRET_ACCESS_KEY
[ ] SLACK_ENCRYPTION_KEY
[ ] SLACK_INTEGRATION_ENABLED
[ ] UNSUBSCRIBE_SECRET_KEY
[ ] SENTRY_DSN
[ ] SENTRY_TRACES_SAMPLE_RATE
[ ] ENVIRONMENT=production (or staging)

Frontend (apps/web/):
[ ] NEXT_PUBLIC_API_URL
[ ] NEXT_PUBLIC_APP_URL
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
[ ] NEXT_PUBLIC_SENTRY_DSN
```

Verify the production validators in `config.py` (the ones that reject
`localhost`, `resend.dev`, missing production keys) all pass cleanly
against staging's actual environment values.

---

### Staging Deployment

```
[ ] Deploy backend (API + Celery worker + Celery beat) to staging
[ ] Deploy frontend to Cloudflare Pages
[ ] Verify Supabase production project is provisioned (not local CLI)
[ ] Run Alembic migrations against staging DB
[ ] Verify Redis is reachable from staging API
[ ] Verify Minio/R2 bucket is provisioned and reachable
[ ] Confirm WebSocket connections work through staging's reverse proxy
    (verify no proxy buffering breaks the long-lived connection)
```

---

### Staging Smoke Test

Walk through all four E2E flows manually on the live staging URL,
not just automated:

```
[ ] Sign up with a real email → complete onboarding → land on dashboard
[ ] Submit a text update → see it appear → wait for AI summary to complete
[ ] Invite a second real email address → accept invite → see team dashboard
[ ] Record and submit a voice update → confirm transcription + summary
[ ] Enable digest settings → manually trigger check_and_send_digests →
    confirm email arrives at a real inbox
[ ] Configure Slack webhook → send test message → confirm it posts
[ ] Visit a public profile URL while logged out → confirm it renders
[ ] Trigger a deliberate error (e.g. malformed request via browser
    devtools) → confirm it shows up in Sentry within a few minutes
```

---

## Known Tradeoffs

**1. Rate limiting is a flat per-IP limit, not tier-based**
Since Stripe billing doesn't exist yet, rate limits can't be
tier-differentiated. The flat 10/minute limit on update submission is
a reasonable default that will need revisiting once paid tiers exist.

**2. Unsubscribe token reuses infrastructure pattern from Slack encryption**
A dedicated `UNSUBSCRIBE_SECRET_KEY` is used rather than reusing the
Slack key, but the HMAC signing pattern itself is new, untested at
scale, and worth a security review before relying on it heavily.

**3. Per-recipient digest email rendering increases Resend API calls**
Moving from batched (50 recipients/call) to per-recipient sending (for
unique unsubscribe links) means a workspace with 20 members now makes
20 Resend calls instead of 1. Acceptable at current team sizes;
revisit with a shared-token + query-param-per-click model if this
becomes a bottleneck.

**4. E2E full pipeline test still requires manual service orchestration**
`voice-update-submission.spec.ts`'s full pipeline variant needs Celery,
Minio, and Whisper running locally via `E2E_FULL_PIPELINE=true`. This
is not part of the standard CI-friendly suite and remains a manual
verification step.

---

## Acceptance Criteria

```
[ ] Test data cleanup mechanism works — repeated runs don't collide
[ ] signup-onboarding.spec.ts passes
[ ] text-update-submission.spec.ts passes
[ ] invite-flow.spec.ts passes
[ ] voice-update-submission.spec.ts passes (state transitions at minimum)
[ ] Sentry configured on FastAPI — test error appears in dashboard
[ ] Sentry configured on Celery worker — test task failure appears
[ ] Sentry configured on Next.js — test error appears with readable stack trace
[ ] send_default_pii=False confirmed on all three Sentry inits
[ ] Auth page SVG icons render on first load, no reload needed
[ ] Auth spinner covers full login sequence including session sync
[ ] Slack settings page shows shared-channel clarity copy
[ ] Username IntegrityError returns clean 409, not raw 500
[ ] UsernameIndicator shows distinct state on API error
[ ] Save disabled when username check errored and field is dirty
[ ] Public profile shows loading.tsx skeleton, no FOUC
[ ] Settings sub-pages (Digest, Members) visually balanced against Profile
[ ] Public profile page cosmetic pass complete, mobile verified
[ ] Server-side update_date validation rejects mismatched dates
[ ] Rate limiting active on POST/PATCH update endpoints
[ ] Unsubscribe token generated and included in every digest email
[ ] GET /digests/unsubscribe/:token successfully disables notifications
[ ] Resend domain verified — test email delivers to external inbox
[ ] All required environment variables present and audited in staging
[ ] Staging deployment successful — API, worker, beat, frontend all live
[ ] Manual smoke test of all flows passes on staging URL
[ ] Deliberate test error appears in Sentry from staging environment
[ ] CI passes on feature/milestone-pre-deployment-hardening branch
```

---

## Files To Create / Modify Summary

### Backend (apps/api/)

```
app/lib/rate_limit.py                     ← NEW
app/lib/unsubscribe.py                    ← NEW
app/config.py                             ← +sentry_dsn, +sentry_traces_sample_rate,
                                             +unsubscribe_secret_key
app/main.py                               ← +Sentry init, +rate limiter registration
app/workers/celery_app.py                 ← +Sentry init for worker process
app/services/update_service.py            ← +_validate_update_date, wired into submit_update
app/services/profile_service.py           ← +IntegrityError catch in update_profile
app/routers/updates.py                    ← +rate limit decorators
app/routers/digests.py                    ← +GET /unsubscribe/:token endpoint
app/workers/tasks.py                      ← per-recipient digest rendering
                                             with unsubscribe token
requirements.txt                          ← +sentry-sdk[fastapi,celery], +slowapi
```

### Frontend (apps/web/)

```
sentry.client.config.ts                   ← NEW (via wizard)
sentry.server.config.ts                   ← NEW (via wizard)
sentry.edge.config.ts                     ← NEW (via wizard)
next.config.mjs                           ← wrapped with withSentryConfig
tests/e2e/fixtures/db-cleanup.ts          ← NEW
tests/e2e/global-setup.ts                 ← +cleanupE2EData call
tests/e2e/global-teardown.ts              ← +cleanupE2EData call
src/app/u/[username]/skeleton.tsx         ← NEW (extracted from client.tsx)
src/app/u/[username]/loading.tsx          ← NEW
src/app/u/[username]/client.tsx           ← import shared skeleton,
                                             cosmetic pass
src/app/(app)/settings/profile/page.tsx   ← UsernameIndicator isError branch,
                                             Save disabled on error
src/app/(app)/settings/slack/page.tsx     ← shared-channel clarity copy
src/app/(app)/settings/digest/page.tsx    ← visual balance pass
src/app/(app)/settings/members/page.tsx   ← visual balance pass
src/hooks/useAuth.ts                      ← spinner covers full login sequence
src/components/domain/auth/login-form.tsx ← isLoggingIn-bound overlay,
                                             SVG → Material Symbol swap
src/components/domain/auth/signup-form.tsx ← same treatment as login-form
package.json                              ← +pg, +@types/pg (devDependency)
.env.example                              ← +SENTRY_DSN, +NEXT_PUBLIC_SENTRY_DSN,
                                             +UNSUBSCRIBE_SECRET_KEY,
                                             +E2E_DATABASE_URL
```
