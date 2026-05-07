# 01 — Architecture
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 00-product-vision.md

---

## System overview

Stand-up Buddy is a fullstack web platform built as a monorepo with two discrete apps — a Next.js (App Router) frontend and a FastAPI backend — communicating over REST and WebSockets. Async work (transcription, summarisation, digest delivery) is handled by Celery workers backed by Redis. All infrastructure runs free-tier services in production with Docker Compose parity locally.

```
standup-buddy/
├── apps/
│   ├── web/          # Next.js + TypeScript frontend
│   └── api/          # FastAPI + Python backend
├── .github/
│   └── workflows/    # All CI/CD pipelines
├── specs/            # This directory
├── docker-compose.yml
├── docker-compose.prod.yml
├── Makefile
└── .env.example
```

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                     │
│                  Next.js + TypeScript                    │
│              Cloudflare Pages (production)               │
└───────────────────────┬─────────────────────────────────┘
                        │ REST + WebSocket
                        ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI (Python)                        │
│              Railway (production)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Auth layer │  │  REST routes │  │  WS handler    │  │
│  │  (Supabase) │  │  (versioned) │  │  (real-time)   │  │
│  └─────────────┘  └──────┬───────┘  └────────────────┘  │
└─────────────────────────-│──────────────────────────────┘
                           │ Enqueue jobs
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Upstash Redis (job queue + cache)            │
└──────────┬──────────────────────────────────────────────┘
           │ Consume jobs
           ▼
┌─────────────────────────────────────────────────────────┐
│                  Celery Workers                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Transcribe  │  │  Summarise   │  │ Digest sender  │  │
│  │ (Whisper)   │  │  (Claude AI) │  │ (Resend/Novu)  │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────┘  │
└─────────│────────────────│────────────────────────────── ┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                   Data layer                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Supabase   │  │ Cloudflare   │  │  Upstash Redis │  │
│  │  Postgres   │  │     R2       │  │  (result cache)│  │
│  │  + Auth     │  │(audio files) │  │                │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Environment strategy

| Environment | Frontend | Backend | Database | Storage |
|-------------|----------|---------|----------|---------|
| Local dev | `localhost:3000` | `localhost:8000` | Docker Postgres | Minio (S3-compatible) |
| Staging | Cloudflare Pages preview | Railway (develop branch) | Supabase (staging project) | Cloudflare R2 (staging bucket) |
| Production | Cloudflare Pages (main) | Railway (main branch) | Supabase (prod project) | Cloudflare R2 (prod bucket) |

The application code is **identical across all environments**. Only environment variables change. The S3 client in the backend is configured identically whether it points to Minio locally or R2 in production.

---

## Request lifecycle — update submission

1. User records or types a standup update in the browser.
2. If voice: browser uploads audio blob directly to a pre-signed R2 URL (avoids routing large files through the API server).
3. Frontend calls `POST /api/v1/updates` with either the R2 object key (voice) or raw text (text).
4. API validates, persists a `Update` record to Postgres with status `pending`, returns `202 Accepted` with the update ID.
5. API enqueues a `process_update` Celery task with the update ID.
6. Celery worker picks up the task:
   - If voice: fetches audio from R2, calls Whisper API for transcription.
   - Sends transcript (or raw text) to Claude API for summarisation.
   - Writes transcript + summary back to the `Update` record, sets status to `processed`.
7. WebSocket notifies the connected frontend that the update is ready.
8. At digest time (configurable per workspace): a scheduled Celery beat task runs `send_digest`, aggregates all updates for the workspace since the last digest, generates a digest via Claude API, and dispatches via Resend (email) and/or Novu (Slack, push).

---

## Key architectural decisions

### Why a monorepo?
Shared types can be kept in sync, CI pipelines see the full picture, and deployment is coordinated. The two apps are still independently deployable — the monorepo is a development convenience, not a coupling.

### Why Celery over serverless functions?
Transcription and summarisation are latency-tolerant but resource-intensive. Celery workers running on Railway give persistent processes, retry logic, task monitoring, and memory profiling hooks — all things that serverless makes difficult or expensive. The trade-off is slightly more infra complexity, which the Docker Compose setup absorbs locally.

### Why Supabase for auth instead of rolling our own?
Auth is a solved problem with severe security consequences if done poorly. Supabase Auth provides email/password, OAuth providers, JWT issuance, and row-level security policies in Postgres — all on the free tier. The time saved is better spent on product features.

### Why pre-signed URLs for audio uploads?
Routing a 5MB audio file through the FastAPI server wastes server resources and adds latency. Pre-signed R2 URLs let the browser upload directly to storage; the API only handles metadata. This is the same pattern used by S3-backed production systems at scale.

### Why Upstash Redis instead of self-managed?
Upstash is serverless Redis — no always-on instance, billed per request, free tier is generous for a small app. It handles both the Celery broker and result backend, and doubles as a cache layer for digest previews and workspace settings. No Redis infrastructure to manage.

---

## Non-functional requirements

| Requirement | Target |
|-------------|--------|
| Update submission API response | < 300ms (p95) |
| Transcription + summarisation (worker) | < 60 seconds (p95) |
| Digest delivery | Within 5 minutes of scheduled time |
| API uptime | 99.5% monthly |
| Audio file max size | 10MB (~10 min of audio) |
| Postgres row-level security | Enforced on all user-facing tables |

---

## Observability plan

- **Structured logging:** All FastAPI and Celery logs emit JSON with `request_id`, `user_id`, `workspace_id`, `duration_ms`. Collected by Railway's built-in log drain.
- **Error tracking:** Sentry free tier on both frontend and backend. Celery task failures auto-reported.
- **Worker monitoring:** Flower (Celery's built-in dashboard) running as a separate Railway service, protected behind basic auth.
- **Uptime monitoring:** Better Uptime free tier pinging the `/health` endpoint every 5 minutes.

---

## Security posture

- All communication over HTTPS/WSS — no exceptions.
- JWTs from Supabase Auth validated on every API request.
- Row-level security in Postgres — users can only query their own workspace's data, enforced at the database layer, not just the application layer.
- Audio files in R2 are private — accessible only via pre-signed URLs with 15-minute expiry.
- Secrets managed via Railway environment variables in production, `.env` files locally (gitignored, detect-secrets baseline committed).
- `bandit` + `semgrep` run on every PR to catch security anti-patterns before merge.
