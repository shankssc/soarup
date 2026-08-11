# SoarUp Staging Deployment — Handoff Document

**Date:** August 2026
**Purpose:** Full record of the staging deployment build-out, current
state, known active issues, and scaling considerations — for picking
up debugging/smoke-testing in a fresh chat.

---

## 1. Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────────┐
│  Frontend (Next.js)  │────────▶│  Backend (FastAPI)        │
│  Cloudflare Workers   │  HTTPS  │  Hetzner VM (Docker)      │
│  (OpenNext adapter)   │         │  soarupapi.dpdns.org      │
└─────────────────────┘         │  via Caddy reverse proxy  │
                                  └──────────────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ▼                       ▼                       ▼
            ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
            │ Supabase       │      │ Upstash Redis  │      │ Cloudflare R2  │
            │ (Postgres+Auth)│      │ (Celery broker │      │ (audio files)  │
            │ Session Pooler │      │  + rate limit) │      │                │
            └───────────────┘      └───────────────┘      └───────────────┘
```

**Backend containers (on Hetzner VM, via `docker-compose.staging.yml`):**
- `api` — FastAPI, port 8000, proxied by Caddy
- `worker` — Celery worker (audio transcription, Claude summarization)
- `beat` — Celery beat (scheduled digest sends)

---

## 2. What's Fully Provisioned & Verified Working

| Service | Status | Notes |
|---|---|---|
| Cloudflare Workers (frontend) | ✅ Live | Next.js 16 + OpenNext adapter, `*.workers.dev` URL |
| Cloudflare Workers Paid plan | ✅ Active | $5/mo — needed for bundle size headroom |
| Sentry (2 projects) | ✅ Live | `python-fastapi` + `javascript-nextjs`, env-scoped alerts, source maps uploading |
| Supabase (staging project) | ✅ Live | Postgres + Auth, migrations applied via Alembic |
| Upstash Redis (staging) | ✅ Live | TCP/`rediss://` connection, confirmed working for Celery + rate limiting |
| Cloudflare R2 (staging bucket) | ✅ Live | Presigned PUT/GET flow, CORS configured |
| Anthropic API (staging key) | ✅ Configured | Spend limit + notification set |
| Hetzner VM (`soarup-staging`) | ✅ Live | Ubuntu 26.04, Docker, non-root `soarup` user, ufw firewall |
| Domain (`soarupapi.dpdns.org`) | ✅ Live | Free DigitalPlat domain, DNS via Cloudflare (DNS-only, not proxied) |
| Caddy reverse proxy | ✅ Live | Automatic HTTPS via Let's Encrypt, confirmed working |
| Backend health check | ✅ Passing | `{"status":"ok","database":"ok","redis":"ok","worker":"ok"}` at `/api/v1/health` |
| Alembic migrations | ✅ Applied | Run via `docker compose run --rm api alembic upgrade head` |

---

## 3. Known Active Issues (pick up here in next session)

### Issue 1: Signup returns empty `access_token`/`refresh_token`
**Likely cause:** Supabase Cloud project has "Confirm email" enabled by
default (unlike local Supabase CLI dev setup, which likely has it
disabled). `sign_up()` won't return a real session until the email is
confirmed.
**Where to check:** Supabase Dashboard → Authentication → Providers →
Email → "Confirm email" toggle.
**Decision needed:** Either (a) disable email confirmation for staging
to match local dev behavior, or (b) keep it enabled and fix the
frontend flow to correctly handle the "check your email" state instead
of expecting immediate tokens — **(b) is more production-realistic and
probably the right long-term call**, but changes the onboarding UX
flow that currently assumes immediate redirect.

### Issue 2: Email confirmation link redirects to `localhost:3000`
**Cause confirmed:** Supabase's Site URL is still set to its default
(`http://localhost:3000`), used to construct confirmation email links.
**Fix:** Supabase Dashboard → Authentication → URL Configuration:
- Update **Site URL** to the real Cloudflare Worker URL
- Add that same URL to the **Redirect URLs** allowlist (Supabase
  rejects redirects to non-allowlisted URLs)

### Outstanding from earlier in session (not yet actioned)
- `APP_BASE_URL` in the VM's `.env` — confirm it points to the real
  Cloudflare Worker URL (used for invite link construction), not a
  placeholder
- `STAGING_API_BASE_URL` / `STAGING_WS_URL` in GitHub Secrets — need
  to be set to `https://soarupapi.dpdns.org/api/v1` and
  `wss://soarupapi.dpdns.org/api/v1/ws`, then frontend redeployed to
  pick them up
- R2 CORS `AllowedOrigins` — confirm it includes the real Cloudflare
  Worker URL (was a `localhost:3000` placeholder earlier in the
  session; may or may not have been updated since)
- Sentry environment-scoped alert rule — confirm `staging` now appears
  as a selectable environment (only populates once real staging events
  exist, which they now do)

