# apps/api/app/db/redis.py

from redis.asyncio import Redis

from app.config import settings

_client: Redis | None = None


def get_redis_client() -> Redis:
    """
    Return a shared async Redis client for non-blocking operations
    (event publishing, TTL management, etc.).

    This is intentionally separate from the per-connection client in
    websockets.py — that one uses xread with block=N which holds the
    connection open and cannot be shared.
    """
    global _client
    if _client is None:
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _client
