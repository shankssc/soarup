# apps/api/app/routers/unsubscribe.py
# Public, unauthenticated endpoint for digest email unsubscribe links.
# Deliberately its own router, not under digests.py's /workspaces prefix —
# someone clicking this link from their inbox is not logged in.

import structlog
from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.api import DBSessionDep
from app.config import settings
from app.lib.unsubscribe import verify_unsubscribe_token
from app.repositories.workspace_repo import WorkspaceRepository

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/digests", tags=["unsubscribe"])


@router.get("/unsubscribe/{token}", status_code=302)
async def unsubscribe(token: str, db: DBSessionDep) -> RedirectResponse:
    """
    Verify the signed token, flip this member's per-workspace digest
    preference off, then redirect to a frontend confirmation page.

    Always redirects (never a raw error response) — a person clicking an
    email link expects to land on a page, not see a JSON error blob.
    Invalid/forged/expired-looking tokens redirect to a generic failure
    page rather than revealing why verification failed.
    """
    result = verify_unsubscribe_token(token)
    if result is None:
        logger.warning("unsubscribe_invalid_token")
        return RedirectResponse(f"{settings.app_base_url}/unsubscribe/invalid")

    workspace_id, user_id = result

    repo = WorkspaceRepository.from_session(db)
    member = await repo.update_member_notification_preference(workspace_id, user_id, enabled=False)
    if member is None:
        # Token was validly signed but the membership no longer exists
        # (e.g. they left the workspace since the email was sent) —
        # nothing to unsubscribe from; still a "success" from the
        # recipient's perspective, just a no-op.
        logger.info(
            "unsubscribe_membership_not_found",
            workspace_id=workspace_id,
            user_id=user_id,
        )
        return RedirectResponse(f"{settings.app_base_url}/unsubscribe/success")

    logger.info(
        "digest_unsubscribed",
        workspace_id=workspace_id,
        user_id=user_id,
    )
    return RedirectResponse(f"{settings.app_base_url}/unsubscribe/success?workspace={workspace_id}")
