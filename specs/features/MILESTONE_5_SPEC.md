# SoarUp — Milestone 5: Team Features
# Branch: feature/milestone-5
# Merges into: develop
# Prerequisites: feature/milestone-4 merged to develop ✅

---

## What This Milestone Delivers

1. Admin can invite teammates via email — Resend delivers invite, recipient
   joins workspace on signup/login
2. Team dashboard shows all members' updates for today, grouped by user
3. Members who haven't submitted appear in a "pending" section
4. Real-time broadcast — when one member submits, it appears on everyone
   else's dashboard instantly via WebSocket fan-out
5. Member management — view list, remove members, change roles
6. Role-based access control — workspace prompt config is owner-only,
   member removal is admin+, role changes are owner-only
7. N+1 profile query fixed — batch profile fetch replaces per-update lookup
8. Redis Streams migration — replaces plain pub/sub for persistent event
   delivery with replay on reconnect
9. Invite expiry — invites expire after 7 days, single-use
10. Workspace member count shown in sidebar
11. Profile settings page — display name, timezone, avatar upload wired to
    existing backend endpoint (POST /auth/profile/avatar)

---

## Branch Strategy

```
develop
└── feature/milestone-5
    ├── feature/milestone-5-invite-flow         ← invite model + email + join endpoint
    ├── feature/milestone-5-member-management   ← roles, remove, RBAC on existing endpoints
    ├── feature/milestone-5-team-dashboard      ← multi-member dashboard + pending section
    ├── feature/milestone-5-websocket-fanout    ← Redis Streams + fan-out broadcast
    └── feature/milestone-5-stories-and-tests  ← Storybook + unit tests

Merge order:
  feature/milestone-5-invite-flow → feature/milestone-5
  feature/milestone-5-member-management → feature/milestone-5
  feature/milestone-5-team-dashboard → feature/milestone-5
  feature/milestone-5-websocket-fanout → feature/milestone-5
  feature/milestone-5-stories-and-tests → feature/milestone-5
  feature/milestone-5 → develop
```

---

## Google Stitch Prompt

```
Design team feature screens for SoarUp, an async standup tool.
Use the Electric Atelier design system.

Colors (dark mode): Background #0e0e10, Primary #53ddfc (cyan),
Surface High #1f1f22, Surface Highest #262528, On-surface #f9f5f8,
Error #ff716c, Amber #fbbf24, Outline-variant #48474a
Colors (light mode): Background #ebfdfc, Primary #00687a,
Surface Lowest #ffffff, On-surface #0e1e1e

Design rules: 0px border radius except pills (9999px) and cards (4px).
Space Grotesk UI, Newsreader italic headlines, bottom-border inputs.

Screen 1 — Team Dashboard (multiple members):
- Date header: "Today — Tuesday, 13 May" + separator
- "Pending" section at top: avatars of members who haven't submitted yet
  in a horizontal pill row: [Avatar] [Avatar] [Avatar] "3 haven't submitted"
- Updates section: each member's update card (same as M2/M4 card design)
  but with member avatar + name + "VOICE" or "TEXT" badge
- Your own update card has a subtle cyan left border to distinguish it
- If you haven't submitted yet: inline CTAs (text / voice) at top of list

Screen 2 — Members page (/settings/members):
- Page title: "Team" (Newsreader italic)
- Member list: avatar + name + email + role badge (OWNER / ADMIN / MEMBER)
  + joined date + three-dot menu (Change role / Remove)
- "Invite member" button top right (primary asymmetric)
- Invite modal: email input + "Send invite" button
  + "or copy invite link" ghost button below
- Pending invites section below member list:
  email + "Expires in 5 days" + Revoke button

Screen 3 — Invite acceptance page (/invite/:code):
- Same layout as onboarding pages (header + centered card)
- "You've been invited to join [Workspace Name]"
- If not logged in: email/password fields + "Accept invite & sign up"
- If logged in as different user: "You're signed in as X.
  Sign out to accept this invite with a different account."
- If logged in as correct user: "Accept invite" primary button
```

---

## Existing Stack Reference

### Backend
- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local, port 54322)
- Alembic migrations, Structlog
- Redis + Celery + broadcaster (pub/sub, M3)
- pytest + pytest-asyncio, full conftest.py fixture suite
- StorageRepository, UpdateRepository, ProfileRepository,
  WorkspaceRepository all established

### Frontend
- Next.js 14 App Router, TypeScript
- Tailwind CSS + Electric Atelier CSS variable token system
- @tanstack/react-query v5
- Zustand + persist — auth state, WebSocket connection state
- WebSocket registry (subscribe/dispatch/clearAllHandlers)
- useWebSocket hook — exponential backoff reconnect
- useDashboardUpdates hook — M3 + M4 WS cache handlers

### Established WebSocket event types
```python
EVENT_TYPES = {
    "update.status_changed",           # M3 ✅
    "audio.transcription_started",     # M4 ✅
    "audio.transcription_complete",    # M4 ✅
    "audio.transcription_failed",      # M4 ✅
    "member.update_submitted",         # M5 — implement now
    "member.joined",                   # M5 — implement now
    "member.left",                     # M5 — implement now
}
```

### React Query cache keys (established)
```typescript
updateKeys.byDate(workspaceId, date)
updateKeys.all(workspaceId)
workspaceKeys.mine()
audioKeys.playback(workspaceId, updateId)
```

### conftest.py fixtures
```python
db_session, api_client, client_with_mocks, unauthenticated_client
make_jwt(user_id, email), auth_headers(user_id)
test_user_id, seeded_profile, workspace_repo
login_response(), profile_response()
```

