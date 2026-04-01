# apps/api/app/routers/auth.py
# Async thin HTTP layer for auth + profile endpoints
# Production-ready: versioning, dependencies, error handling, logging, OpenAPI docs

from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep,
    DBSessionDep,
    UserContextDep,
    create_error_response,
    create_success_response,
    handle_auth_error,
    handle_profile_error,
)
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    SignupRequest,
)
from app.schemas.profile import ProfileResponse, UpdateProfileRequest, UploadResponse
from app.services.auth_service import AuthError, AuthService
from app.services.profile_service import ProfileError, ProfileService

logger = structlog.get_logger(__name__)

# === Router Configuration ===

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
)

# === Dependency Injectors (Simple, Colocated) ===


def get_auth_service(db: DBSessionDep) -> AuthService:
    """Dependency injector for AuthService."""
    return AuthService(db)


def get_profile_service(db: DBSessionDep) -> ProfileService:
    """Dependency injector for ProfileService."""
    return ProfileService(db)


# === Public Auth Endpoints (No Auth Required) ===


@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with email and password",
    description="""
    Authenticate a user with email and password.

    **Business Rules**:
    - Email must be verified (configurable via Supabase)
    - Account must not be banned/suspended
    - Rate limiting applied at infrastructure layer (not here)

    **Security**:
    - Passwords are never logged or returned
    - Failed attempts are logged for monitoring (not exposed to client)
    """,
    response_description="Authenticated session with JWT tokens and user profile",
)
async def login(
    api_version: ApiVersionDep,
    request: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    """Authenticate user and return tokens + profile."""
    try:
        logger.info("login_attempt", email=request.email, api_version=api_version.version)
        result = await service.login(request)
        return create_success_response(result, api_version=api_version)
    except AuthError as e:
        logger.warning("login_failed", email=request.email, error_code=e.error_code)
        return handle_auth_error(e, api_version=api_version)
    except Exception as e:
        logger.exception("login_error", email=request.email, error=str(e))
        return handle_auth_error(
            AuthError("internal_error", "An unexpected error occurred"),
            api_version=api_version,
        )


@router.post(
    "/signup",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register new user",
    description="""
    Create a new user account and return an authenticated session.

    **Business Rules**:
    - Email must not already exist in Supabase Auth
    - Password must meet complexity requirements (validated by schema)
    - Profile record is created in PostgreSQL (idempotent)

    **Security**:
    - Welcome email can be triggered here (future: integrate notifications service)
    - Failed registrations are logged for monitoring
    """,
    response_description="Authenticated session with JWT tokens and user profile",
)
async def signup(
    api_version: ApiVersionDep,
    request: SignupRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    """Register new user and return authenticated session."""
    try:
        logger.info("signup_attempt", email=request.email, api_version=api_version.version)
        result = await service.signup(request)
        return create_success_response(result, status_code=status.HTTP_201_CREATED, api_version=api_version)
    except AuthError as e:
        logger.warning("signup_failed", email=request.email, error_code=e.error_code)
        return handle_auth_error(e, api_version=api_version)
    except Exception as e:
        logger.exception("signup_error", email=request.email, error=str(e))
        return handle_auth_error(
            AuthError("internal_error", "An unexpected error occurred"),
            api_version=api_version,
        )


@router.post(
    "/refresh",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="""
    Issue a new access token using a valid refresh token.

    **Business Rules**:
    - Refresh token must be valid and not expired
    - User account must still be active in Supabase
    - Rate limiting applied at infrastructure layer

    **Security**:
    - Refresh tokens can be rotated (future enhancement)
    - Failed refresh attempts are logged for monitoring
    """,
    response_description="New authenticated session with refreshed tokens",
)
async def refresh_token(
    api_version: ApiVersionDep,
    request: RefreshTokenRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    """Refresh access token using refresh token."""
    try:
        logger.info("token_refresh_attempt", refresh_token_prefix=request.refresh_token[:10] + "...")
        result = await service.refresh_tokens(request.refresh_token)
        return create_success_response(result, api_version=api_version)
    except AuthError as e:
        logger.warning("token_refresh_failed", error_code=e.error_code)
        return handle_auth_error(e, api_version=api_version)
    except Exception as e:
        logger.exception("token_refresh_error", error=str(e))
        return handle_auth_error(
            AuthError("internal_error", "An unexpected error occurred"),
            api_version=api_version,
        )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out current session",
    description="""
    Invalidate the current session by revoking the refresh token.

    **Note**: JWT access tokens cannot be revoked (stateless by design),
    but refreshing will fail after logout. Clients should discard tokens locally.

    **Idempotent**: Returns 204 even if token was already invalid.
    """,
    response_description="No content (session invalidated)",
)
async def logout(
    api_version: ApiVersionDep,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    """Sign out current session by revoking refresh token."""
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        logger.warning("logout_failed", reason="missing_bearer_token")
        return create_error_response(
            error_code="missing_token",
            message="Authorization header with Bearer token required",
            status_code=status.HTTP_401_UNAUTHORIZED,
            api_version=api_version,
        )

    access_token = auth_header[7:]

    try:
        logger.info("logout_attempt", token_prefix=access_token[:10] + "...")
        await service.logout(access_token)
        logger.info("logout_success")
    except Exception as e:
        logger.exception("logout_error", error=str(e))
        # Idempotent: still return 204 even on error

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# === Protected Endpoints (Require Valid JWT) ===


@router.get(
    "/me",
    response_model=ProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
    description="""
    Return the authenticated user's profile information.

    **Authentication**: Requires valid Bearer token in Authorization header.
    **Authorization**: Users can only access their own profile.

    **Response**: Merges Supabase Auth data with app-specific profile data.
    """,
    response_description="User profile with app-specific fields",
)
async def get_current_user(
    api_version: ApiVersionDep,
    user_ctx: UserContextDep,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    """Get current user profile (requires valid JWT)."""
    try:
        logger.info("get_profile_request", user_id=user_ctx["user_id"])

        user = await service.get_current_user(user_ctx["access_token"])

        if not user:
            logger.warning("profile_not_found", user_id=user_ctx["user_id"])
            return create_error_response(
                error_code="profile_not_found",
                message="Profile not found for this user",
                status_code=status.HTTP_404_NOT_FOUND,
                api_version=api_version,
            )

        return create_success_response(user, api_version=api_version)

    except Exception as e:
        logger.exception("get_profile_error", user_id=user_ctx["user_id"], error=str(e))
        return create_error_response(
            error_code="internal_error",
            message="Failed to retrieve profile",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            api_version=api_version,
        )


@router.patch(
    "/profile",
    response_model=ProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Update user profile",
    description="""
    Update app-specific profile fields for the authenticated user.

    **Updatable Fields**:
    - `full_name`: Display name (max 100 chars)
    - `avatar_url`: Profile picture URL (managed via /profile/avatar endpoint)
    - `timezone`: IANA timezone string (e.g., "America/New_York")
    - `email_notifications`: Opt-in for email updates

    **Validation**: Only provided fields are updated (partial updates supported).
    """,
    response_description="Updated user profile",
)
async def update_profile(
    api_version: ApiVersionDep,
    request: UpdateProfileRequest,
    user_ctx: UserContextDep,
    service: ProfileService = Depends(get_profile_service),
) -> Response:
    """Update user profile fields."""
    try:
        logger.info("profile_update_attempt", user_id=user_ctx["user_id"])
        result = await service.update_profile(user_ctx["user_id"], request)
        return create_success_response(result, api_version=api_version)
    except ProfileError as e:
        logger.warning("profile_update_failed", user_id=user_ctx["user_id"], error_code=e.error_code)
        return handle_profile_error(e, api_version=api_version)
    except Exception as e:
        logger.exception("profile_update_error", user_id=user_ctx["user_id"], error=str(e))
        return handle_profile_error(
            ProfileError("internal_error", "An unexpected error occurred"),
            api_version=api_version,
        )


@router.post(
    "/profile/avatar",
    response_model=UploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload profile avatar",
    description="""
    Upload a profile avatar image to object storage (Minio local / R2 production).

    **File Requirements**:
    - Max size: 5MB
    - Allowed types: JPEG, PNG, WebP, GIF
    - Images are stored with public-read ACL for direct browser access

    **Storage**:
    - Local dev: Minio at http://localhost:9000
    - Production: Cloudflare R2 with public CDN URL

    **Security**: File contents are validated before upload; metadata is sanitized.
    """,
    response_description="Public URL and metadata for uploaded avatar",
)
async def upload_avatar(
    api_version: ApiVersionDep,
    file: Annotated[UploadFile, File(description="Avatar image file (JPEG/PNG/WebP/GIF, max 5MB)")],
    user_ctx: UserContextDep,
    service: ProfileService = Depends(get_profile_service),
) -> Response:
    """Upload profile avatar to object storage."""
    try:
        logger.info("avatar_upload_attempt", user_id=user_ctx["user_id"], filename=file.filename)
        result = await service.upload_avatar(user_ctx["user_id"], file)
        return create_success_response(result, api_version=api_version)
    except ProfileError as e:
        logger.warning("avatar_upload_failed", user_id=user_ctx["user_id"], error_code=e.error_code)
        return handle_profile_error(e, api_version=api_version)
    except Exception as e:
        logger.exception("avatar_upload_error", user_id=user_ctx["user_id"], error=str(e))
        return handle_profile_error(
            ProfileError("internal_error", "An unexpected error occurred"),
            api_version=api_version,
        )


@router.delete(
    "/profile/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete profile avatar",
    description="""
    Remove the user's avatar from object storage and clear the profile reference.

    **Idempotent**: Returns 204 even if avatar didn't exist.
    **Cleanup**: File is deleted from Minio/R2; profile.avatar_url is set to null.
    """,
    response_description="No content (avatar deleted)",
)
async def delete_avatar(
    api_version: ApiVersionDep,
    user_ctx: UserContextDep,
    service: ProfileService = Depends(get_profile_service),
) -> Response:
    """Delete user's avatar from storage and profile."""
    try:
        logger.info("avatar_delete_attempt", user_id=user_ctx["user_id"])
        await service.delete_avatar(user_ctx["user_id"])
        logger.info("avatar_delete_success")
    except Exception as e:
        logger.exception("avatar_delete_error", user_id=user_ctx["user_id"], error=str(e))
        # Idempotent: still return 204

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# === Health & Metadata Endpoints ===


@router.get(
    "/versions",
    status_code=status.HTTP_200_OK,
    summary="Get supported API versions",
    description="Return metadata about supported and deprecated API versions.",
)
async def get_supported_versions() -> dict[str, Any]:
    """Return supported API version metadata."""
    from app.utils.api_versioning import CURRENT_API_VERSION, DEPRECATED_VERSIONS

    return {
        "current_version": CURRENT_API_VERSION,
        "deprecated_versions": {
            version: {
                "sunset_date": info["sunset_date"],
                "migration_guide": info.get("migration_guide"),
            }
            for version, info in DEPRECATED_VERSIONS.items()
        },
        "documentation": f"https://docs.soarup.app/api/{CURRENT_API_VERSION}",
    }
