# SoarUp — Milestone 6: Digests + Settings + Cleanup

# Branch: feature/milestone-6

# Merges into: develop

# Prerequisites: feature/milestone-5 merged to develop ✅

# Branch 1 (feature/milestone-6-m5-cleanup): COMPLETE ✅ — squash merged into feature/milestone-6

---

## Status Overview

| Branch                                | Status               |
| ------------------------------------- | -------------------- |
| feature/milestone-6-m5-cleanup        | ✅ COMPLETE — merged |
| feature/milestone-6-digest-pipeline   | 🔲 NEXT              |
| feature/milestone-6-email-templates   | 🔲 TODO              |
| feature/milestone-6-history-page      | 🔲 TODO              |
| feature/milestone-6-digest-settings   | 🔲 TODO              |
| feature/milestone-6-stories-and-tests | 🔲 TODO              |

---

## What Branch 1 Delivered (COMPLETE ✅)

### Scaling Debt — all done

- `asyncio.to_thread` wrapping Resend send calls in `email.py`
- Redis Stream 30-day TTL via `expire` after `xadd` in `events.py`
- `broadcaster[redis]` removed from `requirements.txt`
- `INNER → LEFT OUTER JOIN` in `get_workspace_members_with_profiles`
- `OnboardedDep → WorkspaceAdminDep` on `create_invite`
- `OnboardedDep → WorkspaceOwnerDep` on `PATCH /workspaces/:id/prompts`
- Public route comment added to `middleware.ts`
- `lastEventId` persisted to `sessionStorage` on every update
- `localStorage` invite code stored with timestamp + 7-day expiry check

### M5 Carry-Forward — all done

- `member.update_submitted` event published in `submit_update`
- `RedisDep` factory created in `app/db/redis.py`, wired into `updates.py`
- `UpdateService.__init__` now takes `db: AsyncSession, redis: Redis`
- `useDashboardUpdates` — `member.update_submitted` handler added
- `PendingMembersRow` component wired into `DashboardView` + `DashboardPage`
- `useProfileSettings` hooks — `useUpdateProfile`, `useUploadAvatar`, `useDeleteAvatar`
- `/settings/profile` page — display name, timezone, avatar upload/delete
- Sidebar settings sub-links — Profile, Members, Digest, Workspace
- Ownership transfer endpoint — atomic role swap under `WorkspaceOwnerDep`
- Auto-accept invite on Step 1 complete — skips workspace step for invited users

### Type Fixes Applied

- `timezone: string | null` added to `UserProfile` in `useAuth.ts`
- `timezone` added to `UserResponse` in `schemas/auth.py`
- `timezone` populated in `_map_user_to_response` in `auth_service.py`
- Shared `MOCK_USER` + `MOCK_TOKENS` extracted to `tests/mocks/user.ts`
- `MemberUpdateSubmittedPayload` added to `@/lib/websocket/types`
- `pendingMembers: WorkspaceMember[]` added to `DashboardViewProps`

### Known Issues (pre-existing, not Branch 1 regressions)

- Starlette version mismatch between local and CI — `403 == 401` in some
  integration tests. Root cause: version pinning difference. Not a blocker.
- `HTTP_413_CONTENT_TOO_LARGE` → correct name is `HTTP_413_REQUEST_ENTITY_TOO_LARGE`
  in `test_api_utils.py` and production code. Fix before Branch 2 or alongside it.
- `test_auth_service.py` login/signup failures — pre-existing mock setup issue,
  unrelated to M6 changes.
- `TestMapUserToResponse::test_avatar_url_from_profile` — mock profile needs
  `mock_profile.timezone = "UTC"` added. Fix in `test_auth_service.py`.

---

## Branch 2: `feature/milestone-6-digest-pipeline` — START HERE

### Important Decisions Made in Branch 1 Session

1. **Jinja2 not React Email** — Tradeoff 4 applies. Use Jinja2 HTML templates
   in Python for all email rendering. React Email deferred post-M9.
2. **`workspace.digest_prompt`** — Referenced in task code but not in workspace
   model columns listed in spec. Decision: default to `None`, prompt builder
   falls back to `DEFAULT_DIGEST_PROMPT`. No extra migration needed.
3. **`get_digest_enabled_workspaces`** deferred from Branch 1 to Branch 2
   because `Workspace.digest_enabled` doesn't exist until the migration lands.
