# apps/api/app/api/_utils.py
# Shared utilities for API routers — error handling, responses, etc.

from typing import Any

from fastapi import status
from fastapi.responses import JSONResponse

from app.schemas.auth import ErrorResponse
from app.utils.api_versioning import ApiVersionInfo, add_deprecation_headers


def create_error_response(
    error_code: str,
    message: str,
    status_code: int,
    details: dict[str, Any] | None = None,
    api_version: ApiVersionInfo | None = None,
) -> JSONResponse:
    """
    Create a standardized JSON error response with optional deprecation headers.

    Args:
        error_code: Machine-readable error identifier (e.g., "authentication_failed")
        message: Human-readable error message for the client
        status_code: HTTP status code (e.g., 401, 400, 503)
        details: Optional additional error context
        api_version: Optional ApiVersionInfo for deprecation header injection

    Returns:
        JSONResponse ready to return from a FastAPI endpoint
    """
    response = JSONResponse(
        status_code=status_code,
        content=ErrorResponse(
            error=error_code,
            message=message,
            details=details,
        ).model_dump(mode="json"),
    )

    if api_version and api_version.deprecated:
        add_deprecation_headers(response, api_version)

    return response


def create_success_response(
    data: Any,
    status_code: int = status.HTTP_200_OK,
    api_version: ApiVersionInfo | None = None,
) -> JSONResponse:
    """
    Create a standardized JSON success response with optional deprecation headers.

    Args:
        data: Response payload (Pydantic model or dict)
        status_code: HTTP status code (default: 200)
        api_version: Optional ApiVersionInfo for deprecation header injection

    Returns:
        JSONResponse ready to return from a FastAPI endpoint
    """
    # Handle Pydantic models
    content = data.model_dump(mode="json") if hasattr(data, "model_dump") else data

    response = JSONResponse(status_code=status_code, content=content)

    if api_version and api_version.deprecated:
        add_deprecation_headers(response, api_version)

    return response


def handle_auth_error(
    e: Exception,
    api_version: ApiVersionInfo | None = None,
) -> JSONResponse:
    """
    Handle AuthError exceptions with standardized responses.

    Args:
        e: The AuthError exception instance
        api_version: Optional ApiVersionInfo for deprecation headers

    Returns:
        JSONResponse with appropriate status code and error details
    """
    from app.services.auth_service import AuthError

    if not isinstance(e, AuthError):
        # Fallback for unexpected errors
        return create_error_response(
            error_code="internal_error",
            message="An unexpected error occurred",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            api_version=api_version,
        )

    # Map error codes to HTTP status codes
    status_map = {
        "authentication_failed": status.HTTP_401_UNAUTHORIZED,
        "invalid_refresh_token": status.HTTP_401_UNAUTHORIZED,
        "user_already_exists": status.HTTP_409_CONFLICT,
        "registration_failed": status.HTTP_400_BAD_REQUEST,
        "service_unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }

    return create_error_response(
        error_code=e.error_code,
        message=e.message,
        status_code=status_map.get(e.error_code, status.HTTP_400_BAD_REQUEST),
        details=e.details,
        api_version=api_version,
    )


def handle_profile_error(
    e: Exception,
    api_version: ApiVersionInfo | None = None,
) -> JSONResponse:
    """
    Handle ProfileError exceptions with standardized responses.

    Args:
        e: The ProfileError exception instance
        api_version: Optional ApiVersionInfo for deprecation headers

    Returns:
        JSONResponse with appropriate status code and error details
    """
    from app.services.profile_service import ProfileError

    if not isinstance(e, ProfileError):
        return create_error_response(
            error_code="internal_error",
            message="An unexpected error occurred",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            api_version=api_version,
        )

    status_map = {
        "profile_not_found": status.HTTP_404_NOT_FOUND,
        "no_fields_to_update": status.HTTP_400_BAD_REQUEST,
        "file_too_large": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        "invalid_file_type": status.HTTP_400_BAD_REQUEST,
        "invalid_file": status.HTTP_400_BAD_REQUEST,
        "upload_failed": status.HTTP_500_INTERNAL_SERVER_ERROR,
        "service_unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
    }

    return create_error_response(
        error_code=e.error_code,
        message=e.message,
        status_code=status_map.get(e.error_code, status.HTTP_400_BAD_REQUEST),
        details=e.details,
        api_version=api_version,
    )
