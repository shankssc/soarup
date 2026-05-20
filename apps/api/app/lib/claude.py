# apps/api/app/lib/claude.py
# Thin async wrapper around the Anthropic SDK.
# Handles model selection, retry fallback, and token tracking.

import re

import anthropic
import structlog
from anthropic.types import TextBlock

from app.config import settings

logger = structlog.get_logger(__name__)

# Primary model: Haiku — fast, cheap, sufficient for short standup text
PRIMARY_MODEL = "claude-haiku-4-5-20251001"
# Fallback model: Sonnet — higher quality, used on retry after Haiku failure
FALLBACK_MODEL = "claude-sonnet-4-20250514"

MAX_TOKENS = 256  # Summaries are short — 256 tokens is generous
TEMPERATURE = 0.3  # Low temperature for consistent, factual summaries


def _strip_markdown(text: str) -> str:
    """Strip markdown code fences if the model wraps its response."""
    text = re.sub(r"^```[a-zA-Z]*\n?", "", text.strip())
    text = re.sub(r"\n?```$", "", text)
    return text.strip()


async def summarise(
    prompt: str,
    use_fallback: bool = False,
) -> str:
    """
    Call Claude to generate a summary from a pre-built prompt.

    Args:
        prompt:       Fully-formatted prompt string (built by prompts.py).
        use_fallback: If True, uses FALLBACK_MODEL (Sonnet) instead of
                      PRIMARY_MODEL (Haiku). Set by the Celery task on retries.

    Returns:
        Generated summary text, stripped of leading/trailing whitespace.

    Raises:
        anthropic.APIError: On API failure. Intentionally not caught here —
                            the Celery task handles retries and fallback logic.
    """
    model = FALLBACK_MODEL if use_fallback else PRIMARY_MODEL

    client = anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else "",
    )

    logger.info("claude_request", model=model, prompt_length=len(prompt))

    message = await client.messages.create(
        model=model,
        max_tokens=MAX_TOKENS,
        temperature=TEMPERATURE,
        messages=[{"role": "user", "content": prompt}],
    )

    text_block = next(
        (block for block in message.content if isinstance(block, TextBlock)),
        None,
    )

    if text_block is None:
        raise ValueError(f"Claude returned no TextBlock in response. " f"Content types received: {[type(b).__name__ for b in message.content]}")

    summary = _strip_markdown(text_block.text)

    logger.info(
        "claude_response",
        model=model,
        input_tokens=message.usage.input_tokens,
        output_tokens=message.usage.output_tokens,
        summary_length=len(summary),
    )

    return summary
