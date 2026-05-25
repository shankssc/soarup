# apps/api/tests/unit/test_claude_client.py
# Tests for the Claude summarisation wrapper (app/lib/claude.py).
#
# Strategy:
#   - anthropic.AsyncAnthropic is patched at construction time
#   - Response content blocks use MagicMock(spec=TextBlock) so isinstance
#     checks in the source pass correctly
#   - No real API calls are made

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from anthropic.types import TextBlock

from app.lib.claude import FALLBACK_MODEL, PRIMARY_MODEL, summarise

pytestmark = pytest.mark.db

MOCK_SUMMARY = "They completed the auth flow and began working on the dashboard."
PROMPT = "Summarise this standup update."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_text_block(text: str) -> MagicMock:
    """MagicMock with spec=TextBlock so isinstance(block, TextBlock) is True."""
    block = MagicMock(spec=TextBlock)
    block.text = text
    return block


def _make_message_response(text: str = MOCK_SUMMARY) -> MagicMock:
    """Mock Anthropic message response with a single TextBlock."""
    response = MagicMock()
    response.content = [_make_text_block(text)]
    response.usage.input_tokens = 10
    response.usage.output_tokens = 20
    return response


def _patch_client(return_value: MagicMock | None = None, side_effect: Exception | None = None):
    """Patch anthropic.AsyncAnthropic to return a mock client."""
    mock_client = MagicMock()
    mock_client.messages.create = AsyncMock(
        return_value=return_value or _make_message_response(),
        side_effect=side_effect,
    )
    return patch("app.lib.claude.anthropic.AsyncAnthropic", return_value=mock_client), mock_client


# ---------------------------------------------------------------------------
# Model selection
# ---------------------------------------------------------------------------


class TestModelSelection:
    @pytest.mark.asyncio
    async def test_uses_primary_model_when_use_fallback_false(self):
        patcher, mock_client = _patch_client()
        with patcher:
            await summarise(PROMPT, use_fallback=False)

        _, kwargs = mock_client.messages.create.call_args
        assert kwargs["model"] == PRIMARY_MODEL

    @pytest.mark.asyncio
    async def test_uses_fallback_model_when_use_fallback_true(self):
        patcher, mock_client = _patch_client()
        with patcher:
            await summarise(PROMPT, use_fallback=True)

        _, kwargs = mock_client.messages.create.call_args
        assert kwargs["model"] == FALLBACK_MODEL

    @pytest.mark.asyncio
    async def test_default_use_fallback_is_false(self):
        """Default call (no use_fallback arg) uses PRIMARY_MODEL."""
        patcher, mock_client = _patch_client()
        with patcher:
            await summarise(PROMPT)

        _, kwargs = mock_client.messages.create.call_args
        assert kwargs["model"] == PRIMARY_MODEL


# ---------------------------------------------------------------------------
# Return value
# ---------------------------------------------------------------------------


class TestReturnValue:
    @pytest.mark.asyncio
    async def test_returns_text_content(self):
        patcher, _ = _patch_client(_make_message_response(MOCK_SUMMARY))
        with patcher:
            result = await summarise(PROMPT)

        assert result == MOCK_SUMMARY

    @pytest.mark.asyncio
    async def test_strips_leading_trailing_whitespace(self):
        padded = f"  \n  {MOCK_SUMMARY}  \n  "
        patcher, _ = _patch_client(_make_message_response(padded))
        with patcher:
            result = await summarise(PROMPT)

        assert result == MOCK_SUMMARY
        assert not result.startswith(" ")
        assert not result.endswith(" ")

    @pytest.mark.asyncio
    async def test_strips_markdown_code_fences(self):
        fenced = f"```\n{MOCK_SUMMARY}\n```"
        patcher, _ = _patch_client(_make_message_response(fenced))
        with patcher:
            result = await summarise(PROMPT)

        assert "```" not in result
        assert result == MOCK_SUMMARY

    @pytest.mark.asyncio
    async def test_strips_markdown_code_fences_with_language(self):
        fenced = f"```markdown\n{MOCK_SUMMARY}\n```"
        patcher, _ = _patch_client(_make_message_response(fenced))
        with patcher:
            result = await summarise(PROMPT)

        assert "```" not in result

    @pytest.mark.asyncio
    async def test_plain_text_returned_unchanged(self):
        """Text with no fences or extra whitespace is returned as-is."""
        plain = "Clean summary with no fences."
        patcher, _ = _patch_client(_make_message_response(plain))
        with patcher:
            result = await summarise(PROMPT)

        assert result == plain


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    @pytest.mark.asyncio
    async def test_api_error_propagates(self):
        """anthropic.APIError is not caught — propagates to the Celery task."""
        patcher, _ = _patch_client(side_effect=Exception("Rate limit exceeded"))
        with patcher:  # Noqa: SIM117
            with pytest.raises(Exception, match="Rate limit exceeded"):
                await summarise(PROMPT)

    @pytest.mark.asyncio
    async def test_no_text_block_raises_value_error(self):
        """If response contains no TextBlock, ValueError is raised."""
        response = MagicMock()
        response.content = []  # no blocks
        response.usage.input_tokens = 0
        response.usage.output_tokens = 0

        patcher, _ = _patch_client(return_value=response)
        with patcher:  # Noqa: SIM117
            with pytest.raises(ValueError, match="no TextBlock"):
                await summarise(PROMPT)

    @pytest.mark.asyncio
    async def test_non_text_block_raises_value_error(self):
        """Response with only non-TextBlock content raises ValueError."""
        non_text = MagicMock()  # no spec=TextBlock so isinstance returns False
        response = MagicMock()
        response.content = [non_text]
        response.usage.input_tokens = 0
        response.usage.output_tokens = 0

        patcher, _ = _patch_client(return_value=response)
        with patcher:  # Noqa: SIM117
            with pytest.raises(ValueError):
                await summarise(PROMPT)

    @pytest.mark.asyncio
    async def test_connection_error_propagates(self):
        """Network errors propagate unchanged."""
        patcher, _ = _patch_client(side_effect=Exception("connection failed"))
        with patcher:  # Noqa: SIM117
            with pytest.raises(Exception, match="connection failed"):
                await summarise(PROMPT)
