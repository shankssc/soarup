# tests/unit/test_schemas.py

import pytest
from pydantic import ValidationError

from app.schemas.auth import ResetPasswordRequest


def test_password_too_short_raises():
    with pytest.raises(ValidationError):
        ResetPasswordRequest(token="a" * 32, new_password="Short1")  # Noqa: S106 # pragma: allowlist secret


def test_password_no_uppercase_raises():
    with pytest.raises(ValidationError):
        ResetPasswordRequest(token="a" * 32, new_password="nouppercase1")  # Noqa: S106 # pragma: allowlist secret


def test_password_no_digit_raises():
    with pytest.raises(ValidationError):
        ResetPasswordRequest(token="a" * 32, new_password="NoDigitHere")  # Noqa: S106 # pragma: allowlist secret


def test_valid_password_passes():
    req = ResetPasswordRequest(token="a" * 32, new_password="ValidPass1")  # Noqa: S106 # pragma: allowlist secret
    assert req.new_password == "ValidPass1"  # pragma: allowlist secret # Noqa: S105
