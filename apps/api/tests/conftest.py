# apps/api/tests/conftest.py
# Test configuration — fixes import paths for monorepo structure

import sys
from pathlib import Path

# Add the parent directory (apps/api) to sys.path
# This allows tests to import 'app' as if they were running from the package root
sys.path.insert(0, str(Path(__file__).parent.parent.resolve()))

# Optional: Set environment for tests
import os
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/soarup_test") # pragma: allowlist secret
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