4. **`Profile.email`** is a critical blocker for digest email delivery —
   must be added in this branch (see tradeoff 3).

### Step 1: Database Models

**New file: `apps/api/app/models/digest.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Digest(Base):
    """
    A daily team-level digest generated from all workspace updates.
    One digest per workspace per day when the scheduled task runs.
    """
    __tablename__ = "digests"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    digest_date: Mapped[str] = mapped_column(
        String(10), nullable=False, index=True,
        doc="ISO date string YYYY-MM-DD",
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True,
        doc="Claude-generated team-level summary")
    status: Mapped[str] = mapped_column(
        String(20), default="pending",
        doc="pending | processing | sent | failed",
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    update_count: Mapped[int] = mapped_column(default=0,
        doc="Number of updates included in this digest")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Digest(workspace_id='{self.workspace_id}', date='{self.digest_date}')>"


class DigestItem(Base):
    """Links a Digest to an individual Update that was included in it."""
    __tablename__ = "digest_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    digest_id: Mapped[str] = mapped_column(
        String, ForeignKey("digests.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    update_id: Mapped[str] = mapped_column(
        String, ForeignKey("updates.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True,
        doc="Copy of update.summary at digest generation time")
```

**Update `apps/api/app/models/workspace.py` — add digest config columns:**

```python
from sqlalchemy import Boolean

digest_enabled: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False,
    doc="Whether daily digest is enabled for this workspace",
)
digest_send_time: Mapped[str] = mapped_column(
    String(5), default="09:00",
    doc="HH:MM in workspace timezone",
)
digest_timezone: Mapped[str | None] = mapped_column(
    String(64), nullable=True,
    doc="IANA timezone override. Falls back to owner profile timezone if null.",
)
digest_days: Mapped[str] = mapped_column(
    String(20), default="1,2,3,4,5",
    doc="Comma-separated ISO weekday numbers. 1=Mon, 7=Sun.",
)
```

**Update `apps/api/app/models/profile.py` — add email column (CRITICAL):**

```python
email: Mapped[str | None] = mapped_column(
    String(255), nullable=True,
    doc="User email address — populated on signup for digest delivery",
)
```

Also populate `email` in `profile_repo.create()` from the signup flow.

**Alembic migrations — three separate revisions:**

```bash
docker compose exec api alembic revision --autogenerate -m "add_digests_and_digest_items"
docker compose exec api alembic revision --autogenerate -m "add_digest_config_to_workspaces"
docker compose exec api alembic revision --autogenerate -m "add_email_to_profiles"
docker compose exec api alembic upgrade head
```

**Update `conftest.py`:**

```python
import app.models.digest  # noqa: F401
```

---

### Step 2: Digest Schemas

**New file: `apps/api/app/schemas/digest.py`**

```python
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class DigestItemResponse(BaseModel):
    id: str
    update_id: str
    author_name: str | None
    summary_snapshot: str | None
    model_config = ConfigDict(from_attributes=True)


class DigestResponse(BaseModel):
    id: str
    workspace_id: str
    digest_date: str
    summary: str | None
    status: str
    update_count: int
    email_sent_at: datetime | None
    created_at: datetime
    items: list[DigestItemResponse] = []
    model_config = ConfigDict(from_attributes=True)


class DigestListResponse(BaseModel):
    digests: list[DigestResponse]
    next_cursor: str | None
    total: int


class UpdateDigestSettingsRequest(BaseModel):
    digest_enabled: bool | None = None
    digest_send_time: str | None = Field(
        None, pattern=r"^\d{2}:\d{2}$",
        description="HH:MM format",
    )
    digest_timezone: str | None = None
    digest_days: str | None = Field(
        None, pattern=r"^[1-7](,[1-7])*$",
        description="Comma-separated ISO weekday numbers e.g. '1,2,3,4,5'",
    )


class DigestPreviewResponse(BaseModel):
    html: str
    digest_date: str
    update_count: int
    would_send_to: list[str]
```

---

### Step 3: Digest Repository

**New file: `apps/api/app/repositories/digest_repo.py`**
Full implementation in original spec — cursor-based pagination with keyset
on `created_at`. Methods: `create`, `get_by_id`, `get_for_workspace_date`,
`get_workspace_digests`, `add_items`, `get_items`, `update_status`.

**Also add to `workspace_repo.py` (deferred from Branch 1):**

