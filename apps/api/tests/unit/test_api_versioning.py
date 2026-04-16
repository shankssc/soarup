# apps/api/tests/unit/test_api_versioning.py

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.utils.api_versioning import _is_valid_version, get_api_version


def _mock_request(path: str, version_header: str | None = None) -> MagicMock:
    req = MagicMock()
    req.url.path = path
    headers = {}
    if version_header:
        headers["X-API-Version"] = version_header
    req.headers.get = lambda key, default=None: headers.get(key, default)
    return req


def test_extracts_version_from_path():
    req = _mock_request("/api/v1/auth/login")
    result = get_api_version(req)
    assert result.version == "v1"


def test_falls_back_to_header_when_no_version_in_path():
    req = _mock_request("/api/auth/login", version_header="v1")
    result = get_api_version(req)
    assert result.version == "v1"


def test_falls_back_to_current_version_when_no_header_or_path():
    req = _mock_request("/health")
    result = get_api_version(req)
    assert result.version == "v1"


def test_invalid_version_raises_406():
    """Malformed version string raises 406."""
    req = _mock_request("/api/auth/login", version_header="vbad")
    with pytest.raises(HTTPException) as exc_info:
        get_api_version(req)
    assert exc_info.value.status_code == 406


def test_current_version_is_not_deprecated():
    req = _mock_request("/api/v1/auth/login")
    result = get_api_version(req)
    assert result.deprecated is False
    assert result.is_current is True


def test_is_valid_version_accepts_v1():
    assert _is_valid_version("v1") is True


def test_is_valid_version_accepts_v2():
    assert _is_valid_version("v2") is True


def test_is_valid_version_rejects_empty():
    assert _is_valid_version("") is False


def test_is_valid_version_rejects_no_prefix():
    assert _is_valid_version("1") is False


def test_is_valid_version_rejects_letters_after_v():
    assert _is_valid_version("vabc") is False


def test_unknown_valid_version_returns_info():
    """
    A well-formed but unknown version (e.g. v99) does NOT raise —
    it returns ApiVersionInfo with is_current=False, deprecated=False.
    This is by design: get_api_version validates format, not membership.
    """
    req = _mock_request("/api/v99/auth/login")
    result = get_api_version(req)
    assert result.version == "v99"
    assert result.is_current is False
    assert result.deprecated is False


def test_malformed_version_in_header_raises_406():
    req = _mock_request("/api/auth/login", version_header="invalid")
    with pytest.raises(HTTPException) as exc_info:
        get_api_version(req)
    assert exc_info.value.status_code == 406
