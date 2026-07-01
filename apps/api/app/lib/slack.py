# apps/api/app/lib/slack.py
# Thin async wrapper for posting to Slack incoming webhooks.

from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


async def post_to_slack(
    webhook_url: str,
    blocks: list[dict[str, Any]],
    fallback_text: str,
) -> bool:
    """
    POST a Block Kit message to a Slack incoming webhook.

    Args:
        webhook_url: Decrypted Slack incoming webhook URL
        blocks: Block Kit blocks list from slack_blocks.py
        fallback_text: Plain text fallback for notifications/accessibility

    Returns:
        True on success (Slack returns "ok"), False on any failure.
        Non-fatal — caller decides whether to raise or log.
    """
    payload = {"text": fallback_text, "blocks": blocks}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if response.status_code == 200 and response.text == "ok":
                logger.info("slack_message_sent", status="ok")
                return True
            else:  # Noqa: RET505
                logger.warning(
                    "slack_message_failed",
                    status_code=response.status_code,
                    body=response.text[:200],
                )
                return False
    except httpx.TimeoutException:
        logger.warning("slack_message_timeout", webhook_prefix=webhook_url[:40])
        return False
    except Exception as e:
        logger.error("slack_message_error", error=str(e))
        return False
