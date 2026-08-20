# apps/api/app/lib/slack_crypto.py
# Fernet symmetric encryption for Slack webhook URLs.

import structlog
from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = structlog.get_logger(__name__)


def _get_fernet() -> Fernet:
    key = settings.slack_encryption_key
    if not key:
        raise RuntimeError("SLACK_ENCRYPTION_KEY is not configured. " "Generate one with: python -c 'from cryptography.fernet " "import Fernet; print(Fernet.generate_key().decode())'")
    return Fernet(key.get_secret_value().encode())


def encrypt_webhook_url(url: str) -> str:
    """Encrypt a Slack webhook URL for storage in the database."""
    return _get_fernet().encrypt(url.encode()).decode()


def decrypt_webhook_url(encrypted: str) -> str | None:
    """
    Decrypt a stored webhook URL.
    Returns None if decryption fails (invalid key or corrupted data).
    """
    try:
        return _get_fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken:
        logger.error("slack_webhook_decrypt_failed")
        return None
