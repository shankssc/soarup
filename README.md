# 🚀 SoarUp

> Async standup platform for indie developers and small remote teams.

[![🚀 SoarUp CI](https://github.com/shankssc/soarup/actions/workflows/pr-checks.yml/badge.svg?branch=develop)](https://github.com/shankssc/soarup/actions/workflows/pr-checks.yml)
[![Codecov](https://codecov.io/gh/shankssc/soarup/branch/develop/graph/badge.svg?token=YOUR_TOKEN)](https://codecov.io/gh/shankssc/soarup)
[![CodeQL](https://github.com/shankssc/soarup/actions/workflows/codeql.yml/badge.svg)](https://github.com/shankssc/soarup/security/code-scanning)

**SoarUp** helps you stay in sync without the meeting. Submit a 30-second voice note or text update, get an AI-powered summary, and receive a clean digest when it works for your timezone.

## ✨ Core Features

- 🎙️ **Voice or text updates** – Record in under 60 seconds
- 🤖 **AI summarisation** – Whisper + Claude for accurate, concise digests
- 📬 **Flexible delivery** – Email, Slack, or in-app at your preferred time
- 🔐 **Privacy-first** – Row-level security, pre-signed uploads, no data sharing
- 🆓 **Generous free tier** – Built for solo devs and small teams

## 📚 Documentation

All architecture, specs, and decisions live in [`/specs`](./specs/):

| Spec                                                         | Description                                    |
| ------------------------------------------------------------ | ---------------------------------------------- |
| [00 — Product Vision](./specs/00-product-vision.md)          | Why this exists, who it's for, success metrics |
| [01 — Architecture](./specs/01-architecture.md)              | System overview, tech stack, request lifecycle |
| [02 — Data Models](./specs/02-data-models.md)                | Supabase Postgres schema, RLS policies         |
| [03 — API Contracts](./specs/03-api-contracts.md)            | REST + WebSocket endpoint specifications       |
| [04 — Frontend Spec](./specs/04-frontend-spec.md)            | Next.js 14 App Router, TypeScript, Tailwind    |
| [05 — Backend Spec](./specs/05-backend-spec.md)              | FastAPI, Celery, async processing pipeline     |
| [06 — Auth & Multi-tenancy](./specs/06-auth-multitenancy.md) | Supabase Auth, workspace roles, RLS            |
| [07 — Quality & Testing](./specs/07-quality-testing.md)      | Linting, testing, security, coverage gates     |
| [08 — Infra & CI/CD](./specs/08-infra-cicd.md)               | Docker, GitHub Actions, deploy pipelines       |
| [09 — Feature Roadmap](./specs/09-feature-roadmap.md)        | Milestones, acceptance criteria, sequencing    |

## 🛠️ Getting Started

### Prerequisites

- Docker + Docker Compose v2+
- Python 3.12 (for local backend dev)
- Node.js 20+ (for local frontend dev)
- `make` (optional but recommended)

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

# Run tests
make test          # Full suite in CI env
make test-api      # Backend only
make test-web      # Frontend only

# Run linters
make lint          # Both apps
make lint-api      # Backend only
make lint-web      # Frontend only

# Database migrations
make migrate                     # Run pending migrations
make migration name='add_field'  # Create new migration

# Shells
make shell-api    # Python shell in API container
make shell-db     # psql shell in database
make shell-web    # Shell in web container

# Logs
make logs service=api   # Tail API logs
make logs service=web   # Tail web logs

# Cleanup
make clean       # Remove containers, volumes, artifacts
```

## 🧭 Project Structure

```
soarup/
├── apps/
│ ├── api/ # FastAPI backend (Python 3.12)
│ │ ├── app/ # Application code
│ │ ├── tests/ # Pytest suite
│ │ └── ...
│ └── web/ # Next.js 14 frontend (App Router)
│ ├── src/app/ # App Router pages
│ ├── src/components/
│ └── ...
├── specs/ # All spec documents (source of truth)
├── .github/workflows/# CI/CD pipelines
├── docker-compose.yml# Local dev environment
├── Makefile # Developer convenience commands
└── README.md # You are here
```

## 🤝 Contributing

1. Create a feature branch from <kbd>develop</kbd>

2. Follow Conventional Commits: <kbd>feat: add voice recording</kbd>

3. Ensure all checks pass: <kbd>make lint && make test</kbd>

4. Open a PR against <kbd>develop</kbd>
