# SoarUp — Milestone 6: Digests + Settings + Cleanup
# Branch: feature/milestone-6
# Merges into: develop
# Prerequisites: feature/milestone-5 merged to develop ✅
# Target: end of weekend

---

## What This Milestone Delivers

### M5 Carry-Forward
1. Team dashboard pending section — PendingMembersRow + member.update_submitted event
2. Profile settings page — display name, timezone, avatar upload/delete
3. PATCH /workspaces/:id/prompts owner gate applied
4. Auto-accept invite on Step 1 complete (skip workspace step for invited users)
5. localStorage invite code timestamp + expiry check

### Core M6 Features
6. Celery Beat — schedules send_workspace_digest at per-workspace configured time
7. Digest generation — aggregates processed updates → Claude team summary
8. React Email templates — InviteEmail + DigestEmail matching Electric Atelier
9. Resend digest email delivery to all workspace members
10. /history page — paginated digest cards with expandable individual updates
11. Digest settings — send time, timezone override, days of week, email toggle
12. Digest preview endpoint — renders HTML email without sending

### Scaling Debt (near-zero effort, pre-launch blockers)
13. asyncio.to_thread for Resend send call
14. Redis Stream TTL after xadd
15. Remove broadcaster[redis] from requirements
16. LEFT OUTER JOIN in get_workspace_members_with_profiles
17. Tighten create_invite to WorkspaceAdminDep
18. lastEventId persisted to sessionStorage
19. localStorage invite code timestamp + expiry (same as carry-forward #5)
20. Middleware comment documenting /invite as public
21. Ownership transfer endpoint

---

## Branch Strategy

```
develop
└── feature/milestone-6
    ├── feature/milestone-6-m5-cleanup           ← carry-forward + scaling debt fixes
    ├── feature/milestone-6-digest-pipeline      ← Celery Beat + digest generation
    ├── feature/milestone-6-email-templates      ← React Email templates
    ├── feature/milestone-6-history-page         ← /history frontend
    ├── feature/milestone-6-digest-settings      ← workspace digest config
    └── feature/milestone-6-stories-and-tests   ← Storybook + unit tests

Merge order:
  feature/milestone-6-m5-cleanup → feature/milestone-6
  feature/milestone-6-digest-pipeline → feature/milestone-6
  feature/milestone-6-email-templates → feature/milestone-6
  feature/milestone-6-history-page → feature/milestone-6
  feature/milestone-6-digest-settings → feature/milestone-6
  feature/milestone-6-stories-and-tests → feature/milestone-6
  feature/milestone-6 → develop
```

---

## Google Stitch Prompt

```
Design three screens for SoarUp using the Electric Atelier design system.

Colors (dark mode): Background #0e0e10, Primary #53ddfc (cyan),
Surface High #1f1f22, Surface Highest #262528, On-surface #f9f5f8,
Error #ff716c, Outline-variant #48474a
Colors (light mode): Background #ebfdfc, Primary #00687a,
Surface Lowest #ffffff, On-surface #0e1e1e

Design rules: 0px border radius except pills and 4px cards.
Space Grotesk UI, Newsreader italic headlines, bottom-border inputs,
asymmetric CTA buttons.

Screen 1 — /history page:
- Page title: "History" (Newsreader italic headline)
- Subtitle: "PAST DIGESTS" (10px uppercase tracked Space Grotesk)
- Digest card list (newest first):
  Each card shows: date (bold), workspace name, "X updates" count,
  team digest summary text (Newsreader italic, truncated to 3 lines),
  "View updates ▾" collapsible toggle
  Expanded state: individual update mini-cards (avatar + name + summary snippet)
- Infinite scroll / "Load more" button at bottom
- Empty state: "No digests yet. Digests are generated daily when updates exist."

Screen 2 — /settings/digest page:
- Section title: "Digest Settings"
- Toggle: "Send daily digest email" (on/off, cyan when active)
- Time picker: "Send at" — HH:MM dropdown (hours + minutes separately)
- Timezone: searchable select (same component as onboarding)
- Days of week: pill toggles for M T W T F S S
  Active days: cyan fill, inactive: outline only
- "Preview digest" button (secondary) — opens preview modal
- "Save settings" button (primary asymmetric)
- Preview modal: full-width iframe showing rendered digest email HTML

Screen 3 — /settings/profile page:
- Section title: "Profile"
- Avatar section: large circular avatar (80px) with initials fallback,
  "Change photo" button below, "Remove photo" ghost link
- Display name input (bottom-border style)
- Timezone selector (same as onboarding)
- "Save changes" button (primary asymmetric)
- Unsaved changes indicator: subtle amber dot next to "Save changes"
```

---

## Existing Stack Reference

### Backend
- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local)
- Alembic, Structlog, Redis, Celery
- Celery Beat — add in this milestone
- Resend Python SDK (synchronous — wrap with asyncio.to_thread)
- faster-whisper, pydub, ffmpeg — M4 ✅
- broadcaster removed — M5 ✅ (verify and remove from requirements)
- pytest + pytest-asyncio, full conftest.py fixture suite

### Frontend
- Next.js 14 App Router, TypeScript
- Tailwind CSS + Electric Atelier tokens
- @tanstack/react-query v5
- Zustand + persist
- WebSocket registry + useWebSocket + useDashboardUpdates ✅
- React Email — add in this milestone