```python
async def get_digest_enabled_workspaces(self) -> list[Workspace]:
    result = await self.db.execute(
        select(Workspace).where(Workspace.digest_enabled == True)  # noqa: E712
    )
    return list(result.scalars().all())
```

---

### Step 4: Jinja2 Email Templates (NOT React Email — see tradeoff 4)

**Install:** Add `jinja2` to `requirements.txt` (verify not already present as
transitive dep first).

**New files:**

- `apps/api/app/email_templates/layout.html` — shared SoarUp header + footer
- `apps/api/app/email_templates/invite_email.html` — invite email
- `apps/api/app/email_templates/digest_email.html` — digest email

Electric Atelier inline styles (email clients don't support CSS vars):

```
background: #0e0e10
surface: #1f1f22
primary: #53ddfc
onSurface: #f9f5f8
muted: #adaaad
border: #48474a
```

**Update `apps/api/app/lib/email.py`:**

```python
from jinja2 import Environment, FileSystemLoader

_jinja = Environment(loader=FileSystemLoader("app/email_templates"))

def render_digest_email(
    workspace_name: str,
    digest_date: str,
    team_summary: str,
    items: list[dict],
    unsubscribe_url: str,
) -> str:
    tmpl = _jinja.get_template("digest_email.html")
    return tmpl.render(
        workspace_name=workspace_name,
        digest_date=digest_date,
        team_summary=team_summary,
        items=items,
        unsubscribe_url=unsubscribe_url,
    )

def render_invite_email(
    workspace_name: str,
    inviter_name: str,
    invite_url: str,
    expires_in_days: int = 7,
) -> str:
    tmpl = _jinja.get_template("invite_email.html")
    return tmpl.render(
        workspace_name=workspace_name,
        inviter_name=inviter_name,
        invite_url=invite_url,
        expires_in_days=expires_in_days,
    )
```

Also update `send_invite_email` to use `render_invite_email` instead of
whatever inline HTML it currently builds.

---

### Step 5: Celery Beat + Digest Tasks

**Update `apps/api/app/workers/celery_app.py`:**

```python
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "check-workspace-digests": {
        "task": "app.workers.tasks.check_and_send_digests",
        "schedule": crontab(minute="*/5"),
    },
}
```

**Update `apps/api/app/workers/tasks.py` — add two tasks:**

- `check_and_send_digests` — polling task, timezone-aware, enqueues
  `send_workspace_digest` when conditions met
- `send_workspace_digest` — generates Claude summary (Sonnet primary,
  Haiku fallback on retry), stores DigestItems, sends email

Full implementation in original spec. Note: `workspace.digest_prompt`
referenced in task — default to `None`, `build_digest_prompt` falls back
to `DEFAULT_DIGEST_PROMPT`.

**Update `apps/api/app/workers/prompts.py`:**

```python
DEFAULT_DIGEST_PROMPT = (
    "You are summarising the daily standups for {workspace_name} on {digest_date}.\n\n"
    "Individual updates:\n{summaries}\n\n"
    "Write a concise 2-3 sentence team summary highlighting key progress, "
    "blockers, and themes. Be specific. Do not list individuals by name."
)

def build_digest_prompt(
    workspace_name: str,
    digest_date: str,
    summaries: str,
    custom_prompt: str | None = None,
) -> str:
    template = custom_prompt or DEFAULT_DIGEST_PROMPT
    return template.format(
        workspace_name=workspace_name,
        digest_date=digest_date,
        summaries=summaries,
    )
```

**Update `docker-compose.yml` beat service:**

```yaml
beat:
  command: celery -A app.workers.celery_app beat --loglevel=info --scheduler celery.beat.PersistentScheduler
```

---

### Step 6: Digest Router

**New file: `apps/api/app/routers/digests.py`**

Endpoints:

- `GET /{workspace_id}/digests` — cursor pagination, `WorkspaceMemberDep`
- `GET /{workspace_id}/digests/{digest_id}` — with items, `WorkspaceMemberDep`
- `PATCH /{workspace_id}/digest-settings` — `WorkspaceAdminDep`
- `POST /{workspace_id}/digests/preview` — renders HTML without sending, `WorkspaceAdminDep`

**Register in `apps/api/app/main.py`:**

```python
from app.routers import digests
app.include_router(digests.router, prefix="/api/v1")
```

---

### Branch 2 Tests

**Backend:**

```
tests/unit/test_digest_repo.py
  ← create, get_by_id, get_for_workspace_date
  ← get_workspace_digests cursor pagination
  ← add_items, get_items, update_status

tests/unit/test_send_workspace_digest_task.py
  ← happy path: creates digest, generates summary, sends email
  ← no processed updates → status=failed, no email sent
  ← idempotency: skips if digest already sent
  ← email_notifications=False members excluded

tests/unit/test_check_and_send_digests_task.py
  ← skips workspaces where digest not enabled
  ← skips if today not in digest_days
  ← skips if current time doesn't match send_time
  ← enqueues send_workspace_digest when all conditions met
  ← timezone resolution: workspace timezone overrides owner profile

tests/unit/test_digest_router.py
  ← GET /digests → 200 with cursor pagination
  ← GET /digests/:id → 200 with items
  ← PATCH /digest-settings → 200 (admin+)
  ← PATCH /digest-settings → 403 for member
  ← POST /digests/preview → 200 with html
  ← POST /digests/preview → 200 with empty html when no updates today

tests/unit/test_email_templates.py
  ← render_digest_email returns valid HTML string
  ← render_invite_email returns valid HTML string
  ← team summary appears in rendered digest HTML
```

---

## Branch 3: `feature/milestone-6-email-templates`

Separate branch for Storybook visual previews of email templates.
Deferred — covered by `test_email_templates.py` in Branch 2.
May be folded into Branch 6 (stories-and-tests).

---

## Branch 4: `feature/milestone-6-history-page`

### Digest Query Keys + Hooks

**New file: `apps/web/src/hooks/useDigests.ts`**

```typescript
export const digestKeys = {
  all: (workspaceId: string) => ["digests", workspaceId] as const,
  list: (workspaceId: string) => ["digests", workspaceId, "list"] as const,
  detail: (workspaceId: string, digestId: string) =>
    ["digests", workspaceId, digestId] as const,
  settings: (workspaceId: string) =>
    ["digests", workspaceId, "settings"] as const,
};

// useDigests — useInfiniteQuery, cursor pagination
// useUpdateDigestSettings — PATCH digest-settings, invalidates settings cache
// useDigestPreview — POST digests/preview, returns DigestPreviewResponse
```

Full hook implementations in original spec.

### Components

**New files:**

- `apps/web/src/components/domain/digests/digest-card.tsx`
  - Date header (uppercase label), update count badge
  - Team summary (Newsreader italic, cyan left border)
  - "View updates ▾" collapsible toggle
  - Expanded: `DigestItemRow` per item
- `apps/web/src/components/domain/digests/digest-item-row.tsx`
  - Author initials/avatar + name + summary snippet (2 lines max)

### Page

**New file: `apps/web/src/app/(app)/history/page.tsx`**

- Uses `useDigests` (useInfiniteQuery)
- DigestCard list, "Load more" button
- Empty state: "No digests yet. Digests are generated daily when updates exist."

---

## Branch 5: `feature/milestone-6-digest-settings`

### Page

**New file: `apps/web/src/app/(app)/settings/digest/page.tsx`**

- Enable/disable toggle (cyan when active)
- Time picker HH:MM (hours + minutes separately)
- Timezone selector (same Radix Select as onboarding)
- Days of week pill toggles M T W T F S S (cyan fill active, outline inactive)
- "Preview digest" button → calls `useDigestPreview` → opens `DigestPreviewModal`
- "Save settings" primary asymmetric button

**New file: `apps/web/src/components/domain/digests/digest-preview-modal.tsx`**

- "Digest Preview" title
- `<iframe srcDoc={html} sandbox="allow-same-origin" />` (NOT dangerouslySetInnerHTML)
- Close button
- "Send now" ghost button — defer to post-M6

---

## Branch 6: `feature/milestone-6-stories-and-tests`

### Storybook Stories

```
src/stories/domain/digests/DigestCard.stories.tsx
  ← WithSummary (expanded + collapsed), NoUpdates, Loading skeleton

src/stories/domain/digests/DigestItemRow.stories.tsx
  ← WithAvatar, WithInitials

src/stories/domain/dashboard/PendingMembersRow.stories.tsx
  ← 1 member, 3 members, 6+ (collapsed)

src/stories/settings/ProfilePage.stories.tsx
  ← NoAvatar (initials), WithAvatar, Saving state

src/stories/settings/DigestSettingsPage.stories.tsx
  ← Disabled state, Enabled state, Saving state

src/stories/pages/HistoryPage.stories.tsx
  ← WithDigests (list), EmptyState, Loading
```

### Frontend Unit Tests

```
tests/unit/useDigests.test.ts
tests/unit/useProfileSettings.test.ts
tests/unit/DigestCard.test.tsx
tests/unit/PendingMembersRow.test.tsx
```

---

## Stack Reference

### Backend

- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local)
- Alembic, Structlog, Redis, Celery + Celery Beat (added in Branch 2)
- Resend Python SDK — wrapped with `asyncio.to_thread` ✅
- Jinja2 for email templates (not React Email) ✅ decision made
- broadcaster removed ✅
- pytest + pytest-asyncio, full conftest.py fixture suite

