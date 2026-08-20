# SoarUp — Environment Variable Audit & Deployment Setup Spec
# Part 7: Deployment Readiness
# Prepared for: staging + production deployment setup
# Prerequisites: Parts 1-6 of Pre-Deployment Hardening merged to feature branch

---

## Decisions Locked In (from planning discussion)

1. **Branch → environment mapping:**
   - `feature/*` branches → no deployment (local dev only)
   - `develop` → staging (auto-deploy on merge)
   - `main` → production (auto-deploy on merge, manual PR promotion from develop)
   - `main` gets its own CI check mirroring develop's — until a real
     production build exists, `main` should still be kept in a
     deployable, presentable state since it's the branch hiring
     managers/visitors will land on by default.

2. **Platform:** Railway (API + Celery worker + Celery beat, one
   Railway project with shared environment scoping across the three
   services) + Cloudflare Pages (Next.js frontend).

3. **Redis:** Upstash, two separate free-tier database instances —
   one for staging, one for production. Each gets its own 500K
   commands/month allowance at $0 cost, giving real environment
   isolation without any infra cost. Set a monthly budget cap on each
   as a safety net (Upstash rate-limits requests rather than
   surprise-billing if the cap is hit).
   ⚠️ Verify Upstash's connection model (HTTP/REST vs TCP-compatible
   endpoint) supports the blocking `XREAD` pattern used in
   `websockets.py` for the WebSocket event stream before wiring this
   in — this is the one open technical question, not yet verified.

4. **Resend — two separate sending identities:**
   - Staging: continue using `onboarding@resend.dev` (Resend's shared
     test address). No domain verification needed for staging — this
     decouples staging deployment from domain verification timing.
   - Production: verified subdomain (e.g. `mail.soarup.app` or
     `notify.soarup.app`) with SPF/DKIM/DMARC records. Verify this
     domain once production promotion is imminent, not before.

5. **Secrets management:** Native platform environment variable UIs
   (Railway's per-environment variable scoping, Cloudflare Pages'
   per-project environment variables) are sufficient for solo
   development. **Documented for later, not actioned now:** once this
   stops being a solo project, introduce a shared secrets manager
   (e.g. Doppler, Infisical, or 1Password Secrets Automation) to avoid
   secrets drifting across multiple people's local `.env` files and
   platform dashboards independently. Revisit this when adding a
   second contributor, not before.

---

## Full Environment Variable Inventory

Audited from `app/config.py` plus every variable introduced across
Milestones 1-9 and the Pre-Deployment Hardening milestone (Parts 1-6).
Organized by service and by criticality.

### Backend — Railway (API + Worker + Beat, shared environment)

#### Core / Database
| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ Yes | Postgres connection string. Staging and production need separate Supabase projects — verify this is NOT the local Supabase CLI URL. |
| `ENVIRONMENT` | ✅ Yes | `staging` or `production` — gates several production-only validators (localhost rejection, resend.dev rejection, etc.) |
| `APP_BASE_URL` | ✅ Yes | Used for invite links, digest CTAs, unsubscribe redirects. Must match the real deployed frontend URL per environment (staging URL vs production URL) — production validator rejects `localhost`. |