### Design tokens
```
text-on-surface, text-on-surface-variant, text-outline
bg-surface, bg-surface-high, bg-surface-highest, bg-container
text-primary, bg-primary-container, text-primary-on-container
text-error, border-outline-variant, shadow-electric
```

### React Query cache keys (established)
```typescript
updateKeys.byDate(workspaceId, date)
workspaceKeys.mine()
memberKeys.list(workspaceId)
audioKeys.playback(workspaceId, updateId)
```

---

## Part 1: M5 Carry-Forward + Scaling Debt

### 1a. Scaling debt — near-zero fixes (do these first)

**asyncio.to_thread for Resend:**
```python
# apps/api/app/lib/email.py
import asyncio
# Change:
resend.Emails.send(params)
# To:
await asyncio.to_thread(resend.Emails.send, params)
```

**Redis Stream TTL:**
```python
# apps/api/app/lib/events.py — after xadd in append_event
await redis.expire(_stream_key(workspace_id), 30 * 24 * 60 * 60)
```

**Remove broadcaster:**
```
requirements.txt — remove broadcaster[redis]>=0.3.0
```

**LEFT OUTER JOIN:**
```python
# apps/api/app/repositories/workspace_repo.py
# Change .join( → .outerjoin(
select(WorkspaceMember, Profile)
.outerjoin(Profile, WorkspaceMember.user_id == Profile.id)
```

**Tighten invite creation:**
```python
# apps/api/app/routers/invites.py
# Change:
user_ctx: OnboardedDep,
# To:
user_ctx: WorkspaceAdminDep,
```

**Apply PATCH /workspaces/:id/prompts owner gate:**
```python
# apps/api/app/routers/workspaces.py
# Change:
user_ctx: OnboardedDep,
# To:
user_ctx: WorkspaceOwnerDep,
```

**Middleware comment:**
```typescript
// apps/web/src/middleware.ts — add above PROTECTED_ROUTES
// PUBLIC_ROUTES — never add these to PROTECTED_ROUTES or AUTH_ROUTES
// /invite/* — invite acceptance, requires no auth to view
// /api/v1/invites/* — invite details endpoint, no auth required
```

**lastEventId to sessionStorage:**
```typescript
// apps/web/src/stores/websocket-store.ts
setLastEventId: (id) => {
  sessionStorage.setItem("soarup_ws_last_event_id", id);
  set({ lastEventId: id });
},

// apps/web/src/hooks/useWebSocket.ts — on connect
const stored = sessionStorage.getItem("soarup_ws_last_event_id");
const cursor = stored ?? "$";
```

**localStorage invite code timestamp:**
```typescript
// apps/web/src/app/(public)/invite/[code]/page.tsx
localStorage.setItem(
  PENDING_INVITE_KEY,
  JSON.stringify({ code, storedAt: Date.now() }),
);

// apps/web/src/components/domain/auth/onboarding-form.tsx — on read
const raw = localStorage.getItem(PENDING_INVITE_KEY);
if (raw) {
  const { code, storedAt } = JSON.parse(raw);
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - storedAt > SEVEN_DAYS) {
    localStorage.removeItem(PENDING_INVITE_KEY);
    return null;
  }
  return code;
}
```

---

### 1b. Team dashboard pending section

**Backend — publish member.update_submitted:**
```python
# apps/api/app/services/update_service.py
# Add after update record created in submit_update:

from app.lib.events import append_event

await append_event(
    self._get_redis(),
    "member.update_submitted",
    workspace_id,
    {
        "update_id": update.id,
        "workspace_id": workspace_id,
        "user_id": user_id,
        "update_date": request.update_date,
    },
)
```

Note: `UpdateService` needs a Redis instance. Add `redis: Redis` as a
constructor parameter alongside `db: AsyncSession`. Update `get_update_service`
dependency in the router to inject Redis.

**Frontend — useDashboardUpdates M5 handler:**
Already defined in the M5 spec — add the `member.update_submitted` handler
that calls `queryClient.invalidateQueries` on the updates cache key.

**Frontend — PendingMembersRow component:**
```typescript
// apps/web/src/components/domain/dashboard/pending-members-row.tsx

interface PendingMembersRowProps {
  members: WorkspaceMemberDetail[];
}

// Shows horizontal row of member avatars
// "X haven't submitted yet" label
// Collapses to avatars + count if > 4 members
// Each avatar shows initials if no avatar_url
```

Wire into `DashboardView`:
```typescript
// Pass members from useWorkspaceMembers to DashboardView
// Derive pendingMembers = members.filter(
//   m => !updates.some(u => u.user_id === m.user_id)
// )
// Render <PendingMembersRow members={pendingMembers} /> above update list
```

---

### 1c. Profile settings page

```typescript
// apps/web/src/app/(app)/settings/profile/page.tsx

// Hooks needed:
// useUpdateProfile — PATCH /auth/profile
// useUploadAvatar — POST /auth/profile/avatar (multipart/form-data)
// useDeleteAvatar — DELETE /auth/profile/avatar
```

