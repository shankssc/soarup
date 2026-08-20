# apps/api/tests/unit/test_slack_crypto.py
# Unit tests for app/lib/slack_crypto.py
#
# Strategy:
#   - encrypt_webhook_url and decrypt_webhook_url are pure functions
#     (no DB, no network) — tested directly without fixtures
#   - Key validation tested by patching settings.slack_encryption_key

from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from app.lib.slack_crypto import decrypt_webhook_url, encrypt_webhook_url

TEST_URL = "https://hooks.slack.com/services/T123/B456/abcdefghijklmnop"

# Generate a valid test key at module load time
TEST_FERNET_KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def patch_slack_key():
    """Patch the settings singleton so all crypto tests have a valid key."""
    with patch(
        "app.lib.slack_crypto.settings.slack_encryption_key",
        SecretStr(TEST_FERNET_KEY),
    ):
        yield


class TestEncryptWebhookUrl:
    def test_returns_non_empty_string(self):
        result = encrypt_webhook_url(TEST_URL)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_encrypted_value_differs_from_original(self):
        result = encrypt_webhook_url(TEST_URL)
        assert result != TEST_URL

    def test_encrypted_value_is_not_plaintext(self):
        result = encrypt_webhook_url(TEST_URL)
        assert "hooks.slack.com" not in result

    def test_two_encryptions_of_same_url_differ(self):
        """Fernet uses random IV — same plaintext produces different ciphertext each time."""
        result1 = encrypt_webhook_url(TEST_URL)
        result2 = encrypt_webhook_url(TEST_URL)
        assert result1 != result2

    def test_raises_runtime_error_when_key_missing(self):
        with patch("app.lib.slack_crypto.settings") as mock_settings:
            mock_settings.slack_encryption_key = None
            with pytest.raises(RuntimeError, match="SLACK_ENCRYPTION_KEY"):
                encrypt_webhook_url(TEST_URL)


class TestDecryptWebhookUrl:
    def test_decrypt_returns_original_url(self):
        encrypted = encrypt_webhook_url(TEST_URL)
        result = decrypt_webhook_url(encrypted)
        assert result == TEST_URL

    def test_decrypt_with_wrong_key_returns_none(self):
        encrypted = encrypt_webhook_url(TEST_URL)

        # Patch to a different valid Fernet key
        from cryptography.fernet import Fernet

        wrong_key = Fernet.generate_key().decode()

        from pydantic import SecretStr

        with patch("app.lib.slack_crypto.settings") as mock_settings:
            mock_settings.slack_encryption_key = SecretStr(wrong_key)
            result = decrypt_webhook_url(encrypted)

        assert result is None

    def test_decrypt_with_corrupted_data_returns_none(self):
        result = decrypt_webhook_url("this-is-not-valid-fernet-data")
        assert result is None

    def test_decrypt_with_empty_string_returns_none(self):
        result = decrypt_webhook_url("")
        assert result is None

    def test_raises_runtime_error_when_key_missing(self):
        with patch("app.lib.slack_crypto.settings") as mock_settings:
            mock_settings.slack_encryption_key = None
            with pytest.raises(RuntimeError, match="SLACK_ENCRYPTION_KEY"):
                decrypt_webhook_url("anything")

    def test_roundtrip_preserves_url_with_special_characters(self):
        url = "https://hooks.slack.com/services/T123/B456/xyz-ABC_123"
        encrypted = encrypt_webhook_url(url)
        assert decrypt_webhook_url(encrypted) == url