### Frontend

- Next.js 14 App Router, TypeScript
- Tailwind CSS + Electric Atelier tokens
- @tanstack/react-query v5
- Zustand + persist
- WebSocket registry + useWebSocket + useDashboardUpdates ✅

### Design Tokens

```
text-on-surface, text-on-surface-variant, text-outline
bg-surface, bg-surface-high, bg-surface-highest, bg-container
text-primary, bg-primary-container, text-primary-on-container
text-error, border-outline-variant, shadow-electric
```

### React Query Cache Keys (established)

```typescript
updateKeys.byDate(workspaceId, date)
workspaceKeys.mine()
memberKeys.list(workspaceId)
audioKeys.playback(workspaceId, updateId)
digestKeys.list(workspaceId)        ← Branch 4
digestKeys.settings(workspaceId)    ← Branch 5
```

### Electric Atelier Design Rules

```
0px border radius except pills and 4px cards
Space Grotesk UI font
Newsreader italic headlines
Bottom-border inputs
Asymmetric CTA buttons: rounded-tl-3xl rounded-br-3xl rounded-tr-lg rounded-bl-lg
```

---

## Known Tradeoffs

**1. Celery Beat polls every 5 minutes**
Digest send times accurate to nearest 5-minute window. Acceptable for daily digest.

