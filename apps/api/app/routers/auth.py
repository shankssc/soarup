# apps/api/app/routers/auth.py
# Async thin HTTP layer for auth + profile endpoints

from typing import Annotated, Any

import structlog
from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep,
    AuthDep,
    DBSessionDep,
    UserContextDep,
    create_error_response,
    create_success_response,
    handle_auth_error,
    handle_profile_error,
)
from app.schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SignupRequest,
)
from app.schemas.profile import ProfileResponse, UpdateProfileRequest, UploadResponse
from app.services.auth_service import AuthError, AuthService
from app.services.profile_service import ProfileError, ProfileService

logger = structlog.get_logger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
)

# === Dependency Injectors ===


def get_auth_service(db: DBSessionDep) -> AuthService:
    return AuthService(db)


def get_profile_service(db: DBSessionDep) -> ProfileService:
    return ProfileService(db)


# === Public Endpoints (No Auth Required) ===


@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with email and password",
)
async def login(
    api_version: ApiVersionDep,
    request: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
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
)
async def signup(
    api_version: ApiVersionDep,
    request: SignupRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
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
)
async def refresh_token(
    api_version: ApiVersionDep,
    request: RefreshTokenRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
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
)
async def logout(
    api_version: ApiVersionDep,
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> Response:
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

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Request password reset email",
)
async def forgot_password(
    api_version: ApiVersionDep,
    request: ForgotPasswordRequest,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    logger.info("forgot_password_request", email=request.email, api_version=api_version.version)
    try:
        result = await service.request_password_reset(request)
        return create_success_response(result, api_version=api_version)
    except Exception as e:
        logger.exception("forgot_password_error", email=request.email, error=str(e))
        return create_success_response(
            ForgotPasswordResponse(
                message="Password reset email sent if account exists",
                email_sent=False,
            ),
            api_version=api_version,
        )


@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete password reset with new password",
)
async def reset_password(
    api_version: ApiVersionDep,
    request: ResetPasswordRequest,
    raw_request: Request,
    service: AuthService = Depends(get_auth_service),
) -> Response:
    auth_header = raw_request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return create_error_response(
            error_code="missing_token",
            message="Authorization header with Bearer token required",
            status_code=status.HTTP_401_UNAUTHORIZED,
            api_version=api_version,
        )

    recovery_token = auth_header[7:]
    if not recovery_token or len(recovery_token) < 32:
        return create_error_response(
            error_code="invalid_token",
            message="Recovery token is invalid or malformed",
            status_code=status.HTTP_401_UNAUTHORIZED,
            api_version=api_version,
        )

    logger.info("reset_password_attempt", token_prefix=recovery_token[:10] + "...", api_version=api_version.version)

    try:
        result = await service.complete_password_reset(
            recovery_access_token=recovery_token,
            new_password=request.new_password,
        )
        return create_success_response(result, api_version=api_version)
    except AuthError as e:
        logger.warning("reset_password_failed", error_code=e.error_code)
        return handle_auth_error(e, api_version=api_version)
    except Exception as e:
        logger.exception("reset_password_error", error=str(e))
        return handle_auth_error(
            AuthError("internal_error", "An unexpected error occurred"),
            api_version=api_version,
        )


# === Protected Endpoints (Require Valid JWT) ===


@router.get(
    "/me",
    response_model=ProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
)
async def get_current_user(
    api_version: ApiVersionDep,
    user_ctx: AuthDep,  # ← uses new canonical alias
    service: ProfileService = Depends(get_profile_service),
) -> Response:
    """
    Get current user profile.

    Uses JWT claims (user_id, email) already validated by AuthDep —
    no additional Supabase network call needed here.
    Profile data comes from PostgreSQL via ProfileService.
    """
    try:
        logger.info("get_profile_request", user_id=user_ctx["user_id"])

        # Fetch app-level profile from PostgreSQL — not from Supabase Auth
        profile = await service.get_profile(
            user_id=user_ctx["user_id"],
            email=user_ctx["email"],
        )

        return create_success_response(profile, api_version=api_version)

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
)
async def update_profile(
    api_version: ApiVersionDep,
    request: UpdateProfileRequest,
    user_ctx: AuthDep,  # ← uses new canonical alias
    service: ProfileService = Depends(get_profile_service),
) -> Response:
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
)
async def upload_avatar(
    api_version: ApiVersionDep,
    file: Annotated[UploadFile, File(description="Avatar image file (JPEG/PNG/WebP/GIF, max 5MB)")],
    # ← kept as UserContextDep (no change needed)
    user_ctx: UserContextDep,
    service: ProfileService = Depends(get_profile_service),
) -> Response:
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
)
async def delete_avatar(
    api_version: ApiVersionDep,
    # ← kept as UserContextDep (no change needed)
    user_ctx: UserContextDep,
    service: ProfileService = Depends(get_profile_service),
) -> Response:
    try:
        logger.info("avatar_delete_attempt", user_id=user_ctx["user_id"])
        await service.delete_avatar(user_ctx["user_id"])
        logger.info("avatar_delete_success")
    except Exception as e:
        logger.exception("avatar_delete_error", user_id=user_ctx["user_id"], error=str(e))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# === Health & Metadata ===


@router.get(
    "/versions",
    status_code=status.HTTP_200_OK,
    summary="Get supported API versions",
)
async def get_supported_versions() -> dict[str, Any]:
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
