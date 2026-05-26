# apps/api/app/routers/audio.py

import uuid

import structlog
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api import (
    ApiVersionDep,
    DBSessionDep,
    OnboardedDep,
    create_error_response,
    create_success_response,
)
from app.repositories.storage_repo import StorageError, StorageRepository
from app.repositories.update_repo import UpdateRepository
from app.schemas.audio import (
    AudioPlaybackUrlResponse,
    PresignedUploadUrlRequest,
    PresignedUploadUrlResponse,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/workspaces", tags=["audio"])

ALLOWED_AUDIO_CONTENT_TYPES = {
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
    "audio/mpeg",
    "audio/wav",
}

MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024  # 10MB

EXT_MAP = {
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
}


@router.post("/{workspace_id}/audio/upload-url", status_code=200)
async def get_upload_url(
    workspace_id: str,
    request: PresignedUploadUrlRequest,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
) -> JSONResponse:
    """
    Issue a pre-signed PUT URL for direct browser-to-storage upload.
    Validates content type and file size before issuing the URL.
    Audio data never touches the FastAPI server.
    """
    # Normalise content type — strip codec parameters before validation
    # e.g. "audio/webm;codecs=opus" → "audio/webm"
    base_content_type = request.content_type.split(";")[0].strip()

    if base_content_type not in ALLOWED_AUDIO_CONTENT_TYPES:
        return create_error_response(
            error_code="invalid_audio_format",
            message=f"Audio format '{base_content_type}' is not supported.",
            status_code=400,
            details={"allowed_types": sorted(ALLOWED_AUDIO_CONTENT_TYPES)},
            api_version=api_version,
        )

    if request.file_size_bytes > MAX_AUDIO_SIZE_BYTES:
        return create_error_response(
            error_code="audio_too_large",
            message="Audio file must be under 10MB.",
            status_code=413,
            api_version=api_version,
        )

    ext = EXT_MAP.get(base_content_type, "bin")
    object_key = f"audio/{workspace_id}/{user_ctx['user_id']}/{uuid.uuid4().hex}.{ext}"

    try:
        storage = StorageRepository()
        upload_url = await storage.get_presigned_upload_url(
            object_key=object_key,
            content_type=request.content_type,
            expires_in=900,
        )
    except StorageError as e:
        logger.error(
            "presigned_url_error",
            workspace_id=workspace_id,
            user_id=user_ctx["user_id"],
            error=str(e),
        )
        return create_error_response(
            error_code="storage_error",
            message="Could not generate upload URL. Please try again.",
            status_code=500,
            api_version=api_version,
        )

    logger.info(
        "presigned_upload_url_issued",
        workspace_id=workspace_id,
        user_id=user_ctx["user_id"],
        object_key=object_key,
    )

    return create_success_response(
        PresignedUploadUrlResponse(
            upload_url=upload_url,
            object_key=object_key,
            expires_in=900,
        ),
        api_version=api_version,
    )


@router.get("/{workspace_id}/updates/{update_id}/audio", status_code=200)
async def get_audio_playback_url(
    workspace_id: str,
    update_id: str,
    api_version: ApiVersionDep,
    user_ctx: OnboardedDep,
    db: DBSessionDep,
) -> JSONResponse:
    """
    Generate a short-lived pre-signed GET URL for audio playback.
    URL expires in 15 minutes — client requests a fresh URL per play session.
    """
    update_repo = UpdateRepository.from_session(db)
    update = await update_repo.get_by_id(update_id)

    if not update or update.workspace_id != workspace_id:
        return create_error_response(
            error_code="update_not_found",
            message="Update not found.",
            status_code=404,
            api_version=api_version,
        )

    if not update.audio_key:
        return create_error_response(
            error_code="no_audio",
            message="This update has no audio file.",
            status_code=404,
            api_version=api_version,
        )

    try:
        storage = StorageRepository()
        playback_url = await storage.get_presigned_url(
            file_key=update.audio_key,
            expires_in=900,
        )
    except StorageError as e:
        logger.error(
            "playback_url_error",
            update_id=update_id,
            error=str(e),
        )
        return create_error_response(
            error_code="storage_error",
            message="Could not generate playback URL. Please try again.",
            status_code=500,
            api_version=api_version,
        )

    return create_success_response(
        AudioPlaybackUrlResponse(
            playback_url=playback_url,
            expires_in=900,
            duration_seconds=update.audio_duration_seconds,
        ),
        api_version=api_version,
    )
