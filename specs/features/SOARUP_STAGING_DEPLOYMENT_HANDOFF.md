# SoarUp Staging — Handoff Document (v2)

**Date:** August 18, 2026
**Supersedes:** SOARUP_STAGING_DEPLOYMENT_HANDOFF.md (August 2026, v1)
**Purpose:** Full record of staging's current state after a multi-session
debugging pass that took the environment from "deployed but broken auth"
to "fully functional end-to-end, including email delivery." Intended as
context for building a comprehensive README and architecture diagrams.

---

## 1. Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Frontend (Next.js)  │────────▶│  Backend (FastAPI)        │
│  Cloudflare Workers   │  HTTPS  │  Hetzner VM (Docker)      │
│  app.soarupapi.dpdns.org       │  soarupapi.dpdns.org      │
│  (custom domain,      │         │  via Caddy reverse proxy  │
│   was *.workers.dev)  │         └──────────────────────────┘
└─────────────────────┘                    │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │ Supabase       │      │ Redis          │      │ Cloudflare R2  │
            │ (Postgres+Auth)│      │ SELF-HOSTED    │      │ (avatars,      │
            │ Session Pooler │      │ (was Upstash)  │      │  audio)        │
            └───────────────┘      └───────────────┘      └───────────────┘
                                            │
                            ┌───────────────┴───────────────┐
                            ▼                                ▼
                    Celery broker/backend            Rate limiting +
                    (worker, beat)                    WS event streams
```

**Backend containers (on Hetzner VM, via `docker-compose.staging.yml`):**

- `api` — FastAPI, port 8000, proxied by Caddy
- `worker` — Celery worker (audio transcription, Claude summarization)
- `beat` — Celery beat (scheduled digest sends, every 5 min)
- `redis` — **NEW this session.** Self-hosted `redis:7-alpine`, replacing
  Upstash. Named volume `redis-data` for persistence. No published host
  port — internal to the compose network only.

**Domains in play:**

- `app.soarupapi.dpdns.org` — frontend, Cloudflare Worker custom domain
  (replaces the old `soarup-staging.suyashhbk.workers.dev` — that URL
  still resolves and was kept as a fallback, but is no longer the
  canonical entry point)
- `soarupapi.dpdns.org` — backend API, unchanged
- `mail.soarupapi.dpdns.org` — **NEW this session.** Dedicated sending
  subdomain, verified with Resend (DKIM/SPF/DMARC records live in
  Cloudflare DNS). Used for all transactional email (invites, digests).

---

## 2. Fully Provisioned & Verified Working

| Service                           | Status                        | Notes                                                                                                                                                       |
| --------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Workers (frontend)     | ✅ Live                       | Next.js 16 + OpenNext, now on custom domain `app.soarupapi.dpdns.org`                                                                                       |
| Custom domain for Worker          | ✅ Live                       | **NEW.** Fixes email-link/sending-domain mismatch that was causing Gmail bounces                                                                            |
| Sentry (2 projects)               | ✅ Live                       | Unchanged                                                                                                                                                   |
| Supabase (staging project)        | ✅ Live                       | Auth flow fully debugged this session (see §3)                                                                                                              |
| Redis                             | ✅ Live — **self-hosted**     | **Changed this session.** Was Upstash (hit 500k/month command quota from Celery heartbeat/gossip traffic); now `redis:7-alpine` in the compose stack        |
| Cloudflare R2 (staging bucket)    | ✅ Live                       | URL construction and presigned-URL signing both fixed this session (see §3)                                                                                 |
| Anthropic API (staging key)       | ✅ Configured                 | Confirmed working via live digest + audio summarization tests                                                                                               |
| Hetzner VM (`soarup-staging`)     | ✅ Live                       | Ubuntu 26.04, non-root `soarup` user                                                                                                                        |
| Domain (`soarupapi.dpdns.org`)    | ✅ Live                       | DNS fully managed in Cloudflare (confirmed "DNS Setup: Full")                                                                                               |
| Resend (transactional email)      | ✅ Live — **domain verified** | **NEW this session.** `mail.soarupapi.dpdns.org` verified (DKIM/SPF/DMARC). Both invite and digest emails confirmed delivering.                             |
| Caddy reverse proxy               | ✅ Live                       | Unchanged                                                                                                                                                   |
| Backend health check              | ✅ Passing                    | `/api/v1/health`                                                                                                                                            |
| Alembic migrations                | ✅ Applied                    | Still run manually via SSH — see §4 open items                                                                                                              |
| **Full auth flow**                | ✅ **Working end-to-end**     | **NEW.** Signup → email confirmation → callback → session hydration → onboarding → login, all confirmed working. See §3 for the bug chain that got it here. |
| **Avatar upload + render**        | ✅ Working                    | **NEW.** Both upload and public-URL rendering confirmed                                                                                                     |
| **Voice update pipeline**         | ✅ Working                    | **NEW.** Presigned upload → R2 storage → Whisper transcription → Claude summarization → live WebSocket status update, confirmed end-to-end in worker logs   |
| **Live WebSocket status updates** | ✅ Working                    | **NEW.** Was silently broken while Redis (Upstash) was over quota; resolved by the Redis self-host migration                                                |
| **Digest pipeline**               | ✅ Working                    | **NEW.** Scheduled send confirmed via Resend dashboard — Celery beat tick → Claude summarization → DigestItem creation → email delivery, all confirmed      |
| **Workspace invite flow**         | ✅ Working                    | **NEW.** Confirmed with two external (non-owner) email addresses post-domain-migration, including one Gmail address that previously bounced                 |

---

## 3. Bugs Found & Fixed This Session

A lot of small, independent bugs compounded to make auth/storage/email
look broken as a whole. Documenting the actual root causes here since
several are non-obvious and worth understanding for anyone extending
this code, not just for historical record.

### Auth chain

1. **`APP_BASE_URL` had a stray `/login` suffix** on the VM's `.env`,
   turning every `email_redirect_to` into `/login/callback` (a route
   that doesn't exist) instead of `/callback`.
2. **`/callback` page relied on Supabase SDK auto-detection
   (`detectSessionInUrl`) for hash-fragment tokens** (`#access_token=...`),
   but the browser client's default flow configuration wasn't picking
   these up — zero Supabase network calls ever fired, confirmed via
   DevTools. Fixed by manually parsing `window.location.hash` and
   calling `supabase.auth.setSession()` explicitly rather than relying
   on SDK auto-detection.
