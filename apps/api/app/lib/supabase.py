# apps/api/app/lib/supabase.py

from supabase import AsyncClient, create_async_client

from app.config import settings


async def get_supabase_client() -> AsyncClient:
    """
    Create and return an async Supabase client instance.

    Uses settings from config.py (loaded from .env).
    Returns a new client per call — Supabase client is lightweight.

    For auth operations:
    - Use await client.auth.sign_in_with_password() for login
    - Use await client.auth.sign_up() for registration
    - Use await client.auth.get_user(jwt) to validate tokens
    """
    return await create_async_client(
        supabase_url=str(settings.supabase_url),
        supabase_key=settings.supabase_anon_key.get_secret_value() if settings.supabase_anon_key else "",
    )
