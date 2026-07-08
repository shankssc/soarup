# apps/api/app/routers/public_profiles.py
# Unauthenticated public profile endpoint — no auth dependency.

import structlog
from fastapi import APIRouter
from fastapi.responses import Response

from app.api import ApiVersionDep, DBSessionDep, create_error_response, create_success_response
from app.repositories.profile_repo import ProfileRepository
from app.schemas.auth import PublicProfileResponse
from app.services.analytics_service import AnalyticsService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/profiles", tags=["public-profiles"])


@router.get(
    "/{username}",
    status_code=200,
    summary="Get public profile by username",
)
async def get_public_profile(
    username: str,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    # No auth dependency — fully public endpoint
) -> Response:
    """
    Public profile endpoint. Unauthenticated.
    Returns 404 if username not found OR profile_public=False.
    Ambiguous by design — prevents enumeration of private profiles.
    """
    repo = ProfileRepository.from_session(db)
    profile = await repo.get_by_username(username)

    if not profile or not profile.profile_public:
        logger.info(
            "public_profile_not_found",
            username=username,
            reason="not_found" if not profile else "not_public",
        )
        return create_error_response(
            error_code="profile_not_found",
            message="This profile does not exist or is not public.",
            status_code=404,
            api_version=api_version,
        )

    analytics_service = AnalyticsService(db)
    streak, heatmap = await analytics_service.get_public_profile_analytics(
        user_id=profile.id,
    )

    return create_success_response(
        PublicProfileResponse(
            username=profile.username,
            full_name=profile.full_name,
            avatar_url=profile.avatar_url,
            bio=profile.bio,
            tagline=profile.tagline,
            streak=streak.model_dump(),
            heatmap=[day.model_dump() for day in heatmap],
        ),
        api_version=api_version,
    )
