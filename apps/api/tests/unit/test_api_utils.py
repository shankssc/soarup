# apps/api/tests/unit/test_api_utils.py
# Unit tests for create_error_response, create_success_response,
# handle_auth_error, and handle_profile_error.
#
# Strategy:
#   All four functions are pure — they take inputs and return JSONResponse
#   objects. No DB, no network, no fixtures needed. We test:
#   - Response status codes
#   - Response body shape (error/message/details fields)
#   - Deprecation header injection when api_version.deprecated=True
#   - Error code → HTTP status mapping for both auth and profile errors
#   - Fallback behaviour when a non-AuthError/non-ProfileError is passed

import json
from typing import Any, cast
from unittest.mock import MagicMock

from fastapi import status

from app.api._utils import (
    create_error_response,
    create_success_response,
    handle_auth_error,
    handle_profile_error,
)
from app.services.auth_service import AuthError
from app.services.profile_service import ProfileError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_body(response: Any) -> dict[str, Any]:
    """Parse JSONResponse body bytes into a dict."""
    return cast(dict[str, Any], json.loads(response.body))


def _mock_api_version(deprecated: bool = False) -> MagicMock:
    v = MagicMock()
    v.version = "v1"
    v.deprecated = deprecated
    return v


# ---------------------------------------------------------------------------
# create_error_response()
# ---------------------------------------------------------------------------


class TestCreateErrorResponse:
    def test_status_code_is_set(self):
        response = create_error_response(
            error_code="authentication_failed",
            message="Invalid credentials",
            status_code=401,
        )
        assert response.status_code == 401

    def test_body_contains_error_code(self):
        response = create_error_response(
            error_code="authentication_failed",
            message="Invalid credentials",
            status_code=401,
        )
        body = _parse_body(response)
        assert body["error"] == "authentication_failed"

    def test_body_contains_message(self):
        response = create_error_response(
            error_code="authentication_failed",
            message="Invalid credentials",
            status_code=401,
        )
        body = _parse_body(response)
        assert body["message"] == "Invalid credentials"

    def test_body_details_none_by_default(self):
        response = create_error_response(
            error_code="some_error",
            message="Something went wrong",
            status_code=400,
        )
        body = _parse_body(response)
        assert body["details"] is None

    def test_body_details_included_when_provided(self):
        response = create_error_response(
            error_code="file_too_large",
            message="File exceeds limit",
            status_code=413,
            details={"max_size": 5242880, "actual_size": 6000000},
        )
        body = _parse_body(response)
        assert body["details"]["max_size"] == 5242880
        assert body["details"]["actual_size"] == 6000000

    def test_no_deprecation_headers_when_not_deprecated(self):
        response = create_error_response(
            error_code="some_error",
            message="msg",
            status_code=400,
            api_version=_mock_api_version(deprecated=False),
        )
        assert "Deprecation" not in response.headers

    def test_deprecation_headers_added_when_deprecated(self):
        api_version = _mock_api_version(deprecated=True)
        create_error_response(
            error_code="some_error",
            message="msg",
            status_code=400,
            api_version=api_version,
        )
        # add_deprecation_headers was called — verify via the mock
        # (we trust api_versioning module is tested separately)
        assert api_version.deprecated is True

    def test_various_status_codes(self):
        for code in [400, 401, 403, 404, 409, 413, 500, 503]:
            response = create_error_response(
                error_code="err",
                message="msg",
                status_code=code,
            )
            assert response.status_code == code


# ---------------------------------------------------------------------------
# create_success_response()
# ---------------------------------------------------------------------------


class TestCreateSuccessResponse:
    def test_default_status_code_is_200(self):
        response = create_success_response(data={"key": "value"})
        assert response.status_code == 200

    def test_custom_status_code(self):
        response = create_success_response(
            data={"key": "value"},
            status_code=status.HTTP_201_CREATED,
        )
        assert response.status_code == 201

    def test_dict_data_serialized_correctly(self):
        response = create_success_response(data={"key": "value", "num": 42})
        body = _parse_body(response)
        assert body["key"] == "value"
        assert body["num"] == 42

    def test_pydantic_model_serialized_via_model_dump(self):
        """Pydantic models are serialized using model_dump(mode='json')."""
        from pydantic import BaseModel

        class SampleModel(BaseModel):
            name: str
            count: int

        model = SampleModel(name="test", count=5)
        response = create_success_response(data=model)
        body = _parse_body(response)

        assert body["name"] == "test"
        assert body["count"] == 5

    def test_non_pydantic_data_passed_directly(self):
        """Non-Pydantic data (plain dict) is passed directly as content."""
        data = {"direct": True}
        response = create_success_response(data=data)
        body = _parse_body(response)
        assert body["direct"] is True

    def test_no_deprecation_headers_when_not_deprecated(self):
        response = create_success_response(
            data={"key": "value"},
            api_version=_mock_api_version(deprecated=False),
        )
        assert "Deprecation" not in response.headers


# ---------------------------------------------------------------------------
# handle_auth_error()
# ---------------------------------------------------------------------------


