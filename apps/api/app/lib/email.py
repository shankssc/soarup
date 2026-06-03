# apps/api/app/lib/email.py
# Thin wrapper around Resend for transactional email delivery.
#
# Non-fatal design: send failures are logged and return False but do NOT
# raise exceptions. The invite record is already created in the DB at the
# point this is called. A failed email means the admin can still copy and
# share the invite link manually from the pending invites list.
#
# React Email templates are deferred to M6 when the digest email is built —
# doing both invite and digest templates in one pass is more efficient.

import resend
import structlog

from app.config import settings

logger = structlog.get_logger(__name__)


def _get_client():
    return resend.Resend(
        api_key=(settings.resend_api_key.get_secret_value() if settings.resend_api_key else ""),
    )


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
    """
    try:
        client = _get_client()
        client.emails.send(
            {
                "from": "SoarUp <invites@soarup.app>",
                "to": [to_email],
                "subject": (f"{invited_by_name} invited you to join " f"{workspace_name} on SoarUp"),
                "html": _invite_email_html(
                    workspace_name=workspace_name,
                    invited_by_name=invited_by_name,
                    invite_url=invite_url,
                    expires_in_days=expires_in_days,
                ),
            }
        )
        logger.info(
            "invite_email_sent",
            to=to_email,
            workspace=workspace_name,
        )
        return True
    except Exception as e:
        logger.error("invite_email_failed", to=to_email, error=str(e))
        return False


def _invite_email_html(
    workspace_name: str,
    invited_by_name: str,
    invite_url: str,
    expires_in_days: int,
) -> str:
    """
    Plain HTML invite email — minimal styling, high deliverability.
    React Email template pass deferred to M6 alongside digest email.
    """
    return f"""<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="font-size: 20px; margin-bottom: 8px;">
    You've been invited to join {workspace_name}
  </h2>
  <p style="color: #666; margin-bottom: 24px;">
    {invited_by_name} has invited you to join their workspace on SoarUp,
    an async standup tool for developers.
  </p>
  <a href="{invite_url}"
     style="display: inline-block; background: #00687a; color: white;
            padding: 12px 24px; text-decoration: none; font-weight: 600;
            font-family: system-ui, sans-serif;">
    Accept invite
  </a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">
    This invite expires in {expires_in_days} days.
    If you didn't expect this email, you can safely ignore it.
  </p>
</body>
</html>"""
