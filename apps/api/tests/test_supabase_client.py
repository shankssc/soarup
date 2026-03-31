# apps/api/tests/test_supabase_client.py

import pytest
from unittest.mock import patch, MagicMock
from supabase import AsyncClient
from app.lib.supabase import get_supabase_client


@pytest.fixture
def mock_create_client():
    """Fixture to patch create_async_client."""
    with patch("app.lib.supabase.create_async_client") as mock:
        yield mock


@pytest.mark.asyncio
async def test_supabase_client_creates_instance(mock_create_client):
    """Supabase async client can be instantiated from settings (mocked)."""

    # Arrange: Mock the return value
    mock_client = MagicMock(spec=AsyncClient)
    mock_client.auth = MagicMock()

    # IMPORTANT: Since create_async_client is async, mock it as AsyncMock
    mock_create_client.return_value = mock_client  # Will be awaited

    # Act: Call the function under test
    client = await get_supabase_client()  # ← Await the async function

    # Assert: create_async_client was called exactly once
    mock_create_client.assert_called_once()

    # Assert: Check the arguments
    call_kwargs = mock_create_client.call_args.kwargs
    assert call_kwargs.get("supabase_url"), "supabase_url should be non-empty"
    assert call_kwargs.get("supabase_key") is not None, "supabase_key should be provided"

    # Assert: Returned client has expected attributes
    assert client == mock_client
    assert hasattr(client, "auth")