---

## 4. Deferred / Not Yet Provisioned

- **Production environment** — entirely deferred until real user
  demand exists (Supabase prod project, Anthropic prod key, R2 prod
  bucket, `main` branch fast-forward, production Hetzner/Cloudflare
  resources)
- **`migrate-db-staging.yml` GitHub Actions workflow** — scoped and
  designed (migration + deploy as sequential jobs) but not yet created;
  migrations are currently run manually via SSH
- **Resend domain verification** (Open Question #4 from original spec)
  — untouched
- **E2E test suite re-run** — deliberately deferred until upcoming
  OAuth work, per earlier decision
- **Flower (Celery monitoring dashboard)** — deliberately excluded
  from the VM for now (would need its own auth/HTTPS exposure)

---

## 5. Scaling Considerations Identified This Session

Worth treating as a checklist to revisit as real usage grows, not
urgent today:

1. **Celery architecture requires always-on compute.** This was the
   root reason Cloudflare Workers/Containers couldn't host the
   backend — `beat` and `worker` need continuous processes, which is
   fundamentally incompatible with scale-to-zero platforms. This
   constrains future hosting choices as long as the current
   worker/beat architecture stands.

2. **Single VM, no redundancy.** `api`, `worker`, and `beat` all share
   one small Hetzner VM with no failover. A VM-level failure takes
   down the entire backend simultaneously. No horizontal scaling story
   exists yet — if traffic grows, vertical resizing (bigger VM) is the
   only lever until a proper multi-instance architecture is built.

3. **Resource contention risk on the shared VM.** Audio transcription
   (`faster-whisper`) is CPU-intensive; if it runs concurrently with
   API request handling on the same small VM, API latency could
   degrade under real load. Worth monitoring once real usage exists.

4. **Free-tier ceilings across every external service.** Supabase
   (pauses after inactivity, 2-active-project cap), Upstash (command
   volume caps), R2 (10GB storage, operation caps), Anthropic (hard
   spend limit) — none of these are infinite. Real growth means
   revisiting each service's tier, not just the compute layer.

5. **Shared Redis instance, multiple responsibilities.** The same
   Upstash instance serves as the Celery broker, WebSocket pub/sub,
   and rate-limiting cache. Growth in any one of these could hit
   Upstash's command-volume limits faster than expected since they're
   not isolated.

6. **Known Slack digest ceiling.** Flagged earlier in the milestone
   spec as a known tradeoff, not fixed: block-count limits mean
   workspaces with ~43+ same-day submitters could hit formatting
   limits in the digest.

7. **Cloudflare Worker bundle size is a recurring constraint.** Getting
   under the 3 MiB gzip limit required the Workers Paid plan
   specifically for headroom. Every future frontend dependency added
   is a small risk of bumping against this again — worth periodically
   checking bundle size as the app grows, not just at deploy time.

8. **Sentry + Turbopack limitation is not fully in your control.**
   Production builds are forced onto webpack because Sentry's SDK
   doesn't yet support Turbopack production builds. This is an
   upstream SDK limitation — revisit if/when Sentry ships full support,
   but nothing to do about it today.

9. **No edge caching in front of the API itself.** Only frontend
   static assets get Cloudflare's proxy/CDN benefit; API traffic goes
   DNS-only, direct to the Hetzner origin. The origin VM absorbs 100%
   of API request load directly — no caching layer buffering it.

10. **Environment-parity gaps are still being discovered.** The email
    confirmation issue (Section 3) is itself an example: local dev's
    relaxed Supabase CLI defaults don't match hosted Supabase's
    defaults. More such gaps may surface as more flows get tested
    against staging for the first time — worth treating each one as
    informative, not alarming, when found.

---

## 6. Reference Material

- **VM Operations Cheat Sheet** — separate document
  (`soarup-staging-vm-cheatsheet.md`), covers SSH access, Docker
  Compose commands, firewall, logs, redeploy workflow
- **VM IP:** `178.104.21.1`
- **VM SSH user:** `soarup` (key: `~/.ssh/soarup_hetzner` locally)
- **Repo path on VM:** `~/soarup`
- **Deploy branch:** `develop` (both frontend and backend)
- **Backend deploy command:** `git pull && docker compose -f
  docker-compose.staging.yml up -d --build`

---

## 7. Suggested Next Session Structure

1. Fix Supabase URL Configuration (Site URL + Redirect URLs) — quick win
2. Decide on email confirmation policy for staging (disable vs. fix
   frontend flow) and implement
3. Complete the outstanding GitHub Secrets / R2 CORS / `APP_BASE_URL`
   checklist from Section 3
4. Full smoke test: signup → onboarding → dashboard → text update →
   voice update → invite flow → digest settings, end-to-end against
   real staging infrastructure
5. Address any new bugs surfaced during smoke testing as they come up