### Known debt being resolved in M5
- N+1 profile query in UpdateService._to_response → batch fetch
- Redis pub/sub → Redis Streams for event persistence + replay
- Workspace prompt config not owner-gated → RBAC lands here
- WorkspaceService.join_workspace invite stub → real invite system

---

## Backend — Build Order

### Step 1: Database Models — Invites

```python
# apps/api/app/models/invite.py

import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class WorkspaceInvite(Base):
    """
    Single-use, time-limited invite for joining a workspace.
    Code is a URL-safe random token, not a UUID — shorter and user-friendlier.
    """
    __tablename__ = "workspace_invites"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    invited_by: Mapped[str] = mapped_column(
        String, ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True,
        doc="Email address the invite was sent to",
    )
    code: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True,
        doc="URL-safe token used in /invite/:code link",
    )
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        doc="Invite expires 7 days after creation",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    used_by: Mapped[str | None] = mapped_column(
        String, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True,
    )

    def __repr__(self) -> str:
        return f"<WorkspaceInvite(id='{self.id}', email='{self.email}')>"
```

Add to `conftest.py`:
```python
import app.models.invite  # noqa: F401
```

Alembic migration:
```bash
docker compose exec api alembic revision --autogenerate -m "add_workspace_invites"
docker compose exec api alembic upgrade head
```

---

### Step 2: Schemas

```python
# apps/api/app/schemas/invite.py

from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CreateInviteRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address to invite")


class InviteResponse(BaseModel):
    id: str
    workspace_id: str
    email: str
    code: str
    expires_at: datetime
    is_used: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class InviteDetailsResponse(BaseModel):
    """Public-facing invite info shown on /invite/:code page"""
    workspace_name: str
    workspace_slug: str
    invited_by_name: str | None
    email: str
    expires_at: datetime
    is_valid: bool   # False if expired or already used


class AcceptInviteRequest(BaseModel):
    code: str = Field(..., description="Invite code from the URL")
```

Add to `schemas/workspace.py`:
```python
class WorkspaceMemberDetailResponse(BaseModel):
    """Member list item — includes profile data"""
    user_id: str
    role: str
    joined_at: datetime
    full_name: str | None
    email: str | None
    avatar_url: str | None
    model_config = ConfigDict(from_attributes=True)


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$",
                      description="New role — owner cannot be changed via this endpoint")
```

---

### Step 3: Invite Repository

```python
# apps/api/app/repositories/invite_repo.py

import secrets
from datetime import UTC, datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.invite import WorkspaceInvite

INVITE_EXPIRY_DAYS = 7


class InviteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "InviteRepository":
        return cls(db)

    def _generate_code(self) -> str:
        """Generate a URL-safe 32-character random token."""
        return secrets.token_urlsafe(24)

    async def create(
        self,
        workspace_id: str,
        invited_by: str,
        email: str,
    ) -> WorkspaceInvite:
        """Create a new invite. Invalidates any existing unused invite for same email+workspace."""
        # Invalidate existing unused invites for this email in this workspace
        existing = await self.get_by_email_and_workspace(workspace_id, email)
        if existing and not existing.is_used:
            existing.is_used = True
            await self.db.flush()

        invite = WorkspaceInvite(
            workspace_id=workspace_id,
            invited_by=invited_by,
            email=email,
            code=self._generate_code(),
            expires_at=datetime.now(UTC) + timedelta(days=INVITE_EXPIRY_DAYS),
        )
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def get_by_code(self, code: str) -> WorkspaceInvite | None:
        result = await self.db.execute(
            select(WorkspaceInvite).where(WorkspaceInvite.code == code)
        )
        return result.scalar_one_or_none()

    async def get_by_email_and_workspace(
        self, workspace_id: str, email: str
    ) -> WorkspaceInvite | None:
        result = await self.db.execute(
            select(WorkspaceInvite).where(
                WorkspaceInvite.workspace_id == workspace_id,
                WorkspaceInvite.email == email,
                WorkspaceInvite.is_used == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_pending_by_workspace(
        self, workspace_id: str
    ) -> list[WorkspaceInvite]:
        """Return all unused, non-expired invites for a workspace."""
        now = datetime.now(UTC)
        result = await self.db.execute(
            select(WorkspaceInvite).where(
                WorkspaceInvite.workspace_id == workspace_id,
                WorkspaceInvite.is_used == False,  # noqa: E712
                WorkspaceInvite.expires_at > now,
            ).order_by(WorkspaceInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def mark_used(
        self, invite: WorkspaceInvite, used_by: str
    ) -> WorkspaceInvite:
        invite.is_used = True
        invite.used_by = used_by
        invite.used_at = datetime.now(UTC)
        await self.db.commit()
        await self.db.refresh(invite)
        return invite

    async def revoke(self, invite: WorkspaceInvite) -> None:
        invite.is_used = True
        await self.db.commit()
```

---

### Step 4: Resend Email Client

Add to `requirements.txt`:
```
resend>=2.0.0
```

