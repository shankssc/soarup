# apps/api/app/db/session.py
# Async SQLAlchemy session management

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.base import Base

# Create async engine with connection pooling
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,  # Log SQL queries in debug mode
    pool_pre_ping=True,  # Verify connections before use
    pool_size=5,  # Max connections in pool
    max_overflow=10,  # Extra connections beyond pool_size
    pool_timeout=30,  # Seconds to wait for connection
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Prevent stale data after commit
    autoflush=False,  # Manual flush control
)


async def init_db() -> None:
    """Initialize database (create tables if not exists)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close database connections."""
    await engine.dispose()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for FastAPI routes: provides async DB session.

    Usage in router:
        async def my_route(db: AsyncSession = Depends(get_db_session)):
            ...
    """
    session = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


# Optional: Helper for manual session management (tests, scripts)
async def get_db() -> AsyncSession:
    """Get a new session (caller responsible for commit/close)."""
    return AsyncSessionLocal()
