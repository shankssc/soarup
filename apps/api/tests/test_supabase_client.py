# apps/api/tests/test_supabase_client.py

from unittest.mock import patch, MagicMock
from app.lib.supabase import get_supabase_client


@patch("app.lib.supabase.create_client")
def test_supabase_client_creates_instance(mock_create_client):
    """Supabase client can be instantiated from settings (mocked)."""

    # Arrange: Mock the return value
    mock_client = MagicMock()
    mock_create_client.return_value = mock_client

    # Act: Call the function under test
    client = get_supabase_client()

    # Assert: create_client was called exactly once
    mock_create_client.assert_called_once()

    # Assert: Check the arguments using .args attribute (correct way)
    call_kwargs = mock_create_client.call_args.kwargs
    assert call_kwargs.get("supabase_url"), "supabase_url should be non-empty"
    assert call_kwargs.get("supabase_key") is not None, "supabase_key should be provided (can be empty string for local dev)"

    # Assert: Returned client has expected attributes
    assert client == mock_client
    assert hasattr(client, "auth")