```typescript
// apps/web/src/hooks/useProfileSettings.ts

export function useUpdateProfile() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: (data: { full_name?: string; timezone?: string }) =>
      apiClient.patch("/auth/profile", data, tokens?.access_token),
    onSuccess: (updated) => {
      if (user) setUser({ ...user, ...updated });
    },
  });
}

export function useUploadAvatar() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/auth/profile/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens?.access_token}` },
        body: formData,
      });
      if (!res.ok) throw new ApiRequestError("upload_failed", "Upload failed", res.status);
      return res.json();
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
      apiClient.delete("/auth/profile/avatar", tokens?.access_token),
    onSuccess: () => {
      if (user) setUser({ ...user, avatar_url: null });
    },
  });
}
```

Settings page navigation — update `sidebar.tsx` to show sub-links under
Settings when on any `/settings/*` route:
```typescript
// Settings nav with sub-links
{ href: "/settings/profile",  label: "Profile",  icon: "person"   }
{ href: "/settings/members",  label: "Members",  icon: "group"    }
{ href: "/settings/digest",   label: "Digest",   icon: "mail"     }
{ href: "/settings/workspace",label: "Workspace",icon: "business" }
```

---

### 1d. Auto-accept invite on Step 1 complete

```typescript
// apps/web/src/components/domain/auth/onboarding-form.tsx

async function handleStep1Complete(data: Step1Data) {
  await patchProfile({ full_name: data.displayName, timezone: data.timezone,
                        is_onboarded: true });

  const pendingCode = readPendingInviteCode(); // reads + validates localStorage

  if (pendingCode) {
    try {
      const result = await acceptInvite(pendingCode);
      localStorage.removeItem(PENDING_INVITE_KEY);
      // Update Zustand store
      setUser({ ...user, is_onboarded: true });
      router.replace("/dashboard");
    } catch (err) {
      // Invite expired/invalid — fall through to normal workspace step
      localStorage.removeItem(PENDING_INVITE_KEY);
      setStep(2);
    }
  } else {
    setStep(2); // normal flow — show workspace creation step
  }
}
```

The user never sees Step 2 if a valid invite exists. If `acceptInvite` fails
(expired, revoked), the code is cleared and the user falls through to the
normal workspace creation step with a non-blocking error toast.

---

### 1e. Ownership transfer endpoint

```python
# apps/api/app/routers/members.py

@router.post("/{workspace_id}/transfer-ownership", status_code=200)
async def transfer_ownership(
    workspace_id: str,
    request: TransferOwnershipRequest,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceOwnerDep,
    db: DBSessionDep,
) -> Response:
    """
    Atomically transfer workspace ownership to another member.
    Current owner becomes admin. Target member becomes owner.
    Requires WorkspaceOwnerDep.
    """
    ...
```

```python
class TransferOwnershipRequest(BaseModel):
    new_owner_id: str = Field(..., description="user_id of the member to promote to owner")
```

Implementation: two role updates inside a single DB transaction.

---

## Part 2: Digest Pipeline

### Step 1: Database Models

```python
# apps/api/app/models/digest.py

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
    """
    Links a Digest to an individual Update that was included in it.
    """
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
    # Snapshot fields — preserve content even if update is later deleted
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True,
        doc="Copy of update.summary at digest generation time")
```

Add workspace digest config columns (migration):
```python
# apps/api/app/models/workspace.py — add

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

Alembic migrations (two separate revisions):
```bash
docker compose exec api alembic revision --autogenerate -m "add_digests_and_digest_items"
docker compose exec api alembic revision --autogenerate -m "add_digest_config_to_workspaces"
docker compose exec api alembic upgrade head
```

Add to `conftest.py`:
```python
import app.models.digest  # noqa: F401
```

---

### Step 2: Digest Schemas

```python
# apps/api/app/schemas/digest.py

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
    next_cursor: str | None   # digest.id of last item, None if no more pages
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
    html: str               # Rendered React Email HTML
    digest_date: str
    update_count: int
    would_send_to: list[str]  # email addresses that would receive it
```

---

### Step 3: Digest Repository

```python
# apps/api/app/repositories/digest_repo.py

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.digest import Digest, DigestItem


class DigestRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "DigestRepository":
        return cls(db)

    async def create(
        self,
        workspace_id: str,
        digest_date: str,
    ) -> Digest:
        digest = Digest(workspace_id=workspace_id, digest_date=digest_date)
        self.db.add(digest)
        await self.db.commit()
        await self.db.refresh(digest)
        return digest

    async def get_by_id(self, digest_id: str) -> Digest | None:
        result = await self.db.execute(
            select(Digest).where(Digest.id == digest_id)
        )
        return result.scalar_one_or_none()

    async def get_for_workspace_date(
        self, workspace_id: str, digest_date: str
    ) -> Digest | None:
        result = await self.db.execute(
            select(Digest).where(
                and_(
                    Digest.workspace_id == workspace_id,
                    Digest.digest_date == digest_date,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_workspace_digests(
        self,
        workspace_id: str,
        limit: int = 20,
        cursor: str | None = None,
    ) -> tuple[list[Digest], str | None]:
        """Cursor-based pagination — cursor is digest.id of last seen item."""
        query = select(Digest).where(
            Digest.workspace_id == workspace_id
        ).order_by(desc(Digest.created_at))

        if cursor:
            # Get the created_at of the cursor digest for keyset pagination
            cursor_digest = await self.get_by_id(cursor)
            if cursor_digest:
                query = query.where(
                    Digest.created_at < cursor_digest.created_at
                )

        query = query.limit(limit + 1)  # fetch one extra to detect next page
        result = await self.db.execute(query)
        digests = list(result.scalars().all())

        next_cursor = None
        if len(digests) > limit:
            digests = digests[:limit]
            next_cursor = digests[-1].id

        return digests, next_cursor

    async def add_items(
        self,
        digest_id: str,
        items: list[dict],
    ) -> None:
        for item in items:
            self.db.add(DigestItem(digest_id=digest_id, **item))
        await self.db.commit()

    async def get_items(self, digest_id: str) -> list[DigestItem]:
        result = await self.db.execute(
            select(DigestItem).where(DigestItem.digest_id == digest_id)
        )
        return list(result.scalars().all())

    async def update_status(
        self,
        digest: Digest,
        status: str,
        summary: str | None = None,
        update_count: int | None = None,
        email_sent_at=None,
    ) -> Digest:
        digest.status = status
        if summary is not None:
            digest.summary = summary
        if update_count is not None:
            digest.update_count = update_count
        if email_sent_at is not None:
            digest.email_sent_at = email_sent_at
        await self.db.commit()
        await self.db.refresh(digest)
        return digest
```

---

### Step 4: React Email Templates

Install:
```
@react-email/components>=0.0.22
@react-email/render>=1.0.0
```

```tsx
// apps/api/app/email_templates/layout.tsx
// Shared email layout — SoarUp header + footer
// Uses inline styles (email clients don't support CSS vars)

const COLORS = {
  background: "#0e0e10",
  surface: "#1f1f22",
  primary: "#53ddfc",
  onSurface: "#f9f5f8",
  muted: "#adaaad",
  border: "#48474a",
};

export function EmailLayout({ children, previewText }) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: COLORS.background, fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 16px" }}>
          {/* Header */}
          <Section style={{ marginBottom: "32px" }}>
            <Text style={{ color: COLORS.primary, fontSize: "20px",
                           fontWeight: "700", letterSpacing: "0.05em" }}>
              SoarUp
            </Text>
          </Section>
          {children}
          {/* Footer */}
          <Section style={{ marginTop: "48px", borderTop: `1px solid ${COLORS.border}`,
                            paddingTop: "24px" }}>
            <Text style={{ color: COLORS.muted, fontSize: "12px" }}>
              You're receiving this because you're a member of a SoarUp workspace.
            </Text>
            <Link href="{{{UNSUBSCRIBE_URL}}}"
                  style={{ color: COLORS.muted, fontSize: "12px" }}>
              Manage digest settings
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