#### Supabase Auth
| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ Yes | Per-environment Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ Yes | Per-environment |
| `SUPABASE_JWT_SECRET` | ✅ Yes | Per-environment — used to validate incoming JWTs |
| `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ Check | Confirm whether this is currently used anywhere (M9 handoff notes mention `AuthRepository` uses the anon key, not service role, due to a workaround) — if unused, do not provision it; if a future feature needs it, add then. |

#### Redis (Upstash)
| Variable | Required | Notes |
|---|---|---|
| `REDIS_URL` | ✅ Yes | Separate Upstash instance per environment. Verify blocking `XREAD` compatibility before finalizing (see Decision #3 above). |

#### Anthropic (Claude)
| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ Yes | Can share one key across staging + production, or use separate keys for cost tracking clarity — recommend separate keys so staging test traffic doesn't muddy production usage analytics in the Anthropic console. |

#### Email (Resend)
| Variable | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | ✅ Yes | Per-environment |
| `RESEND_FROM_EMAIL` | ✅ Yes | Staging: `onboarding@resend.dev`. Production: verified domain address (e.g. `notify@mail.soarup.app`) — production validator rejects `resend.dev` domain. |

#### File Storage (R2 / Minio-compatible)
| Variable | Required | Notes |
|---|---|---|
| `R2_ENDPOINT_URL` | ✅ Yes | Per-environment bucket |
| `R2_PUBLIC_ENDPOINT_URL` | ✅ Yes | Public-facing URL for serving audio files, split from the above per M4 notes |
| `R2_ACCESS_KEY_ID` | ✅ Yes | Per-environment |
| `R2_SECRET_ACCESS_KEY` | ✅ Yes | Per-environment |

#### Slack Integration
| Variable | Required | Notes |
|---|---|---|
| `SLACK_ENCRYPTION_KEY` | ✅ Yes (if Slack integration enabled) | Fernet key. Production validator requires this when `SLACK_INTEGRATION_ENABLED=true`. Generate separately per environment — do not reuse staging's key in production. |
| `SLACK_INTEGRATION_ENABLED` | ✅ Yes | `true`/`false` — platform-level kill switch, checked in Celery tasks per Part 6 hardening fix |

#### Unsubscribe Tokens (new in Pre-Deployment Hardening Part 6)
| Variable | Required | Notes |
|---|---|---|
| `UNSUBSCRIBE_SECRET_KEY` | ✅ Yes | HMAC signing key, same production-required enforcement pattern as `SLACK_ENCRYPTION_KEY`. Generate via `secrets.token_urlsafe(32)`. Separate key per environment. |

#### Rate Limiting (new in Pre-Deployment Hardening Part 6)
| Variable | Required | Notes |
|---|---|---|
| `RATE_LIMIT_ENABLED` | ⚠️ Has default | Defaults sane — not strictly required to set, but confirm the default is `true` for both staging and production before going live |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | ⚠️ Has default | Default 10/min |
| `RATE_LIMIT_BURST` | ⚠️ Has default | Default burst 3 |

#### Observability (Sentry — new in Pre-Deployment Hardening Part 2)
| Variable | Required | Notes |
|---|---|---|
| `SENTRY_DSN` | ✅ Yes | Backend project DSN. Recommend one Sentry project per environment (staging/production) OR one project with environment tagging — decide based on whether you want staging noise mixed with production alerts. Recommend **separate Sentry projects** to keep alerting clean. |
| `SENTRY_TRACES_SAMPLE_RATE` | ⚠️ Has default | 0.1 (10%) per the Part 2 completion notes — deliberately below Sentry's onboarding default of 1.0 to conserve free-tier quota |

---

### Frontend — Cloudflare Pages

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ Yes | Points at the Railway-deployed API URL, per environment |
| `NEXT_PUBLIC_APP_URL` | ✅ Yes | The frontend's own public URL — used in OG metadata generation, share links |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Must match backend's `SUPABASE_URL` for the same environment |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Must match backend's `SUPABASE_ANON_KEY` for the same environment |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ Yes | Frontend Sentry project DSN — separate from backend's `SENTRY_DSN` (different Sentry project, per M9 hardening Part 2) |
| `NEXT_PUBLIC_ENVIRONMENT` | ✅ Yes | `staging`/`production` — **known bug fixed in Part 2:** this was originally read from `process.env.ENVIRONMENT` (never exposed client-side) — confirm the corrected `NEXT_PUBLIC_` prefix is what's actually set on the deploy platform |
| `SENTRY_AUTH_TOKEN` | ✅ Yes — build-time only | **Flagged twice in the handoff as outstanding.** Required for Sentry source map upload during build. Without this, staging/production Sentry stack traces will show minified code instead of readable file/line info. This is a Cloudflare Pages **build environment variable**, not a runtime one — set it in Cloudflare Pages' build configuration, not the regular environment variables section. |

---

## Deployment-Platform-Specific Setup Notes

### Railway
- Create one Railway **project** for the API, with three **services**
  inside it sharing one environment: `api` (FastAPI/uvicorn), `worker`
  (Celery worker), `beat` (Celery beat scheduler). Railway's shared
  environment variable scoping means setting a variable once at the
  environment level makes it available to all three services — set
  variables here, not per-service, to avoid the three services
  silently drifting out of sync (this is exactly the class of bug
  found and fixed in Part 2's Sentry setup, where `docker-compose.yml`'s
  explicit `environment:` block silently didn't pass through
  variables present in `.env` — the Railway equivalent of that mistake
  would be setting a var on `api` but forgetting `worker`).
- Create **two Railway environments**: `staging` and `production`,
  each with their own full variable set per the table above.
- Confirm Railway's build process runs `alembic upgrade head` as part
  of deploy, or add this as an explicit release/predeploy command —
  do not rely on manually running migrations after each deploy.

### Cloudflare Pages
- Create **two Pages deployment targets**: production (triggered by
  `main`) and a preview/staging target (triggered by `develop`).
  Cloudflare Pages supports per-branch environment variable overrides
  natively — use this rather than maintaining two separate Pages
  projects.
- `SENTRY_AUTH_TOKEN` goes in **Build environment variables**
  specifically, not the general runtime environment variables list —
  these are two different sections in Cloudflare Pages' settings and
  it's easy to set it in the wrong one.
- Verify the `next.config.mjs` Sentry webpack plugin wrapper
  (`withSentryConfig`) picks up `SENTRY_AUTH_TOKEN` correctly during
  the Cloudflare build — test this on the very first staging deploy
  rather than assuming it works, given this exact gap was flagged
  twice in the handoff as unverified.

---

## Pre-Flight Checklist (before first staging deploy)

```
[ ] Two Supabase projects provisioned (staging, production) — not
    using local Supabase CLI credentials anywhere in either