**2. Sonnet for digests (not Haiku)**
Sonnet is primary for better synthesis quality. Haiku fallback on retry.
Monitor Anthropic API spend.

**3. Profile.email critical blocker**
Must add `email: Mapped[str | None]` to `Profile` model and populate on signup
in Branch 2. Without it digest email list will be empty for all workspaces.

**4. Jinja2 not React Email**
Decision finalised. Use Jinja2 HTML templates in Python for M6.
React Email post-M9.

**5. Digest preview iframe**
Use `<iframe srcDoc={html} sandbox="allow-same-origin" />`.
`dangerouslySetInnerHTML` blocked in Next.js for sandboxed content.

---

## Acceptance Criteria

```
[x] PendingMembersRow shows on dashboard when team members haven't submitted
[x] member.update_submitted event published and handled in useDashboardUpdates
[x] Profile settings page — update name, timezone, upload/delete avatar
[ ] Avatar shown in sidebar + update cards after upload  ← needs manual QA
[x] Auto-accept invite after Step 1 — invited users skip workspace step
[x] Invite code localStorage cleared after expiry window
[x] Ownership transfer endpoint works
[ ] Celery Beat schedules check_and_send_digests every 5 minutes
[ ] Digest generated for workspace when send_time + day conditions match
[ ] Digest skipped if no processed updates exist for the day
[ ] Claude Sonnet used for team digest summary
[ ] DigestItem records created linking digest to contributing updates
[ ] Digest email sent to all members with email_notifications=true
[ ] Profile.email populated on signup (required for email delivery)
[ ] /history page shows paginated digest cards
[ ] DigestCard expands to show individual update summaries
[ ] useInfiniteQuery powers /history — "Load more" works
[ ] /settings/digest page — enable/disable, time, timezone, days
[ ] Digest preview returns rendered HTML
[ ] Preview modal shows email rendering
[x] All scaling debt items actioned (broadcaster removed, LEFT JOIN, etc.)
[ ] Backend unit tests pass for digest repo + task + router
[ ] Frontend unit tests pass for DigestCard + useDigests + profile hooks
[ ] Storybook stories added for digest and profile components
[ ] CI passes on feature/milestone-6 branch
```