```python
# apps/api/app/lib/email.py
# Thin wrapper around Resend for transactional email delivery.

import resend
import structlog
from app.config import settings

logger = structlog.get_logger(__name__)


def _get_client() -> resend.Resend:
    return resend.Resend(
        api_key=settings.resend_api_key.get_secret_value()
        if settings.resend_api_key
        else "",
    )


async def send_invite_email(
    to_email: str,
    workspace_name: str,
    invited_by_name: str,
    invite_url: str,
    expires_in_days: int = 7,
) -> bool:
    """
    Send a workspace invite email via Resend.
    Returns True on success, False on failure (non-fatal — invite is already created).
    """
    try:
        client = _get_client()
        client.emails.send({
            "from": "SoarUp <invites@soarup.app>",
            "to": [to_email],
            "subject": f"{invited_by_name} invited you to join {workspace_name} on SoarUp",
            "html": _invite_email_html(
                workspace_name=workspace_name,
                invited_by_name=invited_by_name,
                invite_url=invite_url,
                expires_in_days=expires_in_days,
            ),
        })
        logger.info(
            "invite_email_sent",
            to=to_email,
            workspace=workspace_name,
        )
        return True
    except Exception as e:
        logger.error("invite_email_failed", to=to_email, error=str(e))
        return False


def _invite_email_html(
    workspace_name: str,
    invited_by_name: str,
    invite_url: str,
    expires_in_days: int,
) -> str:
    """
    Plain HTML invite email — minimal styling, high deliverability.
    React Email template deferred to M6 when we build the digest email.
    """
    return f"""
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
  <h2 style="font-size: 20px; margin-bottom: 8px;">
    You've been invited to join {workspace_name}
  </h2>
  <p style="color: #666; margin-bottom: 24px;">
    {invited_by_name} has invited you to join their workspace on SoarUp,
    an async standup tool for developers.
  </p>
  <a href="{invite_url}"
     style="display: inline-block; background: #00687a; color: white;
            padding: 12px 24px; text-decoration: none; font-weight: 600;">
    Accept invite
  </a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">
    This invite expires in {expires_in_days} days.
    If you didn't expect this email, you can safely ignore it.
  </p>
</body>
</html>
"""
```

---

### Step 5: Invite + Member Service

```python
# apps/api/app/services/invite_service.py

from datetime import UTC, datetime
from typing import Any
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.email import send_invite_email
from app.repositories.invite_repo import InviteRepository
from app.repositories.profile_repo import ProfileRepository
from app.repositories.workspace_repo import WorkspaceRepository
from app.schemas.invite import (
    CreateInviteRequest, InviteResponse, InviteDetailsResponse,
)

logger = structlog.get_logger(__name__)

APP_BASE_URL = "https://soarup.app"  # override via config in production


class InviteError(Exception):
    def __init__(self, error_code: str, message: str,
                 details: dict[str, Any] | None = None):
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


class InviteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_invite(
        self,
        workspace_id: str,
        inviter_id: str,
        request: CreateInviteRequest,
    ) -> InviteResponse:
        """
        Create and send a workspace invite.
        Any role can invite — admin-only restriction deferred to M5 RBAC pass.
        """
        workspace_repo = WorkspaceRepository.from_session(self.db)
        profile_repo = ProfileRepository.from_session(self.db)
        invite_repo = InviteRepository.from_session(self.db)

        workspace = await workspace_repo.get_by_id(workspace_id)
        if not workspace:
            raise InviteError("workspace_not_found", "Workspace not found.")

        inviter = await profile_repo.get_by_user_id(inviter_id)

        # Check if email is already a member
        existing_member = await workspace_repo.get_member_by_email(
            workspace_id, request.email
        )
        if existing_member:
            raise InviteError(
                "already_member",
                "This person is already a member of the workspace.",
            )

        invite = await invite_repo.create(
            workspace_id=workspace_id,
            invited_by=inviter_id,
            email=str(request.email),
        )

        invite_url = f"{APP_BASE_URL}/invite/{invite.code}"
        await send_invite_email(
            to_email=str(request.email),
            workspace_name=workspace.name,
            invited_by_name=inviter.full_name if inviter else "A teammate",
            invite_url=invite_url,
        )

        return InviteResponse.model_validate(invite)

    async def get_invite_details(self, code: str) -> InviteDetailsResponse:
        """
        Return public invite info for the /invite/:code page.
        Does not require authentication.
        """
        invite_repo = InviteRepository.from_session(self.db)
        workspace_repo = WorkspaceRepository.from_session(self.db)
        profile_repo = ProfileRepository.from_session(self.db)

        invite = await invite_repo.get_by_code(code)
        if not invite:
            raise InviteError("invite_not_found", "Invite not found.")

        workspace = await workspace_repo.get_by_id(invite.workspace_id)
        inviter = await profile_repo.get_by_user_id(invite.invited_by)

        is_valid = (
            not invite.is_used
            and invite.expires_at > datetime.now(UTC)
        )

        return InviteDetailsResponse(
            workspace_name=workspace.name if workspace else "Unknown",
            workspace_slug=workspace.slug if workspace else "",
            invited_by_name=inviter.full_name if inviter else None,
            email=invite.email,
            expires_at=invite.expires_at,
            is_valid=is_valid,
        )

    async def accept_invite(
        self,
        code: str,
        user_id: str,
        user_email: str,
    ) -> str:
        """
        Accept an invite and add user to workspace.
        Returns workspace_id on success.
        """
        invite_repo = InviteRepository.from_session(self.db)
        workspace_repo = WorkspaceRepository.from_session(self.db)

        invite = await invite_repo.get_by_code(code)
        if not invite:
            raise InviteError("invite_not_found", "Invite not found.")
        if invite.is_used:
            raise InviteError("invite_already_used", "This invite has already been used.")
        if invite.expires_at < datetime.now(UTC):
            raise InviteError("invite_expired", "This invite has expired.")

        # Email doesn't need to match exactly — user may have signed up
        # with a different email. Warn but don't block.
        if invite.email.lower() != user_email.lower():
            logger.warning(
                "invite_email_mismatch",
                invite_email=invite.email,
                user_email=user_email,
            )

        # Check not already a member
        existing = await workspace_repo.get_member(invite.workspace_id, user_id)
        if existing:
            raise InviteError("already_member", "You are already a member of this workspace.")

        await workspace_repo.add_member(invite.workspace_id, user_id, "member")
        await invite_repo.mark_used(invite, user_id)

        logger.info(
            "invite_accepted",
            workspace_id=invite.workspace_id,
            user_id=user_id,
        )
        return invite.workspace_id
```

