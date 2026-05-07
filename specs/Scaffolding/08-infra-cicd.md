# 08 — Infrastructure and CI/CD

> **Status:** Living document · **Last updated:** 2025-03 · **References:** 01-architecture.md, 07-quality-testing.md

---

## Environments

| Environment | Purpose                                          | Triggered by      |
| ----------- | ------------------------------------------------ | ----------------- |
| Local       | Development, all services via Docker Compose     | `make dev`        |
| Staging     | Integration testing, preview of `develop` branch | Push to `develop` |
| Production  | Live platform                                    | Merge to `main`   |

---

## Monorepo structure

```
standup-buddy/
├── apps/
│   ├── web/                   # Next.js app
│   └── api/                   # FastAPI app
├── specs/                     # All spec documents
├── .github/
│   └── workflows/
│       ├── pr-checks.yml      # Runs on every PR
│       ├── deploy-staging.yml # Runs on push to develop
│       ├── deploy-production.yml # Runs on push to main
│       ├── scheduled-audit.yml   # Weekly dependency audit
│       └── release.yml        # Triggered by Release Please
├── docker-compose.yml         # Local dev (all services)
├── docker-compose.test.yml    # CI test environment
├── Makefile                   # Developer convenience commands
└── .env.example               # All required env vars documented
```

---

## Docker Compose (local dev)

`docker-compose.yml` starts the complete local environment. Every service mirrors its production counterpart as closely as possible.

```yaml
services:
  api:
    build: ./apps/api
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql+asyncpg://postgres:postgres@db:5432/standupbuddy # pragma: allowlist secret
      REDIS_URL: redis://redis:6379/0
      R2_ENDPOINT_URL: http://minio:9000
      R2_BUCKET_NAME: standup-buddy-local
      ENVIRONMENT: local
    volumes:
      - ./apps/api:/app
    depends_on: [db, redis, minio]
    command: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

  worker:
    build: ./apps/api
    environment: *api-env
    depends_on: [db, redis, minio]
    command: celery -A app.workers.celery_app worker --loglevel=info

  beat:
    build: ./apps/api
    environment: *api-env
    depends_on: [redis]
    command: celery -A app.workers.celery_app beat --loglevel=info

  flower:
    build: ./apps/api
    environment: *api-env
    ports: ["5555:5555"]
    depends_on: [redis]
    command: celery -A app.workers.celery_app flower --port=5555

  web:
    build: ./apps/web
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_BASE_URL: http://localhost:8000/api/v1
      NEXT_PUBLIC_WS_URL: ws://localhost:8000/api/v1/ws
    volumes:
      - ./apps/web:/app
    command: npm run dev -- --host

  db:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: standupbuddy
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  minio:
    image: minio/minio
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

**Note on Minio:** Minio is used exclusively for local development. It is an S3-compatible object store that accepts the same `boto3` calls as Cloudflare R2. Staging and production use real R2 buckets.

---

## Makefile

```makefile
.PHONY: dev test lint migrate clean

dev:
	docker compose up --build

dev-bg:
	docker compose up --build -d

test:
	docker compose -f docker-compose.test.yml up --abort-on-container-exit --build

test-api:
	cd apps/api && pytest

test-web:
	cd apps/web && npm run test

lint:
	cd apps/api && ruff check . && mypy .
	cd apps/web && npm run lint && npm run check

migrate:
	cd apps/api && alembic upgrade head

migration:
	cd apps/api && alembic revision --autogenerate -m "$(name)"

clean:
	docker compose down -v --remove-orphans

logs:
	docker compose logs -f $(service)

shell-api:
	docker compose exec api python

shell-db:
	docker compose exec db psql -U postgres standupbuddy
```

---

## GitHub Actions workflows

### `pr-checks.yml` — runs on every PR to `develop` or `main`

```yaml
name: PR checks

on:
  pull_request:
    branches: [main, develop]

