# apps/api/alembic/env.py
# Configure Alembic for PostgreSQL migrations — uses SYNC engine (Alembic requirement)

from app.config import settings
# Ensure models are imported for autogenerate
from app.models.profile import Profile
from app.models.base import Base
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import sys
from pathlib import Path

# Add app to Python path (for importing models/config)
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import your SQLAlchemy Base and models

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Add your model's MetaData object here for 'autogenerate' support
target_metadata = Base.metadata

# Override sqlalchemy.url with your config.py setting
# Convert async URL to sync URL for Alembic (Alembic uses sync engine)
sync_database_url = settings.database_url.replace(
    "postgresql+asyncpg://",
    "postgresql://",  # ← Sync URL for psycopg2
)
config.set_main_option("sqlalchemy.url", sync_database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no database connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with database connection).

    Uses SYNC engine — Alembic migrations are synchronous by design.
    """
    # Create SYNC engine (not async!)
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
