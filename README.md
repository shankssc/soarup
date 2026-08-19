# 🚀 SoarUp

> Async standup platform for indie developers and small remote teams —
> submit a text or voice update, get an AI summary, and stay in sync
> without the meeting.

[![CI](https://github.com/shankssc/soarup/actions/workflows/pr-checks.yml/badge.svg?branch=develop)](https://github.com/shankssc/soarup/actions/workflows/pr-checks.yml)
[![Codecov](https://codecov.io/gh/shankssc/soarup/branch/develop/graph/badge.svg)](https://codecov.io/gh/shankssc/soarup)
[![CodeQL](https://github.com/shankssc/soarup/actions/workflows/codeql.yml/badge.svg)](https://github.com/shankssc/soarup/security/code-scanning)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## [🔗 Live staging demo](https://app.soarupapi.dpdns.org)

## What is SoarUp?

Standups eat a fixed 15 minutes out of every distributed team's day,
regardless of how much there is to actually say. SoarUp replaces the
meeting with an async loop: submit a short text or voice update on your
own time, an AI pipeline transcribes and summarizes it, and your team
gets a clean digest delivered on a schedule that fits their timezone —
by email, Slack, or both.

Built solo, end-to-end, across nine feature milestones plus a dedicated
pre-deployment hardening pass — from an empty repo to a fully working
staging environment with real auth, real AI processing, real scheduled
email delivery, and real-time updates over WebSockets.

## ✨ Features

**Core loop**

- 🎙️ Voice or text daily standup updates, one per person per workspace per day
- 🤖 AI transcription (Whisper) + summarization (Claude, with automatic
  Haiku → Sonnet fallback on retry)
- ⚡ Real-time status updates in the UI via WebSockets + Redis Streams
  (not plain pub/sub — durable, replayable on reconnect)

**Teams**

- 👥 Multi-member workspaces with role-based access control
  (owner / admin / member)
- ✉️ Email invite flow with expiring, single-use invite links
- 📬 Scheduled team digests — Claude-generated team-level summary,
  delivered by email and optionally to Slack, on a per-workspace
  schedule and timezone
- 💬 Slack integration — encrypted-at-rest webhook, rich Block Kit
  digest + update notifications, test-send preview

**Insight**

- 📊 History & analytics — personal and team GitHub-style contribution
  heatmaps, current/best streaks (aware of each workspace's configured
  digest days, not just calendar days), team participation rates
- 🌐 Public, shareable "build in public" profile pages
  (`/u/:username`) with OpenGraph link previews

**Trust & operations**

- 🔐 Encrypted-at-rest credentials (Fernet), signed HMAC unsubscribe
  tokens (CAN-SPAM/GDPR compliant, per-workspace preference), GCRA
  rate limiting on mutation endpoints
- 🧭 Full observability — Sentry on both frontend and backend, with
  PII collection explicitly disabled
- ✅ Automated end-to-end test coverage (Playwright) across the core
  signup → submit → digest → invite flows

## 🏗️ Architecture

Backend: FastAPI + Celery (worker + beat) running in Docker on a
self-managed VM behind Caddy. Frontend: Next.js on Cloudflare Workers.
Auth and Postgres on Supabase, object storage on Cloudflare R2, cache /
task queue / event streaming on Redis, transactional email via Resend.

```mermaid
flowchart LR
    U((User)) --> FE[Next.js<br/>Cloudflare Workers]
    FE -- HTTPS --> API[FastAPI<br/>Docker · VM]

    subgraph Observability
        SEN[Sentry]
    end
    FE -.errors.-> SEN
    API -.errors.-> SEN

    subgraph "Data & Storage"
        DB[(Supabase<br/>Postgres + Auth)]
        R[(Redis<br/>queue · streams · rate limits)]
        S3[(Cloudflare R2<br/>audio · avatars)]
    end
    API --> DB
    API --> R
    API --> S3

    subgraph "Background Jobs"
        W[Celery Worker]
        B[Celery Beat<br/>scheduler]
    end
    W --> R
    W --> DB
    B --> R

    subgraph "External Services"
        AI[Anthropic Claude<br/>+ Whisper]
        MAIL[Resend]
        SLACK[Slack Webhooks]
    end
    W --> AI
    W --> MAIL
    W --> SLACK
```

Full breakdown — every component, the real-time event pipeline, the
digest scheduling pipeline, and the data model — lives in
**[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)**.

## 🧰 Tech Stack

| Layer                   | Choice                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| Frontend                | Next.js (App Router) · TypeScript · Tailwind · React Query · Zustand         |
| Backend                 | FastAPI · Python 3.12 · SQLAlchemy (async) · Alembic                         |
| Background jobs         | Celery (worker + beat)                                                       |
| Database & Auth         | Supabase (Postgres + GoTrue)                                                 |
| Cache / queue / streams | Redis                                                                        |
| Object storage          | Cloudflare R2                                                                |
| AI                      | Anthropic Claude (summarization) · faster-whisper (transcription)            |
| Email                   | Resend                                                                       |
| Chat integration        | Slack (Block Kit, incoming webhooks)                                         |
| Observability           | Sentry                                                                       |
| CI                      | GitHub Actions (lint, type-check, pytest, vitest, CodeQL, Codecov)           |
| Hosting                 | Cloudflare Workers (frontend) · self-managed VM via Docker + Caddy (backend) |

## 📚 Documentation

| Doc                                              | Description                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System topology, real-time event pipeline, digest scheduling pipeline, data model — all diagrammed |

> **Note on `specs/Scaffolding/`:** this folder contains the original
> pre-build planning documents written before development started.
> They're kept for historical context but no longer reflect the
> shipped system in several places (framework versions, the pub/sub →
> Redis Streams migration, features added after initial scoping).
> `docs/ARCHITECTURE.md` is the current source of truth.

## 🛠️ Getting Started

### Prerequisites

- Docker + Docker Compose v2+
- Python 3.12 (for local backend dev)
- Node.js 20+ (for local frontend dev)
- `make` (optional but recommended)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)

### Quick Start

```bash
# 1. Clone and enter project
git clone https://github.com/shankssc/soarup.git
cd soarup

# 2. Copy environment template
cp .env.example .env
# → Edit .env with your values (optional for local dev)

# 3. Install dependencies and setup
make setup

# 4. Start all services
make dev

# 5. Visit:
# → Frontend: http://localhost:3000
# → Backend API: http://localhost:8000
# → API Docs: http://localhost:8000/docs
# → Flower (Celery monitor): http://localhost:5555
```

### Common commands

```bash
# Tests
make test          # Full suite (API + web)
make test-api       # Backend only
make test-web       # Frontend only
make test-cov       # Backend with HTML coverage report → htmlcov/

# Linting
make lint           # Both apps
make lint-api
make lint-web

# Database
make migrate                     # Run pending migrations
make migration name='add_field'  # Create a new migration

# Shells
make shell-api      # Python shell in API container
make shell-db        # psql shell
make shell-web       # Shell in web container

# Logs
make logs service=api
make logs service=web

# Cleanup
make clean          # Remove containers, volumes, artifacts
```

## 🧪 Running Tests

Tests require two services running locally before invoking pytest:

**1. Supabase local stack** (Postgres + GoTrue auth):

```bash
supabase start
```

Postgres on `54322`, Auth on `54321`. Persists across sessions until
`supabase stop`.

**2. Isolated test Redis:**

```bash
docker compose -f docker-compose.test.yml up -d
```

Runs on `6380`, separate from dev Redis on `6379`.

**One-time test database setup:**

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres \
  -c "CREATE DATABASE soarup_test;"

DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:54322/soarup_test \
  alembic upgrade head
# or: make migrate-test
```

**CI vs local:**

| Concern    | Local                       | CI                             |
| ---------- | --------------------------- | ------------------------------ |
| Postgres   | Supabase CLI (port `54322`) | `supabase/setup-cli` action    |
| Redis      | `docker-compose.test.yml`   | `redis` service container      |
| JWT secret | Supabase CLI default        | Injected via `env:`            |
| Migrations | Run manually once           | Run as a CI step before pytest |

- `ENVIRONMENT=local` skips strict JWT issuer validation so local tests
  don't need to match Supabase's exact `iss` claim.
- Each test runs inside a nested transaction (SAVEPOINT) that is always
  rolled back — no test data persists between runs.
- Playwright E2E specs live under `apps/web/tests/e2e/` and cover
  signup → onboarding, text update submission, invite flow, and voice
  update submission end-to-end.

## 🧭 Project Structure

```
soarup/
├── apps/
│   ├── api/                 # FastAPI backend (Python 3.12)
│   │   ├── app/              # Application code (routers, services, repos, models, workers)
│   │   └── tests/             # Pytest suite (unit + integration)
│   └── web/                  # Next.js frontend (App Router)
│       ├── src/app/            # Routes
│       ├── src/components/     # UI + domain components
│       └── tests/e2e/          # Playwright end-to-end specs
├── docs/                     # Current architecture documentation
├── specs/Scaffolding/        # Historical pre-build planning docs (see note above)
├── .github/workflows/         # CI/CD pipelines
├── docker-compose.yml         # Local dev environment
├── docker-compose.test.yml    # Isolated test services
├── Makefile                   # Developer convenience commands
└── README.md
```

## 🚦 Project Status

Nine feature milestones complete (auth & onboarding through public
profiles), plus a dedicated pre-deployment hardening pass (observability,
security, rate limiting, E2E completion). Currently deployed to a live
staging environment. Open work is tracked entirely as labeled,
milestoned [GitHub Issues](https://github.com/shankssc/soarup/issues) —
`tech-debt`, `bug`, `ux-polish`, `security`, `testing`, `post-m9`.

### Why staging, not production?

This is a solo, self-funded project — infrastructure choices here are
a budget decision, not a knowledge gap. I picked a single Hetzner VM
running Celery + Redis + Postgres over Railway, managed queues, or
Kubernetes because it's the right cost-to-value tradeoff for a
pre-revenue solo build, not because I haven't used the fancier stuff.
Production is the next milestone once there's a reason — revenue,
users, or funding — to justify the added cost and operational overhead.

## 🤝 Contributing

1. Branch from `develop`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat: add voice recording`)
3. Ensure `make lint && make test` passes
4. Open a PR against `develop` — CI must be green before merge

## 📄 License

MIT — see [`LICENSE`](./LICENSE) for the full text.
