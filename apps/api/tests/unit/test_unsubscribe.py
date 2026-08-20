# apps/api/tests/unit/test_unsubscribe.py
# Unit tests for app/lib/unsubscribe.py — signed digest unsubscribe tokens.
#
# Strategy:
#   - settings.unsubscribe_secret_key is patched per-test rather than relying
#     on whatever's in the environment, so these tests are deterministic
#     regardless of local/CI .env state.
#   - Round-trip (generate → verify) is the core happy path.
#   - Tampering tests mutate a valid token and confirm verification fails —
#     this is the actual security property being tested, not just "does it work."

from unittest.mock import patch

import pytest
from pydantic import SecretStr

from app.lib.unsubscribe import generate_unsubscribe_token, verify_unsubscribe_token

WORKSPACE_ID = "workspace-abc"
USER_ID = "user-xyz"
TEST_KEY = "test-unsubscribe-secret-key-do-not-use-in-prod"  # noqa: S105


@pytest.fixture(autouse=True)
def unsubscribe_key():
    with patch(
        "app.lib.unsubscribe.settings.unsubscribe_secret_key",
        SecretStr(TEST_KEY),
    ):
        yield


class TestGenerateToken:
    def test_generates_non_empty_string(self):
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_has_payload_and_signature_parts(self):
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        parts = token.split(".")
        assert len(parts) == 2

    def test_raises_when_secret_key_not_configured(self):
        with patch("app.lib.unsubscribe.settings.unsubscribe_secret_key", None):  # Noqa: SIM117
            with pytest.raises(RuntimeError, match="UNSUBSCRIBE_SECRET_KEY"):
                generate_unsubscribe_token(WORKSPACE_ID, USER_ID)

    def test_different_users_produce_different_tokens(self):
        token1 = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        token2 = generate_unsubscribe_token(WORKSPACE_ID, "different-user")
        assert token1 != token2

    def test_different_workspaces_produce_different_tokens(self):
        token1 = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        token2 = generate_unsubscribe_token("different-workspace", USER_ID)
        assert token1 != token2

    def test_same_inputs_produce_same_token(self):
        """
        HMAC is deterministic given the same key + payload — no nonce or
        timestamp in the payload, by design (see module docstring: no
        expiry, so unsubscribe links remain valid indefinitely).
        """
        token1 = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        token2 = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        assert token1 == token2


class TestVerifyToken:
    def test_round_trip_returns_original_ids(self):
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        result = verify_unsubscribe_token(token)
        assert result == (WORKSPACE_ID, USER_ID)

    def test_returns_none_when_secret_key_not_configured(self):
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        with patch("app.lib.unsubscribe.settings.unsubscribe_secret_key", None):
            assert verify_unsubscribe_token(token) is None

    def test_returns_none_for_malformed_token_no_separator(self):
        assert verify_unsubscribe_token("not-a-valid-token-at-all") is None

    def test_returns_none_for_empty_string(self):
        assert verify_unsubscribe_token("") is None

    def test_returns_none_for_tampered_payload(self):
        """
        Mutating the payload segment while keeping the original signature
        must fail verification — this is the actual tamper-detection
        property HMAC exists to provide.
        """
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        payload_b64, signature_b64 = token.split(".", 1)
        tampered = f"{payload_b64}x.{signature_b64}"
        assert verify_unsubscribe_token(tampered) is None

    def test_returns_none_for_tampered_signature(self):
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        payload_b64, signature_b64 = token.split(".", 1)
        tampered = f"{payload_b64}.{signature_b64}x"
        assert verify_unsubscribe_token(tampered) is None

    def test_returns_none_when_signed_with_different_key(self):
        """
        A token forged with a different key than the one currently
        configured must not verify — simulates an attacker guessing at
        the token format without knowing the real secret.
        """
        token = generate_unsubscribe_token(WORKSPACE_ID, USER_ID)
        with patch(
            "app.lib.unsubscribe.settings.unsubscribe_secret_key",
            SecretStr("a-completely-different-secret-key-value"),
        ):
            assert verify_unsubscribe_token(token) is None

    def test_returns_none_for_non_base64_signature_segment(self):
        assert verify_unsubscribe_token("cGF5bG9hZA.not!valid!base64!!!") is None

    def test_returns_none_for_valid_signature_but_non_json_payload(self):
        """
        Defends against a crafted payload segment that happens to produce
        a valid signature for itself but doesn't decode to the expected
        JSON shape (e.g. an attacker with a leaked key constructing a
        malformed payload).
        """
        import hmac
        from hashlib import sha256

        from app.lib.unsubscribe import _b64url_encode

        bad_payload_b64 = _b64url_encode(b"not-json-at-all")
        signature = hmac.new(
            TEST_KEY.encode("utf-8"),
            bad_payload_b64.encode("ascii"),
            sha256,
        ).digest()
        forged_token = f"{bad_payload_b64}.{_b64url_encode(signature)}"

        assert verify_unsubscribe_token(forged_token) is None

    def test_returns_none_when_payload_missing_required_keys(self):
        """
        A validly-signed payload missing workspace_id/user_id (e.g. an
        older or differently-shaped token format) must not verify — the
        payload structure is part of what's being trusted, not just the
        signature.
        """
        import hmac
        import json
        from hashlib import sha256

        from app.lib.unsubscribe import _b64url_encode

        incomplete_payload = json.dumps({"workspace_id": WORKSPACE_ID}).encode("utf-8")
        payload_b64 = _b64url_encode(incomplete_payload)
        signature = hmac.new(
            TEST_KEY.encode("utf-8"),
            payload_b64.encode("ascii"),
            sha256,
        ).digest()
        forged_token = f"{payload_b64}.{_b64url_encode(signature)}"

        assert verify_unsubscribe_token(forged_token) is None