---

### Step 6: WorkspaceRepository — New Methods

```python
# apps/api/app/repositories/workspace_repo.py — add these methods

async def get_member_by_email(
    self, workspace_id: str, email: str
) -> WorkspaceMember | None:
    """Check if an email address is already a workspace member."""
    # Requires a join with profiles table on email
    result = await self.db.execute(
        select(WorkspaceMember)
        .join(Profile, WorkspaceMember.user_id == Profile.id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            func.lower(Profile.email) == email.lower(),
        )
    )
    return result.scalar_one_or_none()

async def get_workspace_members_with_profiles(
    self, workspace_id: str
) -> list[tuple[WorkspaceMember, Profile]]:
    """
    Return all members with their profiles in a single query.
    Replaces the N+1 pattern in UpdateService._to_response.
    """
    result = await self.db.execute(
        select(WorkspaceMember, Profile)
        .join(Profile, WorkspaceMember.user_id == Profile.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.joined_at.asc())
    )
    return list(result.all())

async def update_member_role(
    self,
    workspace_id: str,
    user_id: str,
    new_role: str,
) -> WorkspaceMember | None:
    member = await self.get_member(workspace_id, user_id)
    if not member:
        return None
    member.role = new_role
    await self.db.commit()
    await self.db.refresh(member)
    return member

async def remove_member(
    self, workspace_id: str, user_id: str
) -> bool:
    member = await self.get_member(workspace_id, user_id)
    if not member:
        return False
    await self.db.delete(member)
    await self.db.commit()
    return True

async def get_profiles_for_updates(
    self,
    user_ids: list[str],
) -> dict[str, Profile]:
    """
    Batch fetch profiles for a list of user IDs.
    Returns dict keyed by user_id for O(1) lookup in _to_response.
    Fixes N+1 query in UpdateService._to_response.
    """
    if not user_ids:
        return {}
    result = await self.db.execute(
        select(Profile).where(Profile.id.in_(user_ids))
    )
    profiles = result.scalars().all()
    return {p.id: p for p in profiles}
```

---

### Step 7: UpdateService — Fix N+1

```python
# apps/api/app/services/update_service.py
# Replace _to_response with a batch version for list operations

async def get_workspace_updates(
    self, workspace_id: str, update_date: str
) -> UpdateListResponse:
    """
    Return all updates with author profiles in two queries (not N+1).
    """
    updates = await self._get_update_repo().get_workspace_updates_for_date(
        workspace_id, update_date
    )
    if not updates:
        return UpdateListResponse(updates=[], total=0)

    # Batch fetch all profiles in one query
    user_ids = list({u.user_id for u in updates})
    profiles = await self._get_workspace_repo().get_profiles_for_updates(user_ids)

    responses = [self._to_response_with_profile(u, profiles.get(u.user_id))
                 for u in updates]
    return UpdateListResponse(updates=responses, total=len(responses))

def _to_response_with_profile(
    self,
    update: Any,
    profile: Any | None,
) -> UpdateResponse:
    """Sync version — no DB call, profile already fetched."""
    return UpdateResponse(
        id=update.id,
        workspace_id=update.workspace_id,
        user_id=update.user_id,
        content=update.content,
        mode=update.mode,
        status=update.status,
        summary=update.summary,
        transcript=update.transcript,
        update_date=update.update_date,
        created_at=update.created_at,
        updated_at=update.updated_at,
        audio_duration_seconds=update.audio_duration_seconds,
        author_name=profile.full_name if profile else None,
        author_avatar_url=profile.avatar_url if profile else None,
    )
```

---

### Step 8: RBAC — Role Checks

```python
# apps/api/app/api/rbac.py
# Role-based access control helpers.
# Used as FastAPI dependencies on endpoints requiring specific roles.

from typing import Annotated, Any
import structlog
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import OnboardedDep, DBSessionDep
from app.repositories.workspace_repo import WorkspaceRepository

logger = structlog.get_logger(__name__)

ROLE_HIERARCHY = {"owner": 3, "admin": 2, "member": 1}


def _check_role(member_role: str, required_role: str) -> bool:
    return ROLE_HIERARCHY.get(member_role, 0) >= ROLE_HIERARCHY.get(required_role, 0)


def require_workspace_role(required_role: str):
    """
    Dependency factory — checks that the current user has at least
    the specified role in the workspace identified by {workspace_id}
    path parameter.

    Usage:
        @router.delete("/{workspace_id}/members/{user_id}",
                       dependencies=[Depends(require_workspace_role("admin"))])
    """
    async def checker(
        workspace_id: str,
        user_ctx: OnboardedDep,
        db: DBSessionDep,
    ) -> dict[str, Any]:
        workspace_repo = WorkspaceRepository.from_session(db)
        member = await workspace_repo.get_member(workspace_id, user_ctx["user_id"])

        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this workspace.",
            )

        if not _check_role(member.role, required_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires {required_role} role or higher.",
            )

        return {**user_ctx, "workspace_role": member.role}

    return checker


# Convenience type aliases
WorkspaceMemberDep = Annotated[dict, Depends(require_workspace_role("member"))]
WorkspaceAdminDep = Annotated[dict, Depends(require_workspace_role("admin"))]
WorkspaceOwnerDep = Annotated[dict, Depends(require_workspace_role("owner"))]
```