3. **JWT issuer verification hardcoded a bare `settings.supabase_url`**
   in `validate_supabase_jwt` (`utils/auth.py`), but Supabase's actual
   `iss` claim includes an `/auth/v1` suffix the setting doesn't carry
   (deliberately, since other call sites append their own suffixes).
   Fixed by appending `/auth/v1` at the one call site that needed it,
   with comments added at both that call site and on the `supabase_url`
   field itself warning about a hypothetical future `/auth/v2`.
4. **Signup silently returned blank tokens** when Supabase's hosted
   "Confirm email" setting withheld a session (unlike local dev, where
   it's off by default) — the old code didn't distinguish this from a
   real failure. Fixed with a discriminated `SignupResponse` schema
   (`status: "authenticated" | "confirmation_required"`) and a
   dedicated `/signup/check-email` frontend page.
5. **A new `/auth/session` backend endpoint** and `/callback` frontend
   route were built specifically to handle any flow where Supabase
   issues a session directly (client-side) rather than through the
   FastAPI-mediated login/signup — covers email confirmation today,
   and will cover OAuth once real providers are wired up (currently
   placeholder buttons only).

### Storage (R2)

6. **Avatar public URLs were built via a hardcoded broken hostname
   template** (`f"https://{bucket}.r2.cloudflarestorage.com/{key}"`)
   instead of the correctly-configured `R2_PUBLIC_ENDPOINT_URL`
   (`pub-*.r2.dev`) — dead code left over from before that env var
   existed. Caused `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`.
7. **`R2_ENDPOINT_URL` had the bucket name appended to it** in the
   VM's `.env` (should be scheme+host only), causing every upload to
   land at a doubled-nested key path (`soarup-staging/avatars/...`
   instead of `avatars/...`).
8. **Presigned PUT/GET URLs were signed against the public `r2.dev`
   domain**, which doesn't implement S3 signature verification —
   produced valid-looking but rejected (`401`) URLs. Fixed with a
   `signing_endpoint` conditional: `public_endpoint_url` locally
   (where both Minio doorways serve the full S3 API), `endpoint_url`
   on R2 (where only the real API domain does).
9. **R2's "Public Development URL" toggle was never enabled** on the
   bucket itself — a separate requirement from having a correctly-shaped
   URL or a CORS policy.

### Infrastructure

10. **Upstash Redis hit its 500k/month command quota**, driven by
    Celery's broker/backend heartbeat, mingle, and gossip traffic
    (not application logic — `beat`'s 5-minute tick alone is far too
    low-volume to explain it). Fixed by self-hosting Redis in the
    compose stack. Tracked as accepted staging-only debt (no
    backup/replication yet — see §4).
11. **Cloudflare's Supabase Vector container was crash-looping**,
    caused by a Windows port-exclusion conflict (`54322` fell inside a
    `winnat`-reserved range) rather than anything in the project
    config. Fixed by restarting the `winnat` service; separately,
    `[analytics] enabled = false` was set in `supabase/config.toml` to
    stop Vector from running at all going forward.
12. **GitHub Actions silently stopped triggering** due to a stacked
    combination of: a `$0` account-level spending budget with
    "Stop usage: Yes" (trips on any gross usage, regardless of
    included-minutes coverage) plus, separately, a genuine multi-hour
    GitHub platform-wide Actions incident on Aug 6. Both had to be
    ruled out independently.
13. **`actions/checkout@v4`** was flagged for Node 20 deprecation across
    all jobs in `pr-checks.yml`; bumped to `@v5`.

### Email deliverability

14. **Supabase's shared SMTP caps auth emails at 2/hour** — a hosted-project
    default, not a local-dev-only setting. No code fix; tracked as an
    open item to configure custom SMTP (see §4).
15. **Invite/digest email links pointed at a different domain
    (`*.workers.dev`) than the sending domain (`mail.soarupapi.dpdns.org`)**,
    triggering Gmail's "likely unsolicited mail" spam block. Fixed by
    giving the Cloudflare Worker a custom domain
    (`app.soarupapi.dpdns.org`) under the same root as the sending
    domain, and updating `APP_BASE_URL` to match. Confirmed working:
    a subsequent invite to a Gmail address that had previously bounced
    delivered successfully.

---

## 4. Known Open Issues (tracked, not yet actioned)

- **Configure custom SMTP for Supabase Auth** (Resend, via the now-verified
  `mail.soarupapi.dpdns.org` domain) — removes the 2 email/hour cap on
  confirmation/reset emails specifically (separate from the invite/digest
  path, which already uses Resend directly and isn't affected by this cap).
- **Digest settings appear to reset after a successful digest send** —
  root cause unconfirmed (frontend cache vs. real backend reset vs.
  display artifact). Confirmed the digest _pipeline_ itself works
  correctly regardless.
- **Non-root Celery worker/beat containers** — currently run as root
  inside their containers, flagged by Celery's own `SecurityWarning`.
- **`HF_TOKEN` unset** — Whisper model downloads from Hugging Face are
  unauthenticated, subject to lower anonymous rate limits.
- **No Redis backup/replication strategy** — acceptable for
  single-user staging today; revisit before any production traffic.
- **`migrate-db-staging.yml` GitHub Actions workflow** — still not
  created; migrations run manually via SSH.
- **Password reset flow** — not smoke-tested this session, given how
  many adjacent auth bugs were found, worth a dedicated pass before
  assuming it's clean.
- **Slack integration** — not tested this session (feature-flagged,
  `SLACK_INTEGRATION_ENABLED`).
- **RBAC role behavior** (owner vs. admin vs. member) — not
  specifically smoke-tested this session beyond default owner access.
- **Onboarding redirect flicker** — after completing onboarding, briefly
  redirects to `/dashboard` then bounces back to `/onboarding` before
  settling. Backend data confirmed correct (verified via second
  browser session) — purely a client-side state/timing display bug.
- **Remaining GitHub Actions on old Node runtime** — only
  `actions/checkout` was confirmed and fixed; `codecov-action`,
  `docker/build-push-action`, `codeql-action`, `dependency-review-action`
  weren't individually audited.
- **`.env.example` missing `RESEND_FROM_EMAIL`** — the setting exists
  and matters in practice now; the template file doesn't document it.

---

## 5. Scaling Considerations (updated from v1)

Most of v1's scaling notes still hold. Updates specific to this session:

1. **Redis is now self-hosted, not managed.** This trades away Upstash's
   automatic backups/replication for freedom from the command-volume
   quota. Given the VM already has "no redundancy" and "resource
   contention risk" flagged in v1, adding Redis as a fourth resident
   process is a real (if currently small) additional load — worth
   watching memory usage as traffic grows, not just CPU.
2. **Email domain reputation needs organic warm-up time**, independent
   of the custom-domain fix. The domain-mismatch fix removes one
   structural red flag permanently, but Gmail-specific trust is earned
   through sustained legitimate sending history, not configuration.
3. Everything else from v1 (Celery's always-on compute requirement,
   single-VM no-redundancy, free-tier ceilings on the _other_ services,
   Cloudflare Worker bundle size, Sentry/Turbopack limitation, no edge
   caching in front of the API) is unchanged and still accurate.

---

## 6. Reference Material

- **Frontend URL:** `https://app.soarupapi.dpdns.org` (custom domain,
  canonical going forward)
- **Backend API URL:** `https://soarupapi.dpdns.org/api/v1`
- **Email sending domain:** `mail.soarupapi.dpdns.org` (Resend, verified)
- **VM IP:** `178.104.21.1`
- **VM SSH user:** `soarup` (key: `~/.ssh/soarup_hetzner` locally)
- **Repo path on VM:** `~/soarup`
- **Deploy branch:** `develop` (both frontend and backend)
- **Backend deploy:** `make staging-deploy` (git pull + rebuild + restart
  all containers) or `make staging-restart service=<name>` (env-only
  changes, no rebuild — faster but does NOT pick up code changes)
- **Staging Makefile targets added this session:** `staging-logs`,
  `staging-ps`, `staging-deploy`, `staging-restart`, `staging-down`,
  `staging-down-volumes`

---

## 7. Suggested Next Steps

1. Configure Supabase custom SMTP via Resend (closes the last
   known auth-adjacent friction point)
2. Smoke-test password reset and RBAC role boundaries
3. Address the digest-settings-persistence bug (needs investigation,
   not yet a confirmed root cause)
4. Non-root Celery containers + `HF_TOKEN` (both quick, low-risk fixes)
5. Build `migrate-db-staging.yml` to remove the manual SSH migration step
6. Revisit Redis backup strategy before any real user traffic