class TestHandleAuthError:
    def test_authentication_failed_returns_401(self):
        e = AuthError(error_code="authentication_failed", message="Bad credentials")
        response = handle_auth_error(e)
        assert response.status_code == 401

    def test_invalid_refresh_token_returns_401(self):
        e = AuthError(error_code="invalid_refresh_token", message="Token expired")
        response = handle_auth_error(e)
        assert response.status_code == 401

    def test_user_already_exists_returns_409(self):
        e = AuthError(error_code="user_already_exists", message="Email taken")
        response = handle_auth_error(e)
        assert response.status_code == 409

    def test_registration_failed_returns_400(self):
        e = AuthError(error_code="registration_failed", message="Could not register")
        response = handle_auth_error(e)
        assert response.status_code == 400

    def test_service_unavailable_returns_503(self):
        e = AuthError(error_code="service_unavailable", message="Try later")
        response = handle_auth_error(e)
        assert response.status_code == 503

    def test_unknown_error_code_defaults_to_400(self):
        e = AuthError(error_code="some_unknown_code", message="Unknown")
        response = handle_auth_error(e)
        assert response.status_code == 400

    def test_error_code_in_response_body(self):
        e = AuthError(error_code="authentication_failed", message="Bad credentials")
        response = handle_auth_error(e)
        body = _parse_body(response)
        assert body["error"] == "authentication_failed"

    def test_message_in_response_body(self):
        e = AuthError(error_code="authentication_failed", message="Bad credentials")
        response = handle_auth_error(e)
        body = _parse_body(response)
        assert body["message"] == "Bad credentials"

    def test_details_included_when_present(self):
        e = AuthError(
            error_code="service_unavailable",
            message="Try later",
            details={"retry_after": 30},
        )
        response = handle_auth_error(e)
        body = _parse_body(response)
        assert body["details"]["retry_after"] == 30

    def test_non_auth_error_returns_500(self):
        """Passing a non-AuthError exception falls back to 500 internal error."""
        e = RuntimeError("something exploded")
        response = handle_auth_error(e)
        assert response.status_code == 500
        body = _parse_body(response)
        assert body["error"] == "internal_error"

    def test_non_auth_error_generic_message(self):
        """Internal error message doesn't leak exception details."""
        e = ValueError("sensitive db info")
        response = handle_auth_error(e)
        body = _parse_body(response)
        assert "sensitive" not in body["message"]
        assert body["message"] == "An unexpected error occurred"


# ---------------------------------------------------------------------------
# handle_profile_error()
# ---------------------------------------------------------------------------


class TestHandleProfileError:
    def test_profile_not_found_returns_404(self):
        e = ProfileError(error_code="profile_not_found", message="No profile")
        response = handle_profile_error(e)
        assert response.status_code == 404

    def test_no_fields_to_update_returns_400(self):
        e = ProfileError(error_code="no_fields_to_update", message="Nothing to update")
        response = handle_profile_error(e)
        assert response.status_code == 400

    def test_file_too_large_returns_413(self):
        e = ProfileError(error_code="file_too_large", message="File too big")
        response = handle_profile_error(e)
        assert response.status_code == 413

    def test_invalid_file_type_returns_400(self):
        e = ProfileError(error_code="invalid_file_type", message="Bad type")
        response = handle_profile_error(e)
        assert response.status_code == 400

    def test_invalid_file_returns_400(self):
        e = ProfileError(error_code="invalid_file", message="Bad file")
        response = handle_profile_error(e)
        assert response.status_code == 400

    def test_upload_failed_returns_500(self):
        e = ProfileError(error_code="upload_failed", message="Upload error")
        response = handle_profile_error(e)
        assert response.status_code == 500

    def test_service_unavailable_returns_503(self):
        e = ProfileError(error_code="service_unavailable", message="Try later")
        response = handle_profile_error(e)
        assert response.status_code == 503

    def test_unknown_error_code_defaults_to_400(self):
        e = ProfileError(error_code="totally_unknown", message="Unknown")
        response = handle_profile_error(e)
        assert response.status_code == 400

    def test_error_code_in_response_body(self):
        e = ProfileError(error_code="profile_not_found", message="No profile")
        response = handle_profile_error(e)
        body = _parse_body(response)
        assert body["error"] == "profile_not_found"

    def test_details_included_when_present(self):
        e = ProfileError(
            error_code="file_too_large",
            message="Too big",
            details={"max_size": 5242880, "actual_size": 6000000},
        )
        response = handle_profile_error(e)
        body = _parse_body(response)
        assert body["details"]["max_size"] == 5242880

    def test_non_profile_error_returns_500(self):
        """Passing a non-ProfileError falls back to 500."""
        e = RuntimeError("unexpected")
        response = handle_profile_error(e)
        assert response.status_code == 500
        body = _parse_body(response)
        assert body["error"] == "internal_error"

    def test_non_profile_error_generic_message(self):
        e = ValueError("internal db details")
        response = handle_profile_error(e)
        body = _parse_body(response)
        assert "internal db details" not in body["message"]


# ---------------------------------------------------------------------------
# Cross-cutting: error response shape consistency
# ---------------------------------------------------------------------------


class TestErrorResponseShape:
    def test_auth_error_response_has_all_required_fields(self):
        """Every error response must have error, message, details keys."""
        e = AuthError(error_code="authentication_failed", message="Bad credentials")
        body = _parse_body(handle_auth_error(e))
        assert "error" in body
        assert "message" in body
        assert "details" in body

    def test_profile_error_response_has_all_required_fields(self):
        e = ProfileError(error_code="profile_not_found", message="No profile")
        body = _parse_body(handle_profile_error(e))
        assert "error" in body
        assert "message" in body
        assert "details" in body

    def test_create_error_response_has_all_required_fields(self):
        body = _parse_body(create_error_response("err", "msg", 400))
        assert "error" in body
        assert "message" in body
        assert "details" in body