Apply RBAC to existing endpoints:
```python
# workspaces router — update PATCH /:id/prompts
# Was: user_ctx: OnboardedDep
# Now: user_ctx: WorkspaceOwnerDep

# members router (new) — use WorkspaceAdminDep for remove
# Use WorkspaceOwnerDep for role changes
```

---

### Step 9: Invites + Members Router

```python
# apps/api/app/routers/invites.py

router = APIRouter(prefix="/workspaces", tags=["invites"])

@router.post("/{workspace_id}/invites", status_code=201)
async def create_invite(workspace_id, request: CreateInviteRequest,
                         api_version: ApiVersionDep, user_ctx: OnboardedDep,
                         service: InviteService = Depends(...)) -> Response:
    """Create and send an invite email."""
    ...

@router.get("/{workspace_id}/invites", status_code=200)
async def list_pending_invites(workspace_id, api_version: ApiVersionDep,
                                user_ctx: WorkspaceAdminDep,
                                db: DBSessionDep) -> Response:
    """List pending invites for a workspace (admin+)."""
    ...

@router.delete("/{workspace_id}/invites/{invite_id}", status_code=204)
async def revoke_invite(workspace_id, invite_id,
                         api_version: ApiVersionDep,
                         user_ctx: WorkspaceAdminDep,
                         db: DBSessionDep) -> Response:
    """Revoke a pending invite (admin+)."""
    ...

# Public endpoint — no auth required
@router.get("/invites/{code}", status_code=200)  # note: no workspace_id prefix
async def get_invite_details(code, api_version: ApiVersionDep,
                              db: DBSessionDep) -> Response:
    """Return public invite info for the acceptance page."""
    ...

@router.post("/invites/{code}/accept", status_code=200)
async def accept_invite(code, api_version: ApiVersionDep,
                         user_ctx: OnboardedDep,
                         service: InviteService = Depends(...)) -> Response:
    """Accept an invite and join the workspace."""
    ...
```

```python
# apps/api/app/routers/members.py

router = APIRouter(prefix="/workspaces", tags=["members"])

@router.get("/{workspace_id}/members", status_code=200)
async def list_members(workspace_id, api_version: ApiVersionDep,
                        user_ctx: WorkspaceMemberDep,
                        db: DBSessionDep) -> Response:
    """List all workspace members with profile data."""
    ...

@router.patch("/{workspace_id}/members/{user_id}/role", status_code=200)
async def update_member_role(workspace_id, user_id,
                              request: UpdateMemberRoleRequest,
                              api_version: ApiVersionDep,
                              user_ctx: WorkspaceOwnerDep,
                              db: DBSessionDep) -> Response:
    """Change a member's role (owner only). Cannot change owner role."""
    ...

@router.delete("/{workspace_id}/members/{user_id}", status_code=204)
async def remove_member(workspace_id, user_id,
                         api_version: ApiVersionDep,
                         user_ctx: WorkspaceAdminDep,
                         db: DBSessionDep) -> Response:
    """Remove a member from the workspace (admin+)."""
    ...
```

Register in `main.py`:
```python
from app.routers import invites, members
app.include_router(invites.router, prefix="/api/v1")
app.include_router(members.router, prefix="/api/v1")
```

---

### Step 10: Redis Streams Migration

Replace `broadcaster` pub/sub with Redis Streams for persistent event
delivery with consumer groups and replay on reconnect.

```python
# apps/api/app/lib/events.py — Redis Streams version

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)

EVENT_TYPES = {
    "update.status_changed",
    "audio.transcription_started",
    "audio.transcription_complete",
    "audio.transcription_failed",
    "member.update_submitted",
    "member.joined",
    "member.left",
}

STREAM_MAX_LEN = 1000  # Keep last 1000 events per workspace stream


def _stream_key(workspace_id: str) -> str:
    return f"stream:workspace:{workspace_id}"


def _build_payload(
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> dict[str, str]:
    if event_type not in EVENT_TYPES:
        raise ValueError(f"Unknown event type: {event_type}")
    return {
        "type": event_type,
        "workspace_id": workspace_id,
        "event_id": str(uuid.uuid4()),
        "timestamp": datetime.now(UTC).isoformat(),
        "payload": json.dumps(payload),
    }


async def publish_event(
    redis: Redis,
    event_type: str,
    workspace_id: str,
    payload: dict[str, Any],
) -> str | None:
    """
    Publish event to Redis Stream for the workspace.
    Returns the stream entry ID (used for replay from position).
    Non-fatal on failure — update is already in DB.
    """
    try:
        data = _build_payload(event_type, workspace_id, payload)
        entry_id = await redis.xadd(
            _stream_key(workspace_id),
            data,
            maxlen=STREAM_MAX_LEN,
            approximate=True,
        )
        logger.info(
            "event_published",
            event_type=event_type,
            workspace_id=workspace_id,
            entry_id=entry_id,
        )
        return entry_id
    except Exception as e:
        logger.warning(
            "event_publish_failed",
            event_type=event_type,
            workspace_id=workspace_id,
            error=str(e),
        )
        return None
```