```tsx
// apps/api/app/email_templates/invite_email.tsx

export function InviteEmail({ workspaceName, inviterName, inviteUrl, expiresInDays }) {
  return (
    <EmailLayout previewText={`${inviterName} invited you to join ${workspaceName}`}>
      <Section>
        <Heading style={{ color: COLORS.onSurface, fontSize: "24px",
                          fontStyle: "italic", fontFamily: "Georgia, serif" }}>
          You've been invited
        </Heading>
        <Text style={{ color: COLORS.muted }}>
          {inviterName} has invited you to join <strong style={{ color: COLORS.onSurface }}>
          {workspaceName}</strong> on SoarUp.
        </Text>
        <Button href={inviteUrl}
                style={{ backgroundColor: COLORS.primary, color: "#004b58",
                         padding: "12px 24px", fontWeight: "700",
                         borderRadius: "0px", display: "inline-block",
                         borderTopLeftRadius: "1.5rem",
                         borderBottomRightRadius: "1.5rem",
                         borderTopRightRadius: "0.5rem",
                         borderBottomLeftRadius: "0.5rem" }}>
          Accept invite →
        </Button>
        <Text style={{ color: COLORS.muted, fontSize: "12px", marginTop: "16px" }}>
          This invite expires in {expiresInDays} days.
        </Text>
      </Section>
    </EmailLayout>
  );
}
```

```tsx
// apps/api/app/email_templates/digest_email.tsx

export function DigestEmail({ workspaceName, digestDate, teamSummary, items }) {
  return (
    <EmailLayout previewText={`${workspaceName} standup digest — ${digestDate}`}>
      <Section>
        <Text style={{ color: COLORS.muted, fontSize: "10px",
                       textTransform: "uppercase", letterSpacing: "0.2em" }}>
          {workspaceName} · {digestDate}
        </Text>
        <Heading style={{ color: COLORS.onSurface, fontSize: "22px",
                          fontStyle: "italic", fontFamily: "Georgia, serif" }}>
          Daily Digest
        </Heading>
        {/* Team summary */}
        <Section style={{ borderLeft: `2px solid ${COLORS.primary}`,
                          paddingLeft: "16px", marginBottom: "32px" }}>
          <Text style={{ color: COLORS.onSurface, fontStyle: "italic",
                         fontFamily: "Georgia, serif", lineHeight: "1.6" }}>
            {teamSummary}
          </Text>
        </Section>
        {/* Individual updates */}
        <Hr style={{ borderColor: COLORS.border }} />
        <Text style={{ color: COLORS.muted, fontSize: "10px",
                       textTransform: "uppercase", letterSpacing: "0.2em" }}>
          Individual Updates
        </Text>
        {items.map((item) => (
          <Section key={item.update_id} style={{ marginBottom: "16px",
                    padding: "12px", backgroundColor: COLORS.surface }}>
            <Text style={{ color: COLORS.primary, fontSize: "12px",
                           fontWeight: "600", margin: "0 0 4px" }}>
              {item.author_name}
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: "14px",
                           margin: "0", lineHeight: "1.5" }}>
              {item.summary_snapshot}
            </Text>
          </Section>
        ))}
      </Section>
    </EmailLayout>
  );
}
```

