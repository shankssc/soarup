# 07 — Quality and Testing
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 01-architecture.md

---

## Philosophy

Quality tooling is configured once, runs automatically, and never requires a developer to remember to run it. Every check that can be automated is automated. The goal is that merging to `main` is boring — not exciting, not risky.

---

## Backend quality (Python)

### Tool inventory

| Tool | Purpose | When it runs |
|------|---------|-------------|
| `ruff` (lint) | Linting — replaces flake8 + isort + many plugins | Pre-commit + CI |
| `ruff` (format) | Formatting — replaces black | Pre-commit + CI |
| `mypy` (strict) | Static type checking | Pre-commit + CI |
| `pytest` + `pytest-asyncio` | Unit + integration tests | CI |
| `pytest-cov` | Coverage reporting | CI |
| `bandit` | Security anti-pattern detection | CI (PR gate) |
| `semgrep` | Deep security scanning (OWASP rules) | CI (PR gate) |
| `detect-secrets` | Secrets detection in diffs | Pre-commit + CI |
| `pip-audit` | Known vulnerability scanning in dependencies | CI (weekly + on PR) |
| `memray` | Memory profiling of Celery workers | CI (on push to `main` and `develop`) |

### Coverage requirements

- Minimum 80% overall coverage enforced by `--cov-fail-under=80`.
- Coverage report uploaded to CI artifacts on every run.
- No coverage regression on `main` — a PR that drops coverage fails.
- Worker tasks (`tests/workers/`) count toward coverage.

### `pyproject.toml` — full quality config

```toml
[tool.ruff]
target-version = "py312"
line-length = 88
select = [
  "E", "F",      # pycodestyle + pyflakes
  "I",           # isort
  "N",           # pep8-naming
  "UP",          # pyupgrade
  "S",           # bandit (subset, fast ones)
  "B",           # bugbear
  "A",           # builtins shadowing
  "COM",         # trailing commas
  "C4",          # comprehensions
  "DTZ",         # datetime timezone safety
  "T20",         # no print statements
  "RET",         # return consistency
  "SIM",         # simplifications
  "ARG",         # unused arguments
  "PTH",         # pathlib over os.path
]
ignore = ["S101", "COM812"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"

[tool.mypy]
python_version = "3.12"
strict = true
disallow_any_generics = true
disallow_untyped_defs = true
disallow_untyped_calls = true
no_implicit_optional = true
warn_return_any = true
warn_unused_ignores = true
plugins = ["pydantic.mypy", "sqlalchemy.ext.mypy.plugin"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = [
  "--cov=app",
  "--cov-report=xml",
  "--cov-report=term-missing",
  "--cov-fail-under=80",
  "-v",
]

[tool.coverage.run]
omit = ["tests/*", "alembic/*", "app/main.py"]
branch = true

[tool.bandit]
exclude_dirs = ["tests", "alembic"]
skips = ["B101"]
```

### Pre-commit config (`.pre-commit-config.yaml`)

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.4
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        additional_dependencies:
          - pydantic
          - sqlalchemy[mypy]
          - fastapi
          - types-redis
          - types-boto3

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
      - id: check-json
      - id: check-merge-conflict
      - id: debug-statements
```

---

## Frontend quality (SvelteKit + TypeScript)

### Tool inventory

| Tool | Purpose | When it runs |
|------|---------|-------------|
| `tsc` + `svelte-check` | TypeScript + Svelte type checking | Pre-commit + CI |
| `ESLint` (with svelte plugin) | Linting | Pre-commit + CI |
| `Prettier` | Formatting | Pre-commit + CI |
| `Vitest` + `@testing-library/svelte` | Component + unit tests | CI |
| `vitest-axe` | Accessibility assertions in component tests | CI |
| `Playwright` | E2E tests on critical flows | CI (staging deploy) |
| `Lighthouse CI` | Performance + accessibility + best practices | CI (staging deploy) |
| `Storybook` | Component isolation + visual documentation | Built on every PR |

### ESLint config (`.eslintrc.cjs`)

```js
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:svelte/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2022,
    project: './tsconfig.json',
    extraFileExtensions: ['.svelte']
  },
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: { parser: '@typescript-eslint/parser' }
    }
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'warn'
  }
};
```

### Vitest config

```typescript
// vite.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/unit/**/*.{test,spec}.{ts,svelte}'],
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/', '.svelte-kit/', 'stories/'],
      thresholds: { lines: 70, functions: 70, branches: 70 }
    }
  }
});
```

### Playwright config

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ]
});
```

### Lighthouse CI config (`.lighthouserc.json`)

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4173/", "http://localhost:4173/login"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.90 }],
        "categories:best-practices": ["warn", { "minScore": 0.85 }],
        "categories:seo": ["warn", { "minScore": 0.80 }]
      }
    }
  }
}
```

Accessibility score below 90 fails the pipeline. Performance and best practices are warnings only.

---

## Memory profiling with memray (CI only)

Memray runs in CI against the Celery worker tasks that process audio — these are the most memory-intensive code paths. It does not run locally (Windows incompatibility).

CI step (in GitHub Actions):

```yaml
- name: Run memray on worker tasks
  run: |
    pip install memray
    python -m memray run -o memray-output.bin \
      -m pytest tests/workers/test_transcribe.py tests/workers/test_summarise.py
    python -m memray stats memray-output.bin
    python -m memray flamegraph memray-output.bin --output memray-flamegraph.html

- name: Upload memray flamegraph
  uses: actions/upload-artifact@v4
  with:
    name: memray-flamegraph
    path: memray-flamegraph.html
```

The flamegraph is uploaded as a CI artifact on every run. There is no automated pass/fail threshold yet — this is an observation tool. A threshold will be added once baseline memory usage is established.

---

## Commit message standards

Conventional Commits enforced via `commitlint`:

```
feat: add voice recording to update submission
fix: handle expired invite tokens gracefully
chore: update ruff to 0.4.4
docs: add API contract for digest preview endpoint
test: add integration tests for workspace invite flow
refactor: extract audio upload logic to service layer
ci: add memray profiling step to main workflow
```

`commitlint` runs as a commit-msg hook via husky (frontend) and as a standalone pre-commit hook on the Python side via `gitlint`.

Format: `<type>(<optional scope>): <description>`

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `perf`, `style`

---

## Dependency management

### Python
- `pip-audit` runs weekly via GitHub Actions scheduled workflow and on every PR.
- Dependabot is configured for Python dependencies with weekly PRs.
- `requirements.txt` pinned to exact versions. `requirements-dev.txt` for dev dependencies.
- Major version upgrades require a manual review + test run before merging.

### JavaScript/TypeScript
- Dependabot configured for npm with weekly PRs.
- `npm audit` runs in CI on every PR.
- Major version upgrades require a manual review.

---

## Security scanning

| Tool | Scope | Blocking? |
|------|-------|-----------|
| `bandit` | Python code — common security anti-patterns | Yes — HIGH severity |
| `semgrep` | Python code — OWASP Top 10 rules | Yes — ERROR severity |
| `detect-secrets` | All files — API keys, tokens, passwords | Yes — any finding |
| `pip-audit` | Python dependencies — known CVEs | Yes — HIGH/CRITICAL CVEs |
| `npm audit` | JS dependencies — known CVEs | Yes — HIGH/CRITICAL |
| Coderabbit AI | All code — logic issues, security patterns | Advisory (not blocking) |

A PR cannot merge to `main` or `develop` if any blocking check fails.