jobs:
  api-quality:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: standupbuddy_test }
        options: --health-cmd pg_isready
      redis:
        image: redis:7-alpine
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r apps/api/requirements-dev.txt
      - name: Ruff lint
        run: cd apps/api && ruff check .
      - name: Ruff format check
        run: cd apps/api && ruff format --check .
      - name: Mypy
        run: cd apps/api && mypy .
      - name: Bandit
        run: cd apps/api && bandit -r app/ -c pyproject.toml
      - name: Semgrep
        uses: semgrep/semgrep-action@v1
        with:
          config: p/owasp-top-ten p/python
      - name: Detect secrets
        run: cd apps/api && detect-secrets-hook --baseline .secrets.baseline
      - name: Pip audit
        run: cd apps/api && pip-audit -r requirements.txt
      - name: Pytest + coverage
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/standupbuddy_test # pragma: allowlist secret
          REDIS_URL: redis://localhost:6379/0
        run: cd apps/api && pytest
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with: { files: apps/api/coverage.xml }

  api-memray:
    runs-on: ubuntu-latest
    if: github.base_ref == 'main' || github.base_ref == 'develop'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install memray -r apps/api/requirements-dev.txt
      - name: Run memray on workers
        run: |
          cd apps/api
          python -m memray run -o memray-output.bin \
            -m pytest tests/workers/ --no-header -q
          python -m memray flamegraph memray-output.bin \
            --output memray-flamegraph.html
      - uses: actions/upload-artifact@v4
        with:
          name: memray-flamegraph-${{ github.sha }}
          path: apps/api/memray-flamegraph.html

  web-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          {
            node-version: "20",
            cache: "npm",
            cache-dependency-path: apps/web/package-lock.json,
          }
      - run: cd apps/web && npm ci
      - name: Type check
        run: cd apps/web && npm run check
      - name: ESLint
        run: cd apps/web && npm run lint
      - name: Prettier
        run: cd apps/web && npm run format:check
      - name: Vitest
        run: cd apps/web && npm run test:coverage
      - name: Build Storybook
        run: cd apps/web && npm run build-storybook
      - name: npm audit
        run: cd apps/web && npm audit --audit-level=high

  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: wagoid/commitlint-github-action@v6
```

---

### `deploy-staging.yml` — runs on push to `develop`

```yaml
name: Deploy staging

on:
  push:
    branches: [develop]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway (staging)
        uses: bervProject/railway-deploy@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: api-staging

  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd apps/web && npm ci && npm run build
        env:
          NEXT_PUBLIC_API_BASE_URL: ${{ secrets.STAGING_API_URL }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
      - name: Deploy to Cloudflare Pages (staging)
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: standup-buddy-staging
          directory: apps/web/.vercel/output/static

  e2e:
    needs: [deploy-api, deploy-web]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd apps/web && npm ci && npx playwright install --with-deps
      - name: Run Playwright E2E
        run: cd apps/web && npm run test:e2e
        env:
          PLAYWRIGHT_BASE_URL: ${{ secrets.STAGING_WEB_URL }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report/

  lighthouse:
    needs: [deploy-web]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            ${{ secrets.STAGING_WEB_URL }}
            ${{ secrets.STAGING_WEB_URL }}/login
          configPath: .lighthouserc.json
          uploadArtifacts: true
```

---

### `deploy-production.yml` — runs on push to `main`

Same structure as staging deploy but targeting production secrets and services. Also triggers `release.yml`.

---

### `scheduled-audit.yml` — runs weekly

```yaml
name: Weekly dependency audit

on:
  schedule:
    - cron: "0 9 * * 1" # Monday 9am UTC

jobs:
  audit-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install pip-audit
      - run: pip-audit -r apps/api/requirements.txt -f json -o pip-audit-report.json
      - uses: actions/upload-artifact@v4
        with: { name: pip-audit-report, path: pip-audit-report.json }

  audit-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd apps/web && npm audit --audit-level=moderate
```

---

## Branch protection rules (GitHub settings)

Applied to both `main` and `develop`:

- Require pull request before merging (no direct pushes)
- Require all status checks to pass: `api-quality`, `web-quality`, `commitlint`
- Require branches to be up to date before merging
- Require conversation resolution before merging
- No force pushes
- No deletions

---

## Release process

Using **Release Please** (Google):

1. Conventional commits on `main` are read by Release Please.
2. Release Please opens a "Release PR" that bumps the version in `pyproject.toml` and `package.json` and updates `CHANGELOG.md`.
3. When the Release PR is merged, Release Please creates a GitHub release and tags the commit.
4. The tag triggers the production deploy workflow.

Versioning follows Semantic Versioning: `MAJOR.MINOR.PATCH`.

---

## Secrets inventory

All secrets are stored in GitHub Actions Secrets (per environment) and Railway environment variables (for runtime). Never in code, never in `.env` files committed to the repo.

| Secret name             | Used in       | Purpose                     |
| ----------------------- | ------------- | --------------------------- |
| `RAILWAY_TOKEN`         | CI deploy     | Railway deployment auth     |
| `CLOUDFLARE_API_TOKEN`  | CI deploy     | Cloudflare Pages deploy     |
| `CLOUDFLARE_ACCOUNT_ID` | CI deploy     | Cloudflare account          |
| `SUPABASE_URL`          | API runtime   | Supabase project URL        |
| `SUPABASE_JWT_SECRET`   | API runtime   | JWT validation              |
| `R2_ACCESS_KEY_ID`      | API runtime   | R2 storage auth             |
| `R2_SECRET_ACCESS_KEY`  | API runtime   | R2 storage auth             |
| `OPENAI_API_KEY`        | API runtime   | Whisper transcription       |
| `ANTHROPIC_API_KEY`     | API runtime   | Claude summarisation        |
| `RESEND_API_KEY`        | API runtime   | Email delivery              |
| `NOVU_API_KEY`          | API runtime   | Multi-channel notifications |
| `SENTRY_DSN`            | Both runtimes | Error tracking              |

All secrets exist in both `staging` and `production` variants with separate values.
