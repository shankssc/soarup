# apps/api/app/utils/api_versioning.py
# API version management — path-based versioning (v1, v2, etc.)


from collections.abc import Callable
from typing import Any

import structlog
from fastapi import Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

logger = structlog.get_logger(__name__)

# === Configuration ===

# Current stable API version — bump this when making breaking changes
CURRENT_API_VERSION = "v1"

# Deprecated versions — still supported but scheduled for retirement
DEPRECATED_VERSIONS: dict[str, dict[str, str]] = {
    # Example:
    # "v0": {
    #     "sunset_date": "2026-06-30",
    #     "migration_guide": "https://docs.soarup.app/migration/v0-to-v1",
    # },
}

# Supported version formats (path or header)
VALID_VERSION_PREFIXES = ["v"]


# === Response Schema ===


class ApiVersionInfo(BaseModel):
    """
    Metadata for API versioning — included in responses and used for routing.

    This schema is used by:
    - get_api_version() dependency
    - OpenAPI documentation
    - Deprecation warnings in responses
    """

    version: str = Field(
        default=CURRENT_API_VERSION,
        description="API version (e.g., 'v1', 'v2')",
        examples=["v1"],
    )
    deprecated: bool = Field(
        default=False,
        description="Whether this version is deprecated and scheduled for removal",
    )
    sunset_date: str | None = Field(
        default=None,
        description="ISO 8601 date when this version will be retired (if deprecated)",
        examples=["2026-12-31"],
    )
    is_current: bool = Field(
        default=False,
        description="Whether this is the current stable API version",
    )

    model_config = ConfigDict(frozen=True)


# === Core Dependency ===


def get_api_version(request: Request) -> ApiVersionInfo:
    """
    Extract and validate API version from request path or header.

    Supports:
    - Path-based: /api/v1/auth/login, /api/v2/auth/login
    - Header-based: X-API-Version: v1 (fallback if path not present)

    Returns:
        ApiVersionInfo with version, deprecation status, and metadata.

    Raises:
        HTTPException 406 if version is unsupported or malformed.
    """
    # Try path first (e.g., /api/v1/...)
    path_parts = request.url.path.strip("/").split("/")
    version = None

    for part in path_parts:
        # Validate format: v + digits (e.g., v1, v2, v10)
        if any(part.startswith(prefix) for prefix in VALID_VERSION_PREFIXES) and part[1:].isdigit():
            version = part
            break

    # Fallback to header
    if not version:
        version = request.headers.get("X-API-Version", CURRENT_API_VERSION)

    # Validate version
    if not _is_valid_version(version):
        logger.warning("invalid_api_version", requested=version, path=request.url.path)
        raise HTTPException(
            status_code=status.HTTP_406_NOT_ACCEPTABLE,
            detail={
                "error": "unsupported_api_version",
                "message": f"API version '{version}' is not supported",
                "supported_versions": [CURRENT_API_VERSION] + list(DEPRECATED_VERSIONS.keys()),
            },
        )

    # Check deprecation status
    deprecation_info = DEPRECATED_VERSIONS.get(version, {})
    is_deprecated = version in DEPRECATED_VERSIONS
    is_current = version == CURRENT_API_VERSION

    # Log deprecation warning (once per request)
    if is_deprecated:
        logger.warning(
            "deprecated_api_version_used",
            version=version,
            sunset_date=deprecation_info.get("sunset_date"),
            path=request.url.path,
        )

    return ApiVersionInfo(
        version=version,
        deprecated=is_deprecated,
        sunset_date=deprecation_info.get("sunset_date"),
        is_current=is_current,
    )


# === Helper Functions ===


def _is_valid_version(version: str) -> bool:
    """
    Validate version string format.

    Args:
        version: Version string to validate (e.g., "v1", "v2")

    Returns:
        True if valid, False otherwise.
    """
    if not version:
        return False

    # Must start with valid prefix + digits
    return any(version.startswith(prefix) and version[len(prefix) :].isdigit() for prefix in VALID_VERSION_PREFIXES)


def require_api_version(min_version: str) -> Callable[[ApiVersionInfo], None]:
    """
    Dependency factory to enforce minimum API version for an endpoint.

    Usage:
        @router.get("/feature", dependencies=[Depends(require_api_version("v2"))])
        async def new_feature():
            ...

    Args:
        min_version: Minimum required version (e.g., "v2")

    Returns:
        Dependency function that raises 426 if version is too old.
    """

    def parse_version(v: str) -> tuple[int, ...]:
        return tuple(map(int, v.lstrip("v").split(".")))

    def checker(version_info: ApiVersionInfo = Depends(get_api_version)) -> None:  # noqa: B008 - FastAPI handles Depends() specially at runtime
        if parse_version(version_info.version) < parse_version(min_version):
            logger.warning(
                "api_version_too_old",
                current=version_info.version,
                required=min_version,
            )
            raise HTTPException(
                status_code=status.HTTP_426_UPGRADE_REQUIRED,
                detail={
                    "error": "api_version_too_old",
                    "message": f"Endpoint requires API version {min_version} or higher",
                    "current_version": version_info.version,
                    "required_version": min_version,
                    "upgrade_guide": f"https://docs.soarup.app/api/{min_version}",
                },
            )

    return checker


# === Utility: Add Deprecation Headers ===


def add_deprecation_headers(response: Any, version_info: ApiVersionInfo) -> None:
    """
    Add standard deprecation headers to response if version is deprecated.

    Follows RFC 8941: https://www.rfc-editor.org/rfc/rfc8941

    Args:
        response: FastAPI/Starlette response object
        version_info: ApiVersionInfo instance
    """
    if version_info.deprecated and version_info.sunset_date:
        # Sunset header: date when endpoint will be removed
        response.headers["Sunset"] = version_info.sunset_date

        # Deprecation header: human-readable message
        response.headers["Deprecation"] = "true"

        # Link header: migration guide
        response.headers["Link"] = f"<https://docs.soarup.app/migration/{version_info.version}-to-{CURRENT_API_VERSION}>; " 'rel="deprecation"; type="text/html"'

        # Warning header (RFC 7234): 299 = miscellaneous persistent warning
        response.headers["Warning"] = f'299 - "API version {version_info.version} is deprecated and will be removed on {version_info.sunset_date}"'


# === Optional: Version-Aware OpenAPI Customization ===


def customize_openapi_for_version(app: Any, version: str) -> None:
    """
    Customize OpenAPI schema for a specific API version.

    Useful for:
    - Hiding deprecated endpoints in docs
    - Adding version-specific metadata
    - Generating versioned client SDKs

    Args:
        app: FastAPI application instance
        version: API version to customize for
    """
    if version not in [CURRENT_API_VERSION] + list(DEPRECATED_VERSIONS.keys()):
        return  # Skip unknown versions

    original_openapi = app.openapi

    def versioned_openapi() -> dict[str, Any]:
        schema = original_openapi()

        # Add version metadata
        schema["info"]["x-api-version"] = version
        schema["info"]["x-deprecated"] = version in DEPRECATED_VERSIONS

        if version in DEPRECATED_VERSIONS:
            schema["info"]["x-sunset-date"] = DEPRECATED_VERSIONS[version]["sunset_date"]
            schema["info"]["x-migration-guide"] = DEPRECATED_VERSIONS[version]["migration_guide"]

        # Optional: Filter endpoints by version tags
        # (Requires tagging routes with version: @router.get(..., tags=["auth", "v1"]))

        return schema  # type: ignore[no-any-return]

    app.openapi = versioned_openapi