Update WebSocket endpoint to read from Redis Stream:
```python
# apps/api/app/routers/websockets.py — Redis Streams version

@router.websocket("/workspaces/{workspace_id}")
async def workspace_websocket(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(...),
    last_event_id: str = Query(default="$"),
    # last_event_id: client sends last seen entry ID on reconnect
    # "$" means only new events (default for fresh connections)
):
    try:
        payload = await validate_supabase_jwt_ws(token)
        user_id = payload["sub"]
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    stream_key = f"stream:workspace:{workspace_id}"
    last_id = last_event_id

    try:
        while True:
            # Block up to 5 seconds waiting for new stream entries
            results = await redis.xread(
                {stream_key: last_id},
                count=10,
                block=5000,
            )
            if results:
                for _stream, entries in results:
                    for entry_id, data in entries:
                        try:
                            message = {
                                "type": data[b"type"].decode(),
                                "workspace_id": data[b"workspace_id"].decode(),
                                "event_id": data[b"event_id"].decode(),
                                "timestamp": data[b"timestamp"].decode(),
                                "payload": json.loads(data[b"payload"]),
                                "stream_id": entry_id.decode(),
                            }
                            await websocket.send_json(message)
                            last_id = entry_id
                        except Exception as e:
                            logger.warning("ws_send_failed", error=str(e))
                            break
    except WebSocketDisconnect:
        logger.info("ws_disconnected", workspace_id=workspace_id, user_id=user_id)
    except Exception as e:
        logger.warning("ws_error", workspace_id=workspace_id, error=str(e))
```

Remove `broadcaster` dependency from `requirements.txt` and `main.py`
after migration is verified. Keep `broadcaster[redis]` in requirements
until Redis Streams is confirmed working in all environments.

---

## Frontend — Build Order

### Step 1: New Query Keys

```typescript
// Add to existing cache key factories

export const memberKeys = {
  all: (workspaceId: string) => ["members", workspaceId] as const,
  list: (workspaceId: string) => ["members", workspaceId, "list"] as const,
};

export const inviteKeys = {
  pending: (workspaceId: string) => ["invites", workspaceId, "pending"] as const,
  details: (code: string) => ["invites", "details", code] as const,
};
```

---

### Step 2: Member + Invite Hooks

```typescript
// apps/web/src/hooks/useMembers.ts

export function useWorkspaceMembers(workspaceId: string | undefined) {
  const { tokens } = useAuth();
  return useQuery({
    queryKey: memberKeys.list(workspaceId ?? ""),
    queryFn: () =>
      apiClient.get<{ members: WorkspaceMemberDetail[]; total: number }>(
        `/workspaces/${workspaceId}/members`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 60 * 1000,
  });
}

export function useInviteMember(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      apiClient.post(
        `/workspaces/${workspaceId}/invites`,
        { email },
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inviteKeys.pending(workspaceId) });
    },
  });
}

export function useRemoveMember(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(
        `/workspaces/${workspaceId}/members/${userId}`,
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(workspaceId) });
    },
  });
}

export function useUpdateMemberRole(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiClient.patch(
        `/workspaces/${workspaceId}/members/${userId}/role`,
        { role },
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memberKeys.list(workspaceId) });
    },
  });
}
```

---

### Step 3: WebSocket Store — lastStreamId

```typescript
// apps/web/src/stores/websocket-store.ts — update

interface WebSocketState {
  status: WsStatus;
  lastStreamId: string;    // replaces lastEventId — Redis Stream entry ID
  reconnectAttempts: number;
  setStatus: (status: WsStatus) => void;
  setLastStreamId: (id: string) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}
```

Update `useWebSocket` to pass `last_event_id` as query param on reconnect:
```typescript
const lastStreamId = useWebSocketStore((s) => s.lastStreamId);
const url = `${WS_BASE}/workspaces/${workspaceId}?token=${accessToken}&last_event_id=${lastStreamId}`;
```

On message receipt, update `lastStreamId` from `message.stream_id`.

---

### Step 4: useDashboardUpdates — M5 Handlers

```typescript
// apps/web/src/hooks/useDashboardUpdates.ts — add M5 handlers

// member.update_submitted — a teammate submitted an update
const unsubMemberSubmit = subscribe<MemberUpdateSubmittedPayload>(
  "member.update_submitted",
  (payload) => {
    if (payload.workspace_id !== workspaceId) return;
    // Invalidate rather than optimistic update — we don't have
    // the full update data including author profile
    queryClient.invalidateQueries({
      queryKey: updateKeys.byDate(workspaceId, payload.update_date),
    });
  },
);

return () => {
  unsubStatusChanged();
  unsubTranscriptComplete();
  unsubMemberSubmit();
};
```

Also publish `member.update_submitted` from `UpdateService.submit_update`
on the backend after creating the update record.

---

### Step 5: Team Dashboard

```typescript
// apps/web/src/components/domain/dashboard/dashboard-view.tsx — updates

// New props
interface DashboardViewProps {
  ...existing props...
  currentUserId: string;
  members: WorkspaceMemberDetail[];   // all workspace members
}

// Pending members section
const pendingMembers = members.filter(
  (m) => !updates.some((u) => u.user_id === m.user_id)
);

// Render pending section
{pendingMembers.length > 0 && (
  <PendingMembersRow members={pendingMembers} />
)}

// UpdateCard now uses currentUserId to determine isOwn
// My own card gets a subtle left border: border-l-2 border-primary-container
```

New component:
```typescript
// apps/web/src/components/domain/dashboard/pending-members-row.tsx

interface PendingMembersRowProps {
  members: WorkspaceMemberDetail[];
}

// Shows horizontal row of member avatars with names tooltip
// "X haven't submitted yet" label
// Collapsed to show avatars + count if > 4 members
```

---

### Step 6: Settings — Profile + Members Pages

```
apps/web/src/app/(app)/settings/
├── page.tsx            ← redirects to /settings/profile
├── profile/
│   └── page.tsx        ← display name, timezone, avatar upload
└── members/
    └── page.tsx        ← member list + invite UI
```

