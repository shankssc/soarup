# apps/api/app/lib/unsubscribe.py
# Signed (not encrypted) tokens for digest email unsubscribe links.
#
# Deliberately HMAC, not Fernet (contrast with app/lib/slack_crypto.py,
# which encrypts Slack webhook URLs because they must be recovered in
# full to actually post messages). An unsubscribe token only needs to
# prove "this link was genuinely issued by us for this recipient" —
# it doesn't need to be reversible/decryptable, just tamper-evident.
# HMAC-SHA256 is the right primitive for that: verification recomputes
# the signature and compares, it never needs to "decrypt" anything.

import base64
import hmac
import json
from hashlib import sha256

import structlog

from app.config import settings

logger = structlog.get_logger(__name__)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def generate_unsubscribe_token(workspace_id: str, user_id: str) -> str:
    """
    Generate a signed unsubscribe token for a single (workspace, user) pair.

    Token shape: <b64url(payload_json)>.<b64url(hmac_signature)>
    No expiry — digest emails are often read days later, and an expired
    unsubscribe link that silently fails to unsubscribe someone is worse
    than a link that works indefinitely (CAN-SPAM specifically requires
    unsubscribe mechanisms to remain functional).

    Raises:
        RuntimeError if UNSUBSCRIBE_SECRET_KEY is not configured — this
        should never happen in production (enforced by a Settings
        validator, same pattern as slack_encryption_key), but fails loudly
        rather than silently generating an unverifiable token.
    """
    if not settings.unsubscribe_secret_key:
        raise RuntimeError("UNSUBSCRIBE_SECRET_KEY is not configured — cannot generate " "unsubscribe tokens. Set it in the environment before sending " "digest emails.")

    payload = {"workspace_id": workspace_id, "user_id": user_id}
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)

    key = settings.unsubscribe_secret_key.get_secret_value().encode("utf-8")
    signature = hmac.new(key, payload_b64.encode("ascii"), sha256).digest()
    signature_b64 = _b64url_encode(signature)

    return f"{payload_b64}.{signature_b64}"


def verify_unsubscribe_token(token: str) -> tuple[str, str] | None:
    """
    Verify a signed unsubscribe token and extract (workspace_id, user_id).

    Returns None on any failure — malformed token, bad signature, missing
    secret key — rather than raising. Callers (the public unsubscribe
    endpoint) should treat None as "invalid link" without distinguishing
    why, so we don't leak information about why a forged token failed.
    """
    if not settings.unsubscribe_secret_key:
        logger.error("unsubscribe_verify_no_secret_configured")
        return None

    try:
        payload_b64, signature_b64 = token.split(".", 1)
    except ValueError:
        return None

    key = settings.unsubscribe_secret_key.get_secret_value().encode("utf-8")
    expected_signature = hmac.new(key, payload_b64.encode("ascii"), sha256).digest()

    try:
        provided_signature = _b64url_decode(signature_b64)
    except Exception:
        return None

    # constant-time comparison — do not use == here, timing differences
    # on a naive comparison can leak signature bytes to an attacker
    # probing the endpoint repeatedly.
    if not hmac.compare_digest(expected_signature, provided_signature):
        return None

    try:
        payload = json.loads(_b64url_decode(payload_b64))
        workspace_id = payload["workspace_id"]
        user_id = payload["user_id"]
    except Exception:
        return None

    if not isinstance(workspace_id, str) or not isinstance(user_id, str):
        return None

    return workspace_id, user_id