[ ] Two Upstash Redis databases provisioned (staging, production)
[ ] Upstash blocking XREAD compatibility verified against websockets.py
[ ] Two R2 buckets provisioned (staging, production) with correct
    CORS configuration for the respective frontend origin
[ ] Two Sentry projects created (backend-staging, backend-production,
    or however you choose to split — recommend at minimum separating
    staging noise from production alerts)
[ ] Anthropic API key(s) provisioned — decide shared vs. per-environment
[ ] Resend API key confirmed working with onboarding@resend.dev for staging
[ ] Slack encryption key generated fresh for each environment
    (do not reuse a key across environments)
[ ] Unsubscribe secret key generated fresh for each environment
[ ] Railway project created with api/worker/beat services + staging
    and production environments
[ ] Cloudflare Pages project created with production + preview
    (develop-triggered) deployment targets
[ ] SENTRY_AUTH_TOKEN set in Cloudflare Pages BUILD environment
    variables specifically (not runtime env vars)
[ ] main branch CI check configured — confirm it runs the same
    checks as develop's pr-checks.yml
[ ] Alembic migrations confirmed to run automatically on Railway deploy
    (release command or predeploy hook)
```

---

## Post-First-Deploy Verification (maps to Part 7 acceptance criteria)

```
[ ] Backend health check endpoint responds on staging Railway URL
[ ] Frontend loads on staging Cloudflare Pages URL
[ ] Signup → onboarding → dashboard flow works end-to-end on staging
[ ] Text update submission → AI summary completes on staging
    (confirms Anthropic key + Celery worker + Redis Streams all wired
    correctly across the real deployed services)
[ ] Invite flow works on staging (confirms Resend + email delivery
    pipeline, even via onboarding@resend.dev)
[ ] Voice update submission works on staging (confirms R2 storage +
    Whisper transcription pipeline)
[ ] Deliberate test error appears in the staging Sentry project with
    a readable (non-minified) stack trace — confirms SENTRY_AUTH_TOKEN
    and source map upload worked correctly
[ ] Digest settings can be configured and a manually-triggered digest
    email arrives at a real inbox via onboarding@resend.dev
[ ] Slack webhook can be configured and a test message posts
    successfully (confirms SLACK_ENCRYPTION_KEY works in the deployed
    environment)
[ ] Rate limiting returns 429 after exceeding the configured threshold
    on staging (confirms Upstash Redis GCRA script executes correctly
    against the real Upstash connection, not just local Redis)
[ ] Unsubscribe link in a real received digest email successfully
    flips the notification preference
```

---

## Independent Task — No Dependencies, Can Start Immediately

**`main` branch CI check.** Unlike everything else in this spec, this
does not depend on Railway, Upstash, Resend, or any platform decision
above — it's a GitHub Actions configuration change only. Since `main`
is what any hiring manager or visitor lands on by default, and it
hasn't been updated since the repo was created, this is worth doing
first and separately rather than waiting on the rest of Part 7:

```
[ ] Duplicate develop's existing pr-checks.yml (or reference the same
    workflow) so main runs identical checks on every PR into it
[ ] Confirm main currently reflects a deployable, presentable state —
    if develop has diverged significantly, decide whether to fast-
    forward main now (before real staging/production deploys are wired
    to it) or hold until Part 7 completes
[ ] Once staging exists, update main's README (or a status badge) to
    link to the staging environment, per the original plan — remove/
    update this once a real production build exists
```

This can be done in a single short session, independent of resolving
the Upstash `XREAD` question or any other open item below.

---

## Open Questions Requiring a Decision Before Execution

1. **Upstash + blocking XREAD:** confirmed needs verification before
   committing to Upstash for the WebSocket event stream specifically.
   If blocking reads don't work cleanly over Upstash's connection
   model, the fallback is either a short-polling `XREAD` loop instead
   of a blocking one, or provisioning a traditional Redis instance
   (Railway can host one directly, at a small compute cost) for just
   the WebSocket stream use case while keeping Upstash for
   rate-limiting and Celery's task queue.

2. **Anthropic API key — shared or per-environment:** recommend
   per-environment for cleaner cost/usage tracking, but confirm this
   doesn't complicate anything (e.g. if there's a reason to want
   identical prompt-caching behavior across environments).

3. **Sentry project structure:** recommend two separate projects
   (backend-staging/backend-production, frontend-staging/frontend-production)
   over one project with environment tags — confirm this matches your
   preference before setting up alerting rules, since alert
   configuration differs meaningfully between the two approaches.

4. **Production domain for Resend:** exact subdomain choice
   (`mail.soarup.app` vs `notify.soarup.app` vs other) — not decided
   yet, needed before production promotion but not before staging.