**`/settings/profile` — key interactions:**
- Display name input (pre-filled from current profile)
- Timezone selector (same Radix Select + IANA list from onboarding)
- Avatar upload — circular preview, click to open file picker,
  calls `POST /api/v1/auth/profile/avatar` (already built in M1)
- Avatar delete — calls `DELETE /api/v1/auth/profile/avatar`
- Save button calls `PATCH /api/v1/auth/profile`
- On save success: update Zustand store user.full_name + user.avatar_url
  so sidebar and update cards reflect the change immediately

```typescript
// hooks/useProfileSettings.ts — new hook for settings page

export function useUpdateProfile() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: (data: { full_name?: string; timezone?: string }) =>
      apiClient.patch('/auth/profile', data, tokens?.access_token),
    onSuccess: (updated) => {
      // Update Zustand store so all components reflect the change
      if (user) setUser({ ...user, ...updated });
    },
  });
}

export function useUploadAvatar() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      // Note: apiClient.post uses JSON — avatar upload needs
      // multipart/form-data. Use fetch directly here.
      return fetch(
        `${API_BASE}/auth/profile/avatar`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokens?.access_token}` },
          body: formData,
        }
      ).then(r => r.json());
    },
    onSuccess: (updated) => {
      if (user) setUser({ ...user, avatar_url: updated.avatar_url });
    },
  });
}

export function useDeleteAvatar() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: () =>
      apiClient.delete('/auth/profile/avatar', tokens?.access_token),
    onSuccess: () => {
      if (user) setUser({ ...user, avatar_url: null });
    },
  });
}
```

**`/settings/members` — key interactions:**
- List all members with role badges
- "Invite member" button → opens InviteModal
- Three-dot menu per member → Change role / Remove (conditional on viewer's role)
- Pending invites section at bottom with revoke button

---

### Step 7: Invite Acceptance Page

```typescript
// apps/web/src/app/(app)/invite/[code]/page.tsx
// Public page — no auth required to view
// Server component reads invite details, client component handles acceptance

'use client';

// States:
// 1. Loading invite details
// 2. Invalid/expired invite — error message
// 3. Not logged in — show login/signup form
// 4. Logged in, email matches — "Accept invite" button
// 5. Logged in, email mismatch — warning + option to sign out
// 6. Already a member — redirect to dashboard
```

---

## Storybook Stories

```
src/stories/domain/PendingMembersRow.stories.tsx
  ← 1 member, 3 members, 6+ members (collapsed)

src/stories/domain/DashboardView.stories.tsx  ← add team variants
  ← TeamDashboard (3 members, mixed submitted/pending)
  ← SoloUser (single member, existing story updated)

src/stories/settings/ProfilePage.stories.tsx
  ← NoAvatar (initials placeholder)
  ← WithAvatar (image shown)
  ← SavingState (submit button spinner)

src/stories/settings/MembersPage.stories.tsx
  ← MemberList (owner view — all controls)
  ← MemberList (admin view — limited controls)
  ← MemberList (member view — no controls)
  ← PendingInvites section
  ← InviteModal

src/stories/ui/InviteAcceptance.stories.tsx
  ← ValidInvite (not logged in)
  ← ValidInvite (logged in, email match)
  ← ValidInvite (logged in, email mismatch)
  ← ExpiredInvite
  ← AlreadyUsedInvite
```

---

## Unit Tests

### Backend
```
tests/unit/test_invite_repo.py
  ← create, get_by_code, get_pending, mark_used, revoke
  ← create invalidates existing unused invite for same email

tests/unit/test_invite_service.py
  ← create_invite sends email, returns InviteResponse
  ← create_invite raises already_member if email is member
  ← accept_invite adds member, marks invite used
  ← accept_invite raises invite_expired
  ← accept_invite raises invite_already_used
  ← accept_invite warns on email mismatch (does not block)

tests/unit/test_member_router.py
  ← GET /members → 200 member list
  ← PATCH /members/:id/role → 200 (owner only)
  ← PATCH /members/:id/role → 403 for admin
  ← DELETE /members/:id → 204 (admin+)
  ← DELETE /members/:id → 403 for member

tests/unit/test_rbac.py
  ← require_workspace_role("admin") passes for owner
  ← require_workspace_role("admin") passes for admin
  ← require_workspace_role("admin") fails for member
  ← require_workspace_role("owner") fails for admin
  ← non-member → 403 on any role check

tests/unit/test_update_service_batch.py
  ← get_workspace_updates makes 2 queries not N+1
  ← batch profile fetch returns correct profiles per update

tests/unit/test_events_streams.py
  ← publish_event writes to correct stream key
  ← Redis failure is logged, not raised
  ← unknown event_type raises ValueError
```

### Frontend
```
hooks/useMembers.test.ts
  ← useWorkspaceMembers fetches member list
  ← useInviteMember invalidates pending invites on success
  ← useRemoveMember invalidates member list on success

components/PendingMembersRow.test.tsx
  ← renders member avatars
  ← shows count when > 4 members

components/MembersPage.test.tsx
  ← renders member list with role badges
  ← invite modal opens on button click
  ← remove option hidden for non-admin viewers
