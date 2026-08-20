# apps/api/app/lib/email.py
# Thin wrapper around Resend for transactional email delivery.
#
# Non-fatal design: send failures are logged and return False but do NOT
# raise exceptions. The invite record is already created in the DB at the
# point this is called. A failed email means the admin can still copy and
# share the invite link manually from the pending invites list.

import asyncio
from pathlib import Path
from typing import Any

import resend
import structlog
from jinja2 import Environment, FileSystemLoader
from resend import Emails

from app.config import settings

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Jinja2 environment
# ---------------------------------------------------------------------------

_TEMPLATE_DIR = Path(__file__).parent.parent / "email_templates"
_jinja = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=True,
)


# ---------------------------------------------------------------------------
# Template renderers
# ---------------------------------------------------------------------------


def render_invite_email(
    workspace_name: str,
    inviter_name: str,
    invite_url: str,
    expires_in_days: int = 7,
) -> str:
    tmpl = _jinja.get_template("invite_email.html")
    return tmpl.render(
        workspace_name=workspace_name,
        inviter_name=inviter_name,
        invite_url=invite_url,
        expires_in_days=expires_in_days,
    )


def render_digest_email(
    workspace_name: str,
    digest_date: str,
    team_summary: str,
    items: list[dict[str, Any]],
    unsubscribe_url: str,
) -> str:
    tmpl = _jinja.get_template("digest_email.html")
    return tmpl.render(
        workspace_name=workspace_name,
        digest_date=digest_date,
        team_summary=team_summary,
        items=items,
        unsubscribe_url=unsubscribe_url,
    )


# ---------------------------------------------------------------------------
# Senders
# ---------------------------------------------------------------------------


async def send_invite_email(
    to_email: str,
    workspace_name: str,
    invited_by_name: str,
    invite_url: str,
    expires_in_days: int = 7,
) -> bool:
    """
    Send a workspace invite email via Resend.
    Returns True on success, False on failure.

    Local dev: RESEND_API_KEY absent → logs invite URL, skips send.
    Local dev: RESEND_API_KEY present → sends via onboarding@resend.dev
               (delivers only to the Resend account owner's email).
    Production: sends via RESEND_FROM_EMAIL (e.g. invites@soarup.app).
    """
    if not settings.resend_api_key:
        logger.info(
            "invite_email_dev_mode",
            to=to_email,
            invite_url=invite_url,
            note="Set RESEND_API_KEY to enable real email delivery",
        )
        return True

    try:
        resend.api_key = settings.resend_api_key.get_secret_value()

        params: Emails.SendParams = {
            "from": f"SoarUp <{settings.resend_from_email}>",
            "to": [to_email],
            "subject": (f"{invited_by_name} invited you to join " f"{workspace_name} on SoarUp"),
            "html": render_invite_email(
                workspace_name=workspace_name,
                inviter_name=invited_by_name,
                invite_url=invite_url,
                expires_in_days=expires_in_days,
            ),
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(
            "invite_email_sent",
            to=to_email,
            workspace=workspace_name,
            from_address=settings.resend_from_email,
        )
        return True
    except Exception as e:
        logger.error("invite_email_failed", to=to_email, error=str(e))
        return False


RESEND_BATCH_SIZE = 50


async def send_digest_email(
    to_emails: list[str],
    workspace_name: str,
    digest_date: str,
    html: str,
) -> bool:
    """
    Send a digest email to all opted-in workspace members via Resend.

    Args:
        to_emails:      List of recipient email addresses. Members with
                        email_notifications=False are excluded upstream
                        by the caller.
        workspace_name: Used in the email subject line.
        digest_date:    ISO date string (YYYY-MM-DD).
        html:           Pre-rendered HTML from render_digest_email.

    Returns:
        True if Resend accepted the request, False on any exception.
    """
    if not to_emails:
        return True

    if not settings.resend_api_key:
        logger.info(
            "digest_email_dev_mode",
            to=to_emails,
            workspace=workspace_name,
            digest_date=digest_date,
            note="Set RESEND_API_KEY to enable real email delivery",
        )
        return True

    try:
        resend.api_key = settings.resend_api_key.get_secret_value()

        for i in range(0, len(to_emails), RESEND_BATCH_SIZE):
            batch = to_emails[i : i + RESEND_BATCH_SIZE]
            params: Emails.SendParams = {
                "from": f"SoarUp <{settings.resend_from_email}>",
                "to": batch,
                "subject": f"{workspace_name} standup digest — {digest_date}",
                "html": html,
            }
            await asyncio.to_thread(resend.Emails.send, params)

        logger.info(
            "digest_email_sent",
            workspace=workspace_name,
            digest_date=digest_date,
            recipient_count=len(to_emails),
        )
        return True
    except Exception as e:
        logger.error(
            "digest_email_failed",
            workspace=workspace_name,
            digest_date=digest_date,
            error=str(e),
        )
        return False