Rendering utility:
```python
# apps/api/app/lib/email.py — add render functions

from react_email import render as render_email

def render_digest_email(
    workspace_name: str,
    digest_date: str,
    team_summary: str,
    items: list[dict],
    unsubscribe_url: str,
) -> str:
    """Render DigestEmail template to HTML string."""
    html = render_email("digest_email", {
        "workspaceName": workspace_name,
        "digestDate": digest_date,
        "teamSummary": team_summary,
        "items": items,
        "unsubscribeUrl": unsubscribe_url,
    })
    return html


def render_invite_email(
    workspace_name: str,
    inviter_name: str,
    invite_url: str,
    expires_in_days: int = 7,
) -> str:
    """Render InviteEmail template to HTML string."""
    return render_email("invite_email", {
        "workspaceName": workspace_name,
        "inviterName": inviter_name,
        "inviteUrl": invite_url,
        "expiresInDays": expires_in_days,
    })
```

Update `send_invite_email` to use the template:
```python
html = render_invite_email(workspace_name, invited_by_name, invite_url)
params = {"from": ..., "to": [to_email], "subject": ..., "html": html}
await asyncio.to_thread(resend.Emails.send, params)
```

---

### Step 5: Celery Beat + Digest Task

```python
# apps/api/app/workers/celery_app.py — add Beat schedule

from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    "check-workspace-digests": {
        "task": "app.workers.tasks.check_and_send_digests",
        "schedule": crontab(minute="*/5"),
        # Runs every 5 minutes — checks if any workspace is due for a digest
        # Each workspace defines its own send time; this is just the polling interval
    },
}
```

```python
# apps/api/app/workers/tasks.py — add digest tasks

@celery_app.task(
    name="app.workers.tasks.check_and_send_digests",
    max_retries=1,
)  # type: ignore[misc]
def check_and_send_digests() -> None:
    """
    Polling task — runs every 5 minutes.
    Finds workspaces where digest is due and enqueues send_workspace_digest.
    """
    asyncio.run(_check_and_send_digests_async())


async def _check_and_send_digests_async() -> None:
    from zoneinfo import ZoneInfo
    from datetime import datetime
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.repositories.profile_repo import ProfileRepository

    async_session = async_sessionmaker(
        ProcessUpdateTask().db_engine, expire_on_commit=False
    )

    async with async_session() as db:
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        # Get all workspaces with digest enabled
        workspaces = await workspace_repo.get_digest_enabled_workspaces()

        for workspace in workspaces:
            # Resolve effective timezone
            tz_str = workspace.digest_timezone
            if not tz_str:
                owner_profile = await profile_repo.get_by_user_id(workspace.owner_id)
                tz_str = owner_profile.timezone if owner_profile else "UTC"

            try:
                tz = ZoneInfo(tz_str)
            except Exception:
                tz = ZoneInfo("UTC")

            now_local = datetime.now(tz)
            current_day = now_local.isoweekday()  # 1=Mon, 7=Sun
            current_time = now_local.strftime("%H:%M")

            # Check if today is a configured digest day
            configured_days = [
                int(d) for d in workspace.digest_days.split(",") if d.strip()
            ]
            if current_day not in configured_days:
                continue

            # Check if current time matches send time (within the 5-min polling window)
            send_time = workspace.digest_send_time  # "HH:MM"
            if current_time != send_time:
                continue

            # Check if digest already sent today
            today_str = now_local.strftime("%Y-%m-%d")
            existing = await digest_repo.get_for_workspace_date(
                workspace.id, today_str
            )
            if existing and existing.status in ("sent", "processing"):
                continue

            # Enqueue the digest task
            send_workspace_digest.delay(workspace.id, today_str)
            logger.info(
                "digest_enqueued",
                workspace_id=workspace.id,
                digest_date=today_str,
            )


@celery_app.task(
    bind=True,
    base=ProcessUpdateTask,
    name="app.workers.tasks.send_workspace_digest",
    max_retries=2,
    retry_backoff=True,
    acks_late=True,
)  # type: ignore[misc]
def send_workspace_digest(self, workspace_id: str, digest_date: str) -> None:
    asyncio.run(_send_workspace_digest_async(self, workspace_id, digest_date))


async def _send_workspace_digest_async(
    task: ProcessUpdateTask,
    workspace_id: str,
    digest_date: str,
) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.lib.claude import summarise
    from app.lib.email import render_digest_email, send_digest_email
    from app.repositories.digest_repo import DigestRepository
    from app.repositories.update_repo import UpdateRepository
    from app.repositories.workspace_repo import WorkspaceRepository
    from app.repositories.profile_repo import ProfileRepository
    from app.workers.prompts import build_digest_prompt

    async_session = async_sessionmaker(task.db_engine, expire_on_commit=False)

    async with async_session() as db:
        digest_repo = DigestRepository.from_session(db)
        update_repo = UpdateRepository.from_session(db)
        workspace_repo = WorkspaceRepository.from_session(db)
        profile_repo = ProfileRepository.from_session(db)

        workspace = await workspace_repo.get_by_id(workspace_id)
        if not workspace:
            return

        # Idempotency — don't re-create if already exists
        digest = await digest_repo.get_for_workspace_date(workspace_id, digest_date)
        if not digest:
            digest = await digest_repo.create(workspace_id, digest_date)

        if digest.status in ("sent", "processing"):
            return

        await digest_repo.update_status(digest, "processing")

        # Fetch all processed updates for the day
        updates = await update_repo.get_workspace_updates_for_date(
            workspace_id, digest_date
        )
        processed = [u for u in updates if u.status == "processed" and u.summary]

        if not processed:
            logger.info(
                "digest_skipped_no_updates",
                workspace_id=workspace_id,
                digest_date=digest_date,
            )
            await digest_repo.update_status(digest, "failed")
            return

        # Batch fetch profiles
        user_ids = list({u.user_id for u in processed})
        profiles = await workspace_repo.get_profiles_for_updates(user_ids)

        # Build digest prompt
        summaries_text = "\n\n".join(
            f"{profiles[u.user_id].full_name if u.user_id in profiles else 'A member'}: "
            f"{u.summary}"
            for u in processed
        )
        prompt = build_digest_prompt(
            workspace_name=workspace.name,
            digest_date=digest_date,
            summaries=summaries_text,
            custom_prompt=workspace.digest_prompt,
        )

        # Generate team summary with Claude (Sonnet for digest — higher quality)
        use_fallback = task.request.retries > 0
        team_summary = await summarise(prompt, use_fallback=not use_fallback)
        # Note: for digests, Sonnet is primary (better synthesis),
        # Haiku is fallback (cheaper on retry)

        # Store digest items
        items = [
            {
                "update_id": u.id,
                "author_name": profiles.get(u.user_id, None) and
                               profiles[u.user_id].full_name,
                "summary_snapshot": u.summary,
            }
            for u in processed
        ]
        await digest_repo.add_items(digest.id, items)
        await digest_repo.update_status(
            digest, "sent",
            summary=team_summary,
            update_count=len(processed),
        )

        # Render email and send
        members = await workspace_repo.get_workspace_members_with_profiles(workspace_id)
        member_emails = [
            p.email for _, p in members
            if p and p.email and p.email_notifications
        ]

        if member_emails and workspace.digest_enabled:
            items_for_email = [
                {"update_id": it["update_id"],
                 "author_name": it["author_name"],
                 "summary_snapshot": it["summary_snapshot"]}
                for it in items
            ]
            html = render_digest_email(
                workspace_name=workspace.name,
                digest_date=digest_date,
                team_summary=team_summary,
                items=items_for_email,
                unsubscribe_url=f"{settings.app_base_url}/settings/digest",
            )
            await send_digest_email(
                to_emails=member_emails,
                workspace_name=workspace.name,
                digest_date=digest_date,
                html=html,
            )
            from datetime import UTC
            await digest_repo.update_status(
                digest, "sent",
                email_sent_at=datetime.now(UTC),
            )

        logger.info(
            "digest_sent",
            workspace_id=workspace_id,
            digest_date=digest_date,
            update_count=len(processed),
        )
```

