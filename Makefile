# Makefile - Developer convenience commands for SoarUp
# Usage: make <command> [args]

.PHONY: help dev dev-bg down test test-api test-web lint migrate migration clean logs shell-api shell-db setup

help:
	@echo "🚀 SoarUp - Async Standup Platform"
	@echo ""
	@echo "📦 Environment:"
	@echo "  make setup          - Initial setup: install deps, pre-commit, etc."
	@echo "  make dev            - Start all services (foreground)"
	@echo "  make dev-bg         - Start all services (background)"
	@echo "  make down           - Stop and remove all containers"
	@echo "  make clean          - Remove containers, volumes, and build artifacts"
	@echo ""
	@echo "🧪 Testing:"
	@echo "  make test               - Run full test suite in CI environment"
	@echo "  make test-api           - Run backend tests only"
	@echo "  make test-web           - Run frontend tests only"
	@echo "  make test-e2e           - Run Playwright E2E tests"
	@echo "  make test-services-up   - Start test Redis + Minio (docker-compose.test.yml)"
	@echo "  make test-services-down - Stop test Redis + Minio"
	@echo ""
	@echo "🔍 Quality:"
	@echo "  make lint           - Run linters on both apps"
	@echo "  make lint-api       - Run backend linters only"
	@echo "  make lint-web       - Run frontend linters only"
	@echo "  make typecheck      - Run TypeScript + Mypy checks"
	@echo ""
	@echo "🗄️  Database:"
	@echo "  make migrate        - Run backend database migrations"
	@echo "  make migration name='msg'  - Create new Alembic migration"
	@echo "  make shell-db       - Open psql shell in database container"
	@echo ""
	@echo "🐚 Shells:"
	@echo "  make shell-api      - Open Python shell in API container"
	@echo "  make shell-web      - Open Node shell in Web container"
	@echo ""
	@echo "🪵 Logs:"
	@echo "  make logs service=api  - Tail logs for a specific service"

# --- Setup ---
setup:
	@echo "🔧 Setting up SoarUp..."
	cd apps/api && pip install -r requirements-dev.txt
	cd apps/web && npm install
	pre-commit install
	@echo "✅ Setup complete. Run 'make dev' to start."

# --- Dev Environment ---
dev:
	docker compose up --build

dev-bg:
	docker compose up --build -d

down:
	docker compose down

# --- Test infrastructure (Redis + Minio for integration tests) ---
test-services-up:
	docker compose -f docker-compose.test.yml up -d
	@echo "✅ Test Redis (localhost:6380) + Minio (localhost:9010) started."
	@echo "   Run 'supabase start' separately if Postgres/GoTrue aren't up yet."

test-services-down:
	docker compose -f docker-compose.test.yml down

test-services-logs:
	docker compose -f docker-compose.test.yml logs -f

# --- Testing ---
test:
	test-services-up
	cd apps/api && pytest $(args)

test-api:
	cd apps/api && pytest $(args)

test-web:
	cd apps/web && npm run test $(args)

test-e2e:
	cd apps/web && npx playwright test $(args)

migrate-test:
	DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:54322/soarup_test \
	  docker compose exec api alembic upgrade head

test-cov:
	docker compose -f docker-compose.test.yml exec api \
	  pytest --cov=app --cov-report=html --cov-report=term-missing

# --- Quality ---
lint: lint-api lint-web

lint-api:
	cd apps/api && ruff check . && ruff format --check . && mypy .

lint-web:
	cd apps/web && npm run lint && npm run format:check

typecheck:
	cd apps/api && mypy .
	cd apps/web && npm run check

# --- Database ---
migrate:
	cd apps/api && alembic upgrade head

migration:
	@echo "Creating migration: $(name)"
	cd apps/api && alembic revision --autogenerate -m "$(name)"

shell-db:
	docker compose exec db psql -U postgres soarup

# --- Cleanup ---
clean:
	docker compose down -v --remove-orphans
	rm -rf apps/api/.pytest_cache apps/api/.mypy_cache apps/api/.ruff_cache
	rm -rf apps/api/__pycache__ apps/api/**/*.pyc
	rm -rf apps/web/.next apps/web/node_modules apps/web/.turbo
	rm -rf coverage/ .pytest_cache/
	@echo "🧹 Cleaned. Run 'make setup' to reinstall deps."

# --- Logs ---
logs:
	docker compose logs -f $(service)

# --- Shells ---
shell-api:
	docker compose exec api python

shell-web:
	docker compose exec web sh
