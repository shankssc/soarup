# 05 — Backend Spec
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 01-architecture.md, 02-data-models.md, 03-api-contracts.md

---

## Stack

| Concern | Tool | Why |
|---------|------|-----|
| Framework | FastAPI | Existing strength, async-native, OpenAPI auto-generation |
| Language | Python 3.12 | Latest stable, full match to existing toolchain |
| ORM | SQLAlchemy 2.x (async) | Mature, typed, pairs well with Alembic |
| Migrations | Alembic | Standard with SQLAlchemy |
| Task queue | Celery | Robust async workers with retry, beat scheduling, Flower monitoring |
| Message broker | Upstash Redis (via `redis-py`) | Celery broker + result backend + general cache |
| AI — transcription | OpenAI Whisper API | Best-in-class accuracy, simple API |
| AI — summarisation | Anthropic Claude API | Controllable, accurate summarisation |
| Email delivery | Resend | Clean API, generous free tier, React Email templates |
| Notifications | Novu | Multi-channel (Slack, push, in-app) |
| Storage client | `boto3` (S3-compatible) | Works identically against Minio locally and R2 in production |
| Validation | Pydantic v2 | FastAPI-native, strict type coercion |
| Auth | Supabase JWT validation (`python-jose`) | Stateless, no session DB needed |
| Testing | pytest + pytest-asyncio + httpx | Async-compatible API testing |
| Memory profiling | memray | Worker memory profiling in CI |
| Hosting | Railway | Simple deploy from GitHub, free hobby tier |

---

## Project structure

```
apps/api/
├── app/
│   ├── main.py                # FastAPI app factory, middleware, router registration
│   ├── config.py              # Settings via pydantic-settings (reads from env)
│   ├── database.py            # Async SQLAlchemy engine + session factory
│   ├── dependencies.py        # FastAPI dependency injection (auth, db session, workspace access)
│   ├── middleware.py          # Request ID, structured logging, CORS
│   ├── routers/
│   │   ├── health.py          # GET /health
│   │   ├── auth.py            # Profile create/update
│   │   ├── workspaces.py      # Workspace CRUD + member management
│   │   ├── updates.py         # Update submission, retrieval, deletion
│   │   ├── audio.py           # Pre-signed upload URL generation
│   │   ├── digests.py         # Digest retrieval + settings
│   │   └── websocket.py       # WS connection handler
│   ├── models/                # SQLAlchemy ORM models (mirror of 02-data-models.md)
│   │   ├── user_profile.py
│   │   ├── workspace.py
│   │   ├── update.py
│   │   └── digest.py
│   ├── schemas/               # Pydantic request/response schemas
│   │   ├── workspace.py
│   │   ├── update.py
│   │   └── digest.py
│   ├── services/              # Business logic layer
│   │   ├── workspace_service.py
│   │   ├── update_service.py
│   │   ├── audio_service.py   # Pre-signed URL generation, R2 interactions
│   │   ├── digest_service.py
│   │   └── notification_service.py
│   ├── workers/               # Celery task definitions
│   │   ├── celery_app.py      # Celery app factory + config
│   │   ├── tasks/
│   │   │   ├── transcribe.py  # Whisper transcription task
│   │   │   ├── summarise.py   # Claude summarisation task
│   │   │   └── digest.py      # Digest generation + delivery task
│   │   └── beat_schedule.py   # Celery beat periodic tasks
│   └── utils/
│       ├── auth.py            # JWT validation, workspace permission checks
│       ├── storage.py         # boto3 S3 client wrapper
│       ├── rate_limit.py      # Redis-backed rate limiting
│       └── websocket_manager.py # WS connection registry + broadcast
├── alembic/
│   ├── env.py
│   └── versions/              # Migration scripts
├── tests/
│   ├── conftest.py            # pytest fixtures (test DB, auth mocks, async client)
│   ├── unit/                  # Pure function tests
│   ├── integration/           # API endpoint tests using httpx AsyncClient
│   └── workers/               # Celery task tests
├── pyproject.toml             # All tool config (ruff, mypy, pytest, bandit, etc.)
├── requirements.txt
├── requirements-dev.txt
└── Dockerfile
```

---

## Application factory

`main.py` uses the application factory pattern — the FastAPI app is created inside a `create_app()` function. This allows clean test setup without side effects on import:

```python
def create_app() -> FastAPI:
    app = FastAPI(title="Stand-up Buddy API", version="0.1.0")
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(StructuredLoggingMiddleware)
    app.add_middleware(CORSMiddleware, ...)
    app.include_router(health_router)
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(workspace_router, prefix="/api/v1")
    app.include_router(update_router, prefix="/api/v1")
    app.include_router(audio_router, prefix="/api/v1")
    app.include_router(digest_router, prefix="/api/v1")
    app.include_router(ws_router, prefix="/api/v1")
    return app
```

---

## Authentication and authorisation

Every protected endpoint uses a FastAPI dependency `get_current_user` which:
1. Extracts the `Authorization: Bearer <token>` header.
2. Validates the JWT using Supabase's public key (fetched once on startup, cached).
3. Returns the `user_id` from the token claims.
4. Raises `HTTP 401` if the token is missing, expired, or invalid.