Add `send_digest_email` to `email.py`:
```python
async def send_digest_email(
    to_emails: list[str],
    workspace_name: str,
    digest_date: str,
    html: str,
) -> bool:
    try:
        params = {
            "from": f"SoarUp <{settings.resend_from_email}>",
            "to": to_emails,
            "subject": f"{workspace_name} standup digest — {digest_date}",
            "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.error("digest_email_failed", workspace=workspace_name, error=str(e))
        return False
```

Add `get_digest_enabled_workspaces` to `WorkspaceRepository`:
```python
async def get_digest_enabled_workspaces(self) -> list[Workspace]:
    result = await self.db.execute(
        select(Workspace).where(Workspace.digest_enabled == True)  # noqa: E712
    )
    return list(result.scalars().all())
```

Add `build_digest_prompt` to `prompts.py`:
```python
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

Update `docker-compose.yml` beat service command:
```yaml
beat:
  command: celery -A app.workers.celery_app beat --loglevel=info --scheduler celery.beat.PersistentScheduler
```

---

### Step 6: Digest Router

```python
# apps/api/app/routers/digests.py

router = APIRouter(prefix="/workspaces", tags=["digests"])


@router.get("/{workspace_id}/digests", status_code=200)
async def list_digests(
    workspace_id: str,
    cursor: str | None = None,
    limit: int = 20,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceMemberDep,
    db: DBSessionDep,
) -> Response:
    """List workspace digests with cursor-based pagination. Newest first."""
    ...


@router.get("/{workspace_id}/digests/{digest_id}", status_code=200)
async def get_digest(
    workspace_id: str,
    digest_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceMemberDep,
    db: DBSessionDep,
) -> Response:
    """Get a single digest with all DigestItems."""
    ...


@router.patch("/{workspace_id}/digest-settings", status_code=200)
async def update_digest_settings(
    workspace_id: str,
    request: UpdateDigestSettingsRequest,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    db: DBSessionDep,
) -> Response:
    """Update workspace digest configuration (admin+)."""
    ...


@router.post("/{workspace_id}/digests/preview", status_code=200)
async def preview_digest(
    workspace_id: str,
    api_version: ApiVersionDep,
    user_ctx: WorkspaceAdminDep,
    db: DBSessionDep,
) -> Response:
    """
    Generate a digest preview without sending it.
    Uses today's processed updates. Returns rendered HTML email.
    """
    ...
```

Register in `main.py`:
```python
from app.routers import digests
app.include_router(digests.router, prefix="/api/v1")
```

---

## Part 3: Frontend

### Step 1: Digest Query Keys + Hooks

```typescript
// apps/web/src/hooks/useDigests.ts

export const digestKeys = {
  all: (workspaceId: string) => ["digests", workspaceId] as const,
  list: (workspaceId: string) => ["digests", workspaceId, "list"] as const,
  detail: (workspaceId: string, digestId: string) =>
    ["digests", workspaceId, digestId] as const,
  settings: (workspaceId: string) =>
    ["digests", workspaceId, "settings"] as const,
};

