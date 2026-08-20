# apps/api/tests/unit/test_slack_client.py
# Unit tests for app/lib/slack.py
#
# Strategy:
#   - post_to_slack is an async function wrapping httpx
#   - All HTTP calls are mocked via respx or unittest.mock
#   - No real network calls made

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.lib.slack import post_to_slack

WEBHOOK_URL = "https://hooks.slack.com/services/T123/B456/abc"
BLOCKS = [{"type": "section", "text": {"type": "mrkdwn", "text": "Hello"}}]
FALLBACK_TEXT = "Hello from SoarUp"


def _mock_response(status_code: int = 200, text: str = "ok") -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.text = text
    return response


class TestPostToSlack:
    @pytest.mark.asyncio
    async def test_returns_true_on_200_ok(self):
        mock_response = _mock_response(200, "ok")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            result = await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_on_non_200_response(self):
        mock_response = _mock_response(400, "invalid_payload")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            result = await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_body_is_not_ok(self):
        """200 status but body is not 'ok' — Slack webhook contract."""
        mock_response = _mock_response(200, "channel_not_found")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            result = await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_on_timeout(self):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            result = await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_on_connection_error(self):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=httpx.ConnectError("connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            result = await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_on_unexpected_exception(self):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception("something unexpected"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            result = await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_posts_to_correct_webhook_url(self):
        mock_response = _mock_response(200, "ok")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        call_args = mock_client.post.call_args
        assert call_args.args[0] == WEBHOOK_URL

    @pytest.mark.asyncio
    async def test_posts_json_payload_with_blocks_and_text(self):
        mock_response = _mock_response(200, "ok")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        call_kwargs = mock_client.post.call_args.kwargs
        assert "json" in call_kwargs
        assert call_kwargs["json"]["blocks"] == BLOCKS
        assert call_kwargs["json"]["text"] == FALLBACK_TEXT

    @pytest.mark.asyncio
    async def test_sets_content_type_header(self):
        mock_response = _mock_response(200, "ok")
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.lib.slack.httpx.AsyncClient", return_value=mock_client):
            await post_to_slack(
                webhook_url=WEBHOOK_URL,
                blocks=BLOCKS,
                fallback_text=FALLBACK_TEXT,
            )

        call_kwargs = mock_client.post.call_args.kwargs
        assert call_kwargs["headers"]["Content-Type"] == "application/json"