```

---

## Known Tradeoffs

**1. Email mismatch on invite acceptance**
The invite is sent to an email address but the accepting user may have
signed up with a different email (e.g. invited via work email, signed up
with personal). The service warns in logs but does not block. This is
a deliberate usability choice — requiring exact match would create
friction for common real-world scenarios.

**2. Redis Streams — broadcaster removed**
The broadcaster library is removed in this milestone. If broadcaster
was being used for other pub/sub beyond WebSocket events, audit before
removing. The streams approach requires the FastAPI server to poll Redis
directly, which uses a persistent connection per WebSocket client. At
high concurrency this is more resource-intensive than broadcaster's
subscribe model — acceptable at SoarUp's scale.

**3. RBAC is path-parameter scoped**
`require_workspace_role` reads `workspace_id` from the request path.
This means it only works on endpoints with `{workspace_id}` in the URL.
Endpoints on a different path shape need a custom dependency.

**4. Invite email uses plain HTML**
React Email templates are deferred to M6 when the digest email is built.
A coordinated template pass covering both invite and digest emails at the
same time is more efficient than doing each separately.

**5. member.update_submitted triggers invalidation not optimistic update**
When a teammate submits, the frontend invalidates the cache and refetches
rather than inserting optimistically. This is because the full update
response (including author profile) isn't available in the WebSocket
payload. A single refetch per new team submission is acceptable at M5 scale.

---

## Acceptance Criteria

```
[ ] Admin can invite a user by email — Resend delivers the email
[ ] Invite link works — recipient signs up/logs in and joins workspace
[ ] Invite expires after 7 days — expired invites show error on acceptance page
[ ] Invites are single-use — reusing a code shows error
[ ] Admin can revoke pending invites
[ ] Team dashboard shows all members' updates for today
[ ] Members who haven't submitted shown in pending section
[ ] When teammate submits, update appears on dashboard without refresh
[ ] member.update_submitted WebSocket event triggers cache invalidation
[ ] Admin can remove a member
[ ] Owner can change member role (member ↔ admin)
[ ] Member cannot change roles or remove members
[ ] PATCH /workspaces/:id/prompts requires owner role (was unprotected in M3)
[ ] GET /workspaces/:id/updates returns all members' updates (was only own)
[ ] N+1 profile query fixed — batch fetch in get_workspace_updates
[ ] Redis Streams replaces pub/sub — missed events replayed on reconnect
[ ] Profile settings page — update display name and timezone
[ ] Avatar upload works — stored in R2, URL shown in sidebar + update cards
[ ] Avatar delete works — reverts to initials placeholder
[ ] Zustand store updated immediately after profile/avatar save
[ ] Backend unit tests pass for invite, member, RBAC, streams
[ ] Frontend unit tests pass for member hooks + components
[ ] Storybook stories added for team dashboard, members page, profile page
[ ] CI passes on feature/milestone-5 branch
```

---

## Files To Create Summary

### Backend (apps/api/)
```
app/models/invite.py
app/schemas/invite.py
app/repositories/invite_repo.py
app/services/invite_service.py
app/routers/invites.py
app/routers/members.py
app/api/rbac.py
app/lib/email.py
alembic/versions/YYYYMMDD_*_add_workspace_invites.py
tests/unit/test_invite_repo.py
tests/unit/test_invite_service.py
tests/unit/test_member_router.py
tests/unit/test_rbac.py
tests/unit/test_update_service_batch.py
tests/unit/test_events_streams.py
```

### Frontend (apps/web/src/)
```
hooks/useMembers.ts
hooks/useProfileSettings.ts                   ← NEW: useUpdateProfile, useUploadAvatar, useDeleteAvatar
components/domain/dashboard/pending-members-row.tsx
app/(app)/settings/page.tsx                   ← redirects to /settings/profile
app/(app)/settings/profile/page.tsx           ← NEW: display name, timezone, avatar upload
app/(app)/settings/members/page.tsx
app/(app)/invite/[code]/page.tsx
stories/domain/PendingMembersRow.stories.tsx
stories/settings/ProfilePage.stories.tsx      ← NEW
stories/settings/MembersPage.stories.tsx
stories/ui/InviteAcceptance.stories.tsx
tests/unit/useMembers.test.ts
tests/unit/useProfileSettings.test.ts         ← NEW
tests/unit/PendingMembersRow.test.tsx
tests/unit/MembersPage.test.tsx
```

### Updated files
```
apps/api/app/models/workspace.py          ← WorkspaceMember + Profile join queries
apps/api/app/repositories/workspace_repo.py ← +get_member_by_email,
                                              +get_workspace_members_with_profiles,
                                              +update_member_role, +remove_member,
                                              +get_profiles_for_updates
apps/api/app/services/update_service.py   ← batch profile fetch, _to_response_with_profile
                                              +publish member.update_submitted on submit
apps/api/app/services/workspace_service.py ← +update_workspace_prompts owner check
apps/api/app/lib/events.py                ← Redis Streams (replaces pub/sub)
apps/api/app/routers/websockets.py        ← Redis Streams xread loop
apps/api/app/routers/workspaces.py        ← PATCH /:id/prompts → WorkspaceOwnerDep
apps/api/app/main.py                      ← +invites, +members routers
                                              remove broadcaster lifecycle hooks
apps/api/requirements.txt                 ← +resend>=2.0.0, remove broadcaster
apps/web/src/stores/websocket-store.ts    ← lastEventId → lastStreamId
apps/web/src/hooks/useWebSocket.ts        ← pass last_event_id on reconnect,
                                              update lastStreamId on message
apps/web/src/hooks/useDashboardUpdates.ts ← +member.update_submitted handler
apps/web/src/lib/websocket/types.ts       ← +MemberUpdateSubmittedPayload,
                                              +MemberJoinedPayload, +MemberLeftPayload
apps/web/src/components/domain/dashboard/dashboard-view.tsx ← team view,
                                              pending members, currentUserId prop
apps/web/src/app/(app)/dashboard/page.tsx ← pass members to DashboardView
```