Workspace-level authorisation uses a second dependency `get_workspace_member` which:
1. Calls `get_current_user`.
2. Queries `workspace_members` for `(workspace_id, user_id)`.
3. Returns the member record including role.
4. Raises `HTTP 403` if not a member.
5. Accepts an optional `minimum_role` parameter for admin-only endpoints.

---

## Async processing pipeline

### Task chain

When `POST /updates` is called:

```
update_service.create_update()
  → persist Update(status='pending') to Postgres
  → enqueue process_update.delay(update_id)
  → return 202

process_update task (Celery):
  → fetch Update from DB
  → if voice: fetch audio from R2 → call Whisper API → store transcript
  → call Claude API with transcript (or raw_text) → store summary
  → set Update(status='processed')
  → broadcast WS message: update.status_changed
  → if all workspace members have submitted: optionally trigger early digest
```

### Digest task (scheduled)

Celery Beat runs `send_workspace_digests` daily per workspace at the configured time:

```
send_workspace_digests task:
  → query DigestSettings for workspaces due for digest
  → for each workspace:
      → aggregate all processed Updates since last digest
      → call Claude API to generate digest summary
      → persist Digest + DigestItems
      → dispatch via Resend (email) and/or Novu (Slack/push)
      → set Digest(status='sent')
      → broadcast WS message: digest.sent
```

### Retry and failure handling

- All Celery tasks have `max_retries=3` with exponential backoff (`countdown = 2 ** retry_number * 60` seconds).
- Failed tasks after max retries set the Update/Digest status to `failed` and emit a Sentry error.
- Transient failures (network timeouts, rate limits from AI APIs) retry automatically.
- Idempotency: tasks check the current status before doing work — safe to run multiple times.

---

## Structured logging

Every request and task emits a JSON log line with a consistent shape:

```json
{
  "timestamp": "2025-03-01T09:15:00.123Z",
  "level": "INFO",
  "request_id": "uuid",
  "user_id": "uuid",
  "workspace_id": "uuid",
  "method": "POST",
  "path": "/api/v1/workspaces/uuid/updates",
  "status_code": 202,
  "duration_ms": 47,
  "task_name": null
}
```

Celery tasks include `task_name` and `task_id` instead of HTTP fields.

---

## Configuration

All settings are defined in `config.py` using `pydantic-settings`. The `Settings` class reads from environment variables with type coercion and validation at startup:

```python
class Settings(BaseSettings):
    database_url: PostgresDsn
    redis_url: RedisDsn
    supabase_url: HttpUrl
    supabase_jwt_secret: SecretStr
    r2_account_id: str
    r2_access_key_id: SecretStr
    r2_secret_access_key: SecretStr
    r2_bucket_name: str
    r2_endpoint_url: HttpUrl
    openai_api_key: SecretStr        # For Whisper
    anthropic_api_key: SecretStr     # For Claude
    resend_api_key: SecretStr
    novu_api_key: SecretStr
    sentry_dsn: HttpUrl | None = None
    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = False
```

If any required variable is missing, the app fails to start with a clear error. No silent defaults for secrets.

---

## Python code quality toolchain

### `pyproject.toml` (consolidated config)

```toml
[tool.ruff]
target-version = "py312"
line-length = 88
select = ["E", "F", "I", "N", "UP", "S", "B", "A", "COM", "C4", "DTZ", "T20", "RET", "SIM", "ARG", "PTH"]
ignore = ["S101"]  # allow assert in tests

[tool.ruff.format]
quote-style = "double"

[tool.mypy]
python_version = "3.12"
strict = true
disallow_any_generics = true
disallow_untyped_defs = true
no_implicit_optional = true
warn_return_any = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "--cov=app --cov-report=xml --cov-fail-under=80"

[tool.coverage.run]
omit = ["tests/*", "alembic/*"]

[tool.bandit]
exclude_dirs = ["tests"]
skips = ["B101"]  # allow assert
```

### Pre-commit hooks (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic, sqlalchemy, fastapi]

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: [--baseline, .secrets.baseline]

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-toml
```

`bandit`, `pip-audit`, and `semgrep` run in CI only (not pre-commit) because they're slow.

---

## Testing approach

### Unit tests (`tests/unit/`)
Pure function tests — utility functions, service logic with mocked dependencies. No database, no network.

### Integration tests (`tests/integration/`)
Full API endpoint tests using `httpx.AsyncClient` with the FastAPI app. Use a dedicated test database (separate Docker Postgres container). Auth is mocked via fixture that returns a fake validated user.

### Worker tests (`tests/workers/`)
Celery tasks are called directly (not via queue) with mocked external services (Whisper API, Claude API, R2). Tests verify the task's effect on the database.

### Coverage gate
80% minimum overall coverage, enforced by `--cov-fail-under=80` in pytest config. CI fails if coverage drops below this.

---

## OpenAPI documentation

FastAPI auto-generates an OpenAPI schema at `/docs` (Swagger UI) and `/redoc`. In production this is disabled (`app = FastAPI(docs_url=None, redoc_url=None)`). In staging it is enabled for testing. The schema is exported as a static JSON file during CI and committed to `specs/openapi.json` for reference.
