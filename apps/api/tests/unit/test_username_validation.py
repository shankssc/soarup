# apps/api/tests/unit/test_username_validation.py
# Unit tests for validate_username() — pure function, no DB access.

import pytest

from app.schemas.auth import validate_username


class TestValidateUsername:
    # -----------------------------------------------------------------------
    # Valid usernames
    # -----------------------------------------------------------------------

    def test_valid_simple_lowercase(self):
        assert validate_username("suyash") == "suyash"

    def test_valid_with_hyphen(self):
        assert validate_username("suyash-sharma") == "suyash-sharma"

    def test_valid_with_numbers(self):
        assert validate_username("dev123") == "dev123"

    def test_valid_minimum_length(self):
        # 3 chars — minimum allowed
        assert validate_username("abc") == "abc"

    def test_valid_maximum_length(self):
        # 30 chars — maximum allowed
        assert validate_username("a" * 28 + "bc") == "a" * 28 + "bc"

    def test_valid_mixed_alphanumeric_and_hyphens(self):
        assert validate_username("my-user-123") == "my-user-123"

    def test_lowercases_input(self):
        # validate_username lowercases before validating
        assert validate_username("Suyash") == "suyash"

    def test_strips_whitespace(self):
        assert validate_username("  suyash  ") == "suyash"

    # -----------------------------------------------------------------------
    # Invalid — length
    # -----------------------------------------------------------------------

    def test_too_short_two_chars(self):
        with pytest.raises(ValueError, match="3-30 characters"):
            validate_username("ab")

    def test_too_short_one_char(self):
        with pytest.raises(ValueError, match="3-30 characters"):
            validate_username("a")

    def test_too_long_31_chars(self):
        with pytest.raises(ValueError, match="3-30 characters"):
            validate_username("a" * 29 + "bc")  # 31 chars

    # -----------------------------------------------------------------------
    # Invalid — hyphens
    # -----------------------------------------------------------------------

    def test_starts_with_hyphen(self):
        with pytest.raises(ValueError, match="Cannot start or end with a hyphen"):
            validate_username("-suyash")

    def test_ends_with_hyphen(self):
        with pytest.raises(ValueError, match="Cannot start or end with a hyphen"):
            validate_username("suyash-")

    def test_consecutive_hyphens(self):
        with pytest.raises(ValueError, match="consecutive hyphens"):
            validate_username("su--yash")

    # -----------------------------------------------------------------------
    # Invalid — special characters
    # -----------------------------------------------------------------------

    def test_at_symbol(self):
        with pytest.raises(ValueError):
            validate_username("suyash@dev")

    def test_underscore(self):
        with pytest.raises(ValueError):
            validate_username("suyash_dev")

    def test_dot(self):
        with pytest.raises(ValueError):
            validate_username("suyash.dev")

    def test_space(self):
        with pytest.raises(ValueError):
            validate_username("suyash dev")

    def test_uppercase_after_strip(self):
        # Uppercase is lowercased first — "SUYASH" becomes "suyash" which is valid
        assert validate_username("SUYASH") == "suyash"

    def test_empty_string(self):
        with pytest.raises(ValueError):
            validate_username("")