export function useDigests(workspaceId: string | undefined) {
  const { tokens } = useAuth();
  return useInfiniteQuery({
    queryKey: digestKeys.list(workspaceId ?? ""),
    queryFn: ({ pageParam }) =>
      apiClient.get<DigestListResponse>(
        `/workspaces/${workspaceId}/digests`,
        tokens?.access_token,
        { cursor: pageParam, limit: "20" },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDigestSettings(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateDigestSettingsRequest) =>
      apiClient.patch(
        `/workspaces/${workspaceId}/digest-settings`,
        data,
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: digestKeys.settings(workspaceId) });
    },
  });
}

export function useDigestPreview(workspaceId: string) {
  const { tokens } = useAuth();
  return useMutation({
    mutationFn: () =>
      apiClient.post<DigestPreviewResponse>(
        `/workspaces/${workspaceId}/digests/preview`,
        {},
        tokens?.access_token,
      ),
  });
}
```

---

### Step 2: /history Page

```typescript
// apps/web/src/app/(app)/history/page.tsx

"use client";

// Uses useDigests (useInfiniteQuery)
// Renders DigestCard list with "Load more" button
// Each DigestCard is collapsible — shows team summary + expandable items
```

```typescript
// apps/web/src/components/domain/digests/digest-card.tsx

interface DigestCardProps {
  digest: DigestResponse;
  defaultExpanded?: boolean;
}

// Shows:
// - Date header: "Tuesday, 13 May" (label uppercase)
// - Update count badge: "4 updates"
// - Team summary (Newsreader italic, cyan left border)
// - "View updates ▾" collapsible toggle
// - Expanded: DigestItemRow per item (avatar + name + summary snippet)
```

```typescript
// apps/web/src/components/domain/digests/digest-item-row.tsx

// Compact row: author initials/avatar + name + summary snippet (2 lines max)
// Used inside DigestCard expanded section
```

---

### Step 3: /settings/digest Page

```typescript
// apps/web/src/app/(app)/settings/digest/page.tsx

// Digest settings form:
// - enable/disable toggle
// - time picker (HH:MM)
// - timezone selector (same Radix Select as onboarding)
// - days of week pill toggles
// - "Preview digest" button → calls useDigestPreview mutation
//   → opens DigestPreviewModal with iframe showing rendered HTML
// - "Save settings" button
```

```typescript
// apps/web/src/components/domain/digests/digest-preview-modal.tsx

// Modal with:
// - "Digest Preview" title
// - Sandboxed iframe rendering the HTML from preview endpoint
// - "Send now" ghost button (optional — calls POST /digests/preview? or a
//   new send endpoint — defer this to post-M6 if time constrained)
// - Close button
```

---

## Storybook Stories

```
src/stories/domain/digests/DigestCard.stories.tsx
  ← WithSummary (expanded + collapsed)
  ← NoUpdates (empty state)
  ← Loading skeleton

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

---

## Unit Tests

### Backend
```
tests/unit/test_digest_repo.py
  ← create, get_by_id, get_for_workspace_date, get_workspace_digests cursor pagination
  ← add_items, get_items, update_status

tests/unit/test_send_workspace_digest_task.py
  ← happy path: creates digest, generates summary, sends email
  ← no processed updates → status=failed, no email sent
  ← idempotency: skips if digest already sent
  ← custom digest_prompt used when set
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

### Frontend
```
hooks/useDigests.test.ts
  ← useDigests fetches with cursor pagination
  ← useUpdateDigestSettings invalidates settings cache on success
  ← useDigestPreview returns html

components/DigestCard.test.tsx
  ← renders date + summary
  ← expands items on toggle click
  ← collapsed by default

components/PendingMembersRow.test.tsx
  ← renders member avatars
  ← shows count when > 4 members

hooks/useProfileSettings.test.ts
  ← useUpdateProfile calls PATCH /auth/profile
  ← useUploadAvatar updates Zustand store avatar_url on success
  ← useDeleteAvatar sets avatar_url to null in Zustand store
```

---

## Known Tradeoffs

**1. Celery Beat polls every 5 minutes**
Digest send times are accurate to the nearest 5-minute window, not exact.
A workspace with send_time="09:00" may get its digest at 09:00 or 09:05
depending on when the poller last ran. Acceptable for a daily digest.

**2. Sonnet used for digests (not Haiku)**
Digests require higher-quality synthesis across multiple summaries.
Haiku is the fallback on retry. This costs more per digest than per-update
summarisation. Monitor Anthropic API spend — expected to be low at small
workspace counts.

**3. Profile.email still null for most users**
`send_digest_email` uses `p.email` from the profiles JOIN. Since Profile
has no email column (M5 tradeoff #2), most members will have `email=None`
and be excluded from digest emails until the email column is added.
This is a critical blocker for digest email delivery — see action item below.

⚠️ **Action required before digest emails work:**
Add `email: Mapped[str | None]` to the `Profile` model and populate it
on signup. This must be done in this milestone — without it the digest
email list will be empty for all workspaces.

**4. React Email in Python API**
`@react-email/render` is a JavaScript library. Using it from Python
requires running a Node.js subprocess or bundling the templates differently.

The cleanest approach: pre-render the templates to an HTML string in Node.js
and call a small Express microservice, OR move template rendering to the
Next.js frontend and have the preview endpoint call an internal Next.js
API route.

Simplest approach for M6: use a Python HTML template (Jinja2) that
replicates the Electric Atelier styling in plain HTML rather than React Email.
React Email can be added as a proper frontend-rendered solution post-M9.

Update the plan: replace `@react-email/components` with `jinja2` templating
in Python for M6. The visual output is identical — the difference is
maintainability when the design system changes.

```python
# apps/api/app/lib/email.py
from jinja2 import Environment, FileSystemLoader

_jinja = Environment(loader=FileSystemLoader("app/email_templates"))

def render_digest_email(...) -> str:
    tmpl = _jinja.get_template("digest_email.html")
    return tmpl.render(...)
```

Add `jinja2` to `requirements.txt` (already a common transitive dependency —
verify if already present before adding).

**5. Digest preview iframe**
`dangerouslySetInnerHTML` is blocked in Next.js for sandboxed content.
Use `<iframe srcDoc={html} sandbox="allow-same-origin" />` instead.
The `sandbox` attribute prevents script execution in the preview.

---

## Acceptance Criteria

```
[ ] PendingMembersRow shows on dashboard when team members haven't submitted
[ ] member.update_submitted event published and handled in useDashboardUpdates
[ ] Profile settings page — update name, timezone, upload/delete avatar
[ ] Avatar shown in sidebar + update cards after upload
[ ] Auto-accept invite after Step 1 — invited users skip workspace step
[ ] Invite code localStorage cleared after expiry window
[ ] Ownership transfer endpoint works
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
[ ] All scaling debt items actioned (broadcaster removed, LEFT JOIN, etc.)
[ ] Backend unit tests pass for digest repo + task + router
[ ] Frontend unit tests pass for DigestCard + useDigests + profile hooks
[ ] Storybook stories added for digest and profile components
[ ] CI passes on feature/milestone-6 branch
```

---

## Files To Create Summary

### Backend (apps/api/)
```
app/models/digest.py
app/schemas/digest.py
app/repositories/digest_repo.py
app/routers/digests.py
app/email_templates/layout.html      ← Jinja2 (not React Email — see tradeoff 4)
app/email_templates/invite_email.html
app/email_templates/digest_email.html
alembic/versions/YYYYMMDD_*_add_digests_and_digest_items.py
alembic/versions/YYYYMMDD_*_add_digest_config_to_workspaces.py
alembic/versions/YYYYMMDD_*_add_email_to_profiles.py
tests/unit/test_digest_repo.py
tests/unit/test_send_workspace_digest_task.py
tests/unit/test_check_and_send_digests_task.py
tests/unit/test_digest_router.py
tests/unit/test_email_templates.py
```

### Frontend (apps/web/src/)
```
hooks/useDigests.ts
hooks/useProfileSettings.ts
components/domain/digests/digest-card.tsx
components/domain/digests/digest-item-row.tsx
components/domain/digests/digest-preview-modal.tsx
components/domain/dashboard/pending-members-row.tsx
app/(app)/history/page.tsx
app/(app)/settings/profile/page.tsx
app/(app)/settings/digest/page.tsx
stories/domain/digests/DigestCard.stories.tsx
stories/domain/digests/DigestItemRow.stories.tsx
stories/domain/dashboard/PendingMembersRow.stories.tsx
stories/settings/ProfilePage.stories.tsx
stories/settings/DigestSettingsPage.stories.tsx
stories/pages/HistoryPage.stories.tsx
tests/unit/useDigests.test.ts
tests/unit/useProfileSettings.test.ts
tests/unit/DigestCard.test.tsx
tests/unit/PendingMembersRow.test.tsx
```

### Updated Files
```
apps/api/app/models/workspace.py          ← +digest_enabled, +digest_send_time,
                                             +digest_timezone, +digest_days,
                                             +timezone (workspace-level override)
apps/api/app/models/profile.py            ← +email column (CRITICAL for digest delivery)
apps/api/app/repositories/workspace_repo.py ← +get_digest_enabled_workspaces,
                                              INNER → LEFT OUTER JOIN
apps/api/app/services/update_service.py   ← +publish member.update_submitted,
                                             +inject redis
apps/api/app/workers/celery_app.py        ← +beat_schedule
apps/api/app/workers/tasks.py             ← +check_and_send_digests,
                                             +send_workspace_digest
apps/api/app/workers/prompts.py           ← +build_digest_prompt
apps/api/app/lib/email.py                 ← +asyncio.to_thread, +Jinja2 rendering,
                                             +send_digest_email, +Redis TTL
apps/api/app/routers/invites.py           ← OnboardedDep → WorkspaceAdminDep
apps/api/app/routers/members.py           ← +transfer-ownership endpoint
apps/api/app/routers/workspaces.py        ← prompts endpoint → WorkspaceOwnerDep
apps/api/app/main.py                      ← +digests router
apps/api/requirements.txt                 ← +jinja2, remove broadcaster[redis]
apps/web/src/middleware.ts                ← +/invite public comment
apps/web/src/stores/websocket-store.ts    ← sessionStorage persistence for lastEventId
apps/web/src/hooks/useWebSocket.ts        ← read lastEventId from sessionStorage on connect
apps/web/src/hooks/useDashboardUpdates.ts ← +member.update_submitted handler
apps/web/src/components/domain/auth/onboarding-form.tsx ← auto-accept on Step 1,
                                                           localStorage timestamp check
apps/web/src/components/layout/sidebar.tsx ← settings sub-links
```
