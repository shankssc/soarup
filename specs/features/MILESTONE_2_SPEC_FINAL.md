# SoarUp — Milestone 2: Text Update Submission

# Branch: feature/milestone-2

# Merged into: develop ✅

# Status: COMPLETE (frontend unit tests + E2E deferred to post-major-milestones)

---

## What This Milestone Delivers

A user who has completed onboarding can:

1. See a dashboard with their workspace context
2. Submit a text standup update for today
3. See their update displayed immediately on the dashboard
4. Be blocked from submitting a second update for the same day
5. Edit or delete their update for the current day

No AI processing yet — raw text stored and displayed as-is.
The Celery task enqueued by the API is a commented placeholder.

---

## Branch Strategy

```
develop
└── feature/milestone-2
    ├── feature/milestone-2/update-api          ← backend update CRUD
    ├── feature/milestone-2/dashboard-shell     ← app shell layout + hooks
    └── feature/milestone-2/update-submission   ← frontend update form + display

Merge order:
  feature/milestone-2/update-api → feature/milestone-2
  feature/milestone-2/dashboard-shell → feature/milestone-2
  feature/milestone-2/update-submission → feature/milestone-2
  feature/milestone-2 → develop (squash merge)
```

---

## Pre-flight Fixes Applied

```
apps/web/src/app/layout.tsx         ← removed dark:text-on-surface-dark + dark:bg-[#0e0e10]
apps/web/src/app/icons.css          ← deleted entirely
apps/api/app/api/_utils.py          ← HTTP_413_REQUEST_ENTITY_TOO_LARGE → HTTP_413_CONTENT_TOO_LARGE
apps/api/app/utils/api_versioning.py ← removed duplicate class Config, kept model_config = ConfigDict(frozen=True)
apps/api/app/schemas/auth.py        ← UserResponse class Config → ConfigDict(from_attributes=True)
apps/api/app/lib/supabase.py        ← supabase_jwt_secret → supabase_anon_key for client init
```

---

## Existing Stack Reference

### Frontend

- Next.js 14 App Router, TypeScript
- Tailwind CSS + CSS variable token system (Electric Atelier design system)
- Radix UI primitives, CVA, Zustand + persist, React Hook Form + Zod
- **@tanstack/react-query v5** — used for ALL data fetching
- Supabase SSR for session cookie management
- Vitest + React Testing Library for unit tests (deferred)
- Playwright for E2E tests (deferred)

### Backend

- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local)
- Alembic for migrations
- Structlog for logging
- Redis + Celery (worker exists, no tasks yet)
- pytest + pytest-asyncio for tests

### Design tokens (Tailwind classes — all switch automatically via CSS vars)

```
Backgrounds:  bg-background, bg-surface, bg-surface-high, bg-surface-highest
              bg-container, bg-container-high, bg-surface-lowest
Text:         text-on-surface, text-on-surface-variant, text-outline
Accents:      text-primary, bg-primary, bg-primary-container, text-primary-on-container
              text-secondary, text-error
Borders:      border-outline-variant, border-outline
Shadows:      shadow-electric, shadow-electric-sm
```

### Auth pattern

```typescript
// Get token for API calls
const { tokens, user } = useAuth();
tokens?.access_token; // pass as Bearer token to apiClient

// Check auth state
isAuthenticated; // user + tokens + not expired
needsOnboarding; // isAuthenticated && !user.is_onboarded
```

---

## Backend — What Was Built

### Step 1: Database Model

```python
# apps/api/app/models/update.py

import uuid
from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Update(Base):
    """
    A single standup update submitted by a workspace member.
    Text mode for Milestone 2 — voice mode added in Milestone 4.
    """
    __tablename__ = "updates"

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "user_id", "update_date",
            name="uq_updates_user_workspace_date",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_new_uuid)
    workspace_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(String(10), default="text")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    update_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Update(id='{self.id}', user_id='{self.user_id}', date='{self.update_date}')>"
```

Note: `UniqueConstraint` declared in `__table_args__` — autogenerate picks it up correctly.

Added to `conftest.py`:

```python
import app.models.update  # noqa: F401
```

Added to `alembic/env.py`:

```python
from app.models.update import Update
```

Also added `compare_server_default=False` to both `run_migrations_offline` and
`run_migrations_online` context.configure calls to prevent autogenerate from
touching server defaults on existing tables.

Migration: `fdafb0962976_add_updates_table.py`

- `is_deleted` has `server_default=sa.text('false')` inline in `create_table`
- Unique constraint `uq_updates_user_workspace_date` present
- No `alter_column` calls on existing tables

---

### Step 2: Schemas

```python
# apps/api/app/schemas/update.py

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class SubmitUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)
    mode: str = Field(default="text")
    update_date: str = Field(..., description="ISO date string YYYY-MM-DD")


class UpdateUpdateRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


class UpdateResponse(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    content: str
    mode: str
    status: str
    summary: str | None
    update_date: str
    created_at: datetime
    updated_at: datetime
    author_name: str | None = None
    author_avatar_url: str | None = None
    model_config = ConfigDict(from_attributes=True)


class UpdateListResponse(BaseModel):
    updates: list[UpdateResponse]
    total: int
```

---

### Step 3: Repository

```python
# apps/api/app/repositories/update_repo.py

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.update import Update


class UpdateRepository:
    """CRUD operations for standup updates. All queries exclude soft-deleted records."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> "UpdateRepository":
        return cls(db)

    async def create(self, workspace_id, user_id, content, update_date, mode="text") -> Update:
        """Insert a new update record and return it refreshed from DB."""
        update = Update(
            workspace_id=workspace_id, user_id=user_id,
            content=content, update_date=update_date, mode=mode, status="pending",
        )
        self.db.add(update)
        await self.db.commit()
        await self.db.refresh(update)
        return update

    async def get_by_id(self, update_id: str) -> Update | None:
        """Fetch a single update by ID, or None if not found or soft-deleted."""
        result = await self.db.execute(
            select(Update).where(
                Update.id == update_id,
                Update.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_for_user_on_date(self, workspace_id, user_id, update_date) -> Update | None:
        """Return the user's update for a given workspace + date, or None if not submitted."""
        result = await self.db.execute(
            select(Update).where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.user_id == user_id,
                    Update.update_date == update_date,
                    Update.is_deleted == False,  # noqa: E712
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_workspace_updates_for_date(self, workspace_id, update_date) -> list[Update]:
        """Return all non-deleted updates for a workspace on a given date, ordered by created_at asc."""
        result = await self.db.execute(
            select(Update).where(
                and_(
                    Update.workspace_id == workspace_id,
                    Update.update_date == update_date,
                    Update.is_deleted == False,  # noqa: E712
                )
            ).order_by(Update.created_at.asc())
        )
        return list(result.scalars().all())

    async def update_content(self, update: Update, content: str) -> Update:
        """Overwrite update content in place and return the refreshed record."""
        update.content = content
        await self.db.commit()
        await self.db.refresh(update)
        return update

    async def soft_delete(self, update: Update) -> None:
        """Mark update as deleted without removing the row."""
        update.is_deleted = True
        await self.db.commit()
```

Note: `# noqa: E712` on `== False` comparisons is load-bearing — SQLAlchemy requires
`==` for ORM column comparisons to generate correct SQL. `is False` would not work.

---

### Step 4: Service

```python
# apps/api/app/services/update_service.py

from typing import Any
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.update_repo import UpdateRepository
from app.repositories.profile_repo import ProfileRepository
from app.schemas.update import (
    SubmitUpdateRequest, UpdateUpdateRequest, UpdateResponse, UpdateListResponse
)

logger = structlog.get_logger(__name__)


class UpdateError(Exception):
    def __init__(self, error_code: str, message: str, details: dict[str, Any] | None = None):
        self.error_code = error_code
        self.message = message
        self.details = details
        super().__init__(message)


class UpdateService:
    """
    Business logic for standup update operations.
    Enforces ownership, duplicate submission rules, and response shaping.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._update_repo: UpdateRepository | None = None
        self._profile_repo: ProfileRepository | None = None

    def _get_update_repo(self) -> UpdateRepository:
        if self._update_repo is None:
            self._update_repo = UpdateRepository.from_session(self.db)
        return self._update_repo

    def _get_profile_repo(self) -> ProfileRepository:
        if self._profile_repo is None:
            self._profile_repo = ProfileRepository.from_session(self.db)
        return self._profile_repo

    async def submit_update(
        self, workspace_id: str, user_id: str, request: SubmitUpdateRequest
    ) -> UpdateResponse:
        """
        Create a new update for today. Raises UpdateError if one already exists
        for this user + workspace + date combination.
        """
        repo = self._get_update_repo()
        existing = await repo.get_for_user_on_date(workspace_id, user_id, request.update_date)
        if existing:
            raise UpdateError(
                "update_already_exists",
                "You have already submitted an update for today.",
                {"existing_id": existing.id},
            )
        update = await repo.create(
            workspace_id=workspace_id, user_id=user_id,
            content=request.content, update_date=request.update_date, mode=request.mode,
        )
        # Milestone 3: process_update.delay(update.id)
        logger.info("update_submitted", update_id=update.id,
                    workspace_id=workspace_id, user_id=user_id)
        return await self._to_response(update)

    async def get_workspace_updates(
        self, workspace_id: str, update_date: str
    ) -> UpdateListResponse:
        """Return all updates for a workspace on a given date."""
        updates = await self._get_update_repo().get_workspace_updates_for_date(
            workspace_id, update_date
        )
        responses = [await self._to_response(u) for u in updates]
        return UpdateListResponse(updates=responses, total=len(responses))

    async def edit_update(
        self, workspace_id: str, user_id: str, update_id: str, request: UpdateUpdateRequest
    ) -> UpdateResponse:
        """
        Edit an existing update. Raises UpdateError if not found,
        wrong workspace, or requester is not the owner.
        """
        repo = self._get_update_repo()
        update = await repo.get_by_id(update_id)
        if not update or update.workspace_id != workspace_id:
            raise UpdateError("update_not_found", "Update not found.")
        if update.user_id != user_id:
            raise UpdateError("unauthorized", "You can only edit your own updates.")
        updated = await repo.update_content(update, request.content)
        return await self._to_response(updated)

    async def delete_update(
        self, workspace_id: str, user_id: str, update_id: str
    ) -> None:
        """
        Soft-delete an update. Raises UpdateError if not found,
        wrong workspace, or requester is not the owner.
        """
        repo = self._get_update_repo()
        update = await repo.get_by_id(update_id)
        if not update or update.workspace_id != workspace_id:
            raise UpdateError("update_not_found", "Update not found.")
        if update.user_id != user_id:
            raise UpdateError("unauthorized", "You can only delete your own updates.")
        await repo.soft_delete(update)
        logger.info("update_deleted", update_id=update_id, user_id=user_id)

    async def _to_response(self, update: Any) -> UpdateResponse:
        """
        Shape an Update ORM object into an UpdateResponse.
        Makes one profile query per call — acceptable N+1 for M2,
        batch fetch added in Milestone 5.
        """
        profile = await self._get_profile_repo().get_by_user_id(update.user_id)
        return UpdateResponse(
            id=update.id, workspace_id=update.workspace_id, user_id=update.user_id,
            content=update.content, mode=update.mode, status=update.status,
            summary=update.summary, update_date=update.update_date,
            created_at=update.created_at, updated_at=update.updated_at,
            author_name=profile.full_name if profile else None,
            author_avatar_url=profile.avatar_url if profile else None,
        )
```

---

### Step 5: Router

`handle_update_error` added to `apps/api/app/api/_utils.py` for consistency
with `handle_auth_error` and `handle_profile_error`:

```python
def handle_update_error(
    e: Exception,
    api_version: ApiVersionInfo | None = None,
) -> JSONResponse:
    from app.services.update_service import UpdateError

    if not isinstance(e, UpdateError):
        return create_error_response(
            "internal_error", "An unexpected error occurred",
            status.HTTP_500_INTERNAL_SERVER_ERROR, api_version=api_version,
        )

    status_map = {
        "update_already_exists": status.HTTP_409_CONFLICT,
        "update_not_found":      status.HTTP_404_NOT_FOUND,
        "unauthorized":          status.HTTP_403_FORBIDDEN,
    }

    return create_error_response(
        error_code=e.error_code, message=e.message,
        status_code=status_map.get(e.error_code, status.HTTP_400_BAD_REQUEST),
        details=e.details, api_version=api_version,
    )
```

```python
# apps/api/app/routers/updates.py

import structlog
from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.api import (
    ApiVersionDep, DBSessionDep, OnboardedDep,
    create_error_response, create_success_response, handle_update_error,
)
from app.schemas.update import SubmitUpdateRequest, UpdateUpdateRequest
from app.services.update_service import UpdateError, UpdateService

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/workspaces", tags=["updates"])


def get_update_service(db: DBSessionDep) -> UpdateService:
    return UpdateService(db)


@router.post("/{workspace_id}/updates", status_code=202)
async def submit_update(
    workspace_id: str, request: SubmitUpdateRequest,
    api_version: ApiVersionDep, user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Submit a new standup update. Returns 409 if already submitted today."""
    try:
        result = await service.submit_update(workspace_id, user_ctx["user_id"], request)
        return create_success_response(result, status_code=202, api_version=api_version)
    except UpdateError as e:
        return handle_update_error(e, api_version)


@router.get("/{workspace_id}/updates", status_code=200)
async def get_updates(
    workspace_id: str, update_date: str,
    api_version: ApiVersionDep, user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Fetch all updates for a workspace on a given date."""
    try:
        result = await service.get_workspace_updates(workspace_id, update_date)
        return create_success_response(result, api_version=api_version)
    except Exception as e:
        logger.exception("get_updates_error", workspace_id=workspace_id, error=str(e))
        return create_error_response(
            "internal_error", "Failed to retrieve updates", 500, api_version=api_version,
        )


@router.patch("/{workspace_id}/updates/{update_id}", status_code=200)
async def edit_update(
    workspace_id: str, update_id: str, request: UpdateUpdateRequest,
    api_version: ApiVersionDep, user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Edit an existing update. Only the owner can edit."""
    try:
        result = await service.edit_update(workspace_id, user_ctx["user_id"], update_id, request)
        return create_success_response(result, api_version=api_version)
    except UpdateError as e:
        return handle_update_error(e, api_version)


@router.delete("/{workspace_id}/updates/{update_id}", status_code=204)
async def delete_update(
    workspace_id: str, update_id: str,
    api_version: ApiVersionDep, user_ctx: OnboardedDep,
    service: UpdateService = Depends(get_update_service),
) -> Response:
    """Soft-delete an update. Only the owner can delete."""
    try:
        await service.delete_update(workspace_id, user_ctx["user_id"], update_id)
    except UpdateError as e:
        return handle_update_error(e, api_version)
    return Response(status_code=204)
```

Registered in `main.py`:

```python
from app.routers import auth, health, workspaces, updates
app.include_router(updates.router, prefix="/api/v1")
```

---

## Frontend — What Was Built

### Query Provider

```tsx
// apps/web/src/components/providers/query-provider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

Added to `apps/web/src/app/layout.tsx`:

```tsx
<ThemeProvider>
  <QueryProvider>{children}</QueryProvider>
</ThemeProvider>
```

`QueryProvider` sits inside `ThemeProvider` — theme has no React Query
dependency but query-driven components may eventually read the theme.

---

### General API Client

```typescript
// apps/web/src/lib/api/client.ts

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// Internal request function — not exported
async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; params?: Record<string, string> } = {},
): Promise<T> { ... }

export const apiClient = {
  get:    <T>(path: string, token?: string, params?: Record<string, string>) => ...,
  post:   <T>(path: string, body: unknown, token?: string) => ...,
  patch:  <T>(path: string, body: unknown, token?: string) => ...,
  delete: <T>(path: string, token?: string) => ...,
};
```

Global 403 onboarding redirect guard built into `request()` — any 403
response with "onboarding" in the message redirects to `/onboarding`.

---

### React Query Hooks

```typescript
// apps/web/src/hooks/useWorkspace.ts
// Returns WorkspaceResponse | null — first workspace from /workspaces/me
// staleTime: 5 minutes — workspace rarely changes
// enabled: only when access_token present

// apps/web/src/hooks/useUpdates.ts
// Exports: useUpdates, useSubmitUpdate, useEditUpdate, useDeleteUpdate
// All mutations do optimistic cache updates via queryClient.setQueryData
// Cache key: ['updates', workspaceId, updateDate]
// useUpdates staleTime: 30s — updates are relatively fresh
```

Key design decisions:

- `useDeleteUpdate` passes `updateDate` as a mutation parameter (not derived
  inside hook) because the update may already be removed from cache by the
  time `onSuccess` fires
- `useSubmitUpdate` uses `mutateAsync` in the dashboard page so try/catch
  can handle errors in the form component
- All four mutations write directly to the same cache key that `useUpdates`
  reads — no invalidation or refetch needed

---

### App Shell Layout

```
apps/web/src/app/(app)/layout.tsx       ← server component, renders AppShell
apps/web/src/components/layout/
├── app-shell.tsx                        ← client component, auth guard
├── sidebar.tsx                          ← desktop + mobile nav
└── top-bar.tsx                          ← page title + ThemeToggle + avatar
```

**Architecture decision (differs from spec):**
Auth guard is client-side in `AppShell` via `useAuth()`, not server-side
via Supabase SSR `getSession()`. `app/(app)/layout.tsx` is a thin server
component that just renders `<AppShell>`. Rationale: auth state lives in
Zustand (localStorage), not Supabase cookies, so server-side reads are
unreliable without explicit cookie sync.

```tsx
// app/(app)/layout.tsx — thin server component
import { AppShell } from "@/components/layout/app-shell";
export default function AppLayout({ children }) {
  return <AppShell>{children}</AppShell>;
}
```

`AppShell` redirects to `/login` if `!isAuthenticated` and to `/onboarding`
if `needsOnboarding`, both via `useEffect` + `router.replace()`.

Sidebar nav links:

```tsx
const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
```

Note: icon used is `dashboard` not `grid_view` as originally specced.

All `<img>` tags replaced with `next/image` `<Image />` throughout layout
components. `next.config.mjs` has `images: { unoptimized: true }` for
Cloudflare Pages — no `remotePatterns` config needed.

---

### Dashboard Page

```tsx
// apps/web/src/app/(app)/dashboard/page.tsx
"use client";
```

Key behaviours:

- `hasSubmittedToday` derived from `updates.some((u) => u.user_id === user?.id)`
- Form hidden once user has submitted — no second submission possible from UI
- `mutateAsync` used (not `mutate`) so form's try/catch can surface API errors
- Skeleton loading state shown while `isLoading` for updates query
- Submit CTA shown below existing updates if `!hasSubmittedToday && !showForm && updates.length > 0`

---

### Domain Components

```
apps/web/src/components/domain/updates/
├── empty-state.tsx
├── update-form.tsx
└── update-card.tsx
```

**`empty-state.tsx`** props:

```typescript
interface EmptyStateProps {
  onSubmitClick: () => void;
}
```

Uses `.dot-grid` CSS class from `globals.css` for the illustration.
`asymmetric` Button variant for the CTA.

**`update-form.tsx`** props (differs from spec):

```typescript
interface UpdateFormProps {
  onSubmit: (content: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean; // not isLoading
  // error state is internal, not a prop
}
```

- Auto-focuses textarea on mount
- Cmd/Ctrl+Enter submits, Escape cancels
- Character counter: `{charsLeft} / {MAX_CHARS}` format
- Submit disabled when empty or over 1000 chars

**`update-card.tsx`** props (differs from spec):

```typescript
interface UpdateCardProps {
  update: UpdateResponse;
  currentUserId: string; // not isOwn boolean — derived internally
  onEdit: (updateId: string, content: string) => Promise<void>;
  onDelete: (updateId: string, updateDate: string) => Promise<void>;
  // isEditing, isSaving, isDeleting all managed internally
}
```

Card is fully self-contained — edit mode, saving state, and error state
all managed as internal state. Parent only provides callbacks and data.

Status badge mapping:

```typescript
const STATUS_CONFIG = {
  pending: {
    label: "Processing...",
    color: "text-amber-400",
    dot: "bg-amber-400",
  },
  processing: {
    label: "Processing...",
    color: "text-amber-400",
    dot: "bg-amber-400",
  },
  processed: {
    label: "Summarised",
    color: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  failed: { label: "Failed", color: "text-error", dot: "bg-error" },
};
```

Three-dot menu (`CardMenu`) is a self-contained dropdown component within
`update-card.tsx` — closes on outside click via `mousedown` event listener.

---

### Storybook Stories

```
apps/web/src/stories/domain/
├── EmptyState.stories.tsx
├── UpdateForm.stories.tsx
└── UpdateCard.stories.tsx
```

All stories follow the four-story standard: Dark, Light, MobileDark, MobileLight.
Additional stories: `Submitting` (UpdateForm), `MultipleCards` (UpdateCard),
`OwnUpdate` vs `OtherUserUpdate` (UpdateCard), `OwnUpdateProcessed` (UpdateCard).

`DashboardShell` decorator mimics the dashboard canvas container without
requiring full `AppShell` (which needs router + workspace query mocks).

`withAuthStore()` decorator seeds Zustand store with `MOCK_USER` +
`MOCK_TOKENS` and cleans up on unmount.

---

## Known Tradeoffs (from spec, confirmed as-built)

**1. `update_date` sent by client**
The date is sent in the user's local timezone. A malicious client could
backdate submissions. Server-side date validation using stored timezone
deferred to Milestone 3.

**2. `_to_response` makes N+1 profile queries**
Fine for Milestone 2 (one user, one update per day).
Add batch profile fetch in Milestone 5 for team views.

**3. No real-time updates**
New updates from teammates don't appear until page refresh.
WebSocket delivery is Milestone 3.

**4. Status permanently "pending"**
No Celery task wired yet. "Processing..." badge in UI is correct and
intentional. Backfill strategy needed when Celery task goes live in M3.

**5. Workspace fetched client-side**
Slight loading flash on first render. SSR data fetching added in Milestone 5.

**6. Auth guard is client-side**
`AppShell` redirects via `useEffect` + `router.replace()`, not server-side
`redirect()`. Small flash of loading spinner possible before redirect fires.
Server-side guard deferred to Milestone 5 alongside SSR data fetching.

Full scaling analysis: `docs/specs/scaling/api/updates.md`

---

## Testing — What Was Done

### Backend Unit Tests ✅

```
tests/unit/test_update_repo.py      ← all six repo methods + duplicate constraint
tests/unit/test_update_service.py   ← submit (success + duplicate), edit/delete
                                       (success + 403 + 404), get_workspace_updates
tests/unit/test_update_router.py    ← 202, 409, 200, 204, 401, 403, 404
                                       across all four endpoints
```

### Frontend Unit Tests — DEFERRED

Deferred until major milestones are complete. Spec document available at:
`docs/specs/testing/MILESTONE_2_FRONTEND_TESTING_SPEC.md`

### E2E Tests — DEFERRED

Deferred with frontend unit tests. 10-step happy path documented in spec.

---

## Acceptance Criteria

```
[x] Dashboard renders with workspace name in sidebar
[x] Authenticated onboarded users can reach /dashboard
[x] Non-onboarded users redirected to /onboarding (client-side)
[x] Unauthenticated users redirected to /login (client-side)
[x] Empty state shown when no updates exist for today
[x] Update form expands on CTA click
[x] User can submit a text update (max 1000 chars)
[x] Submitted update appears as a card immediately (optimistic cache update)
[x] User cannot submit a second update for today (UI hides form + API returns 409)
[x] User can edit their own update
[x] User can delete their own update
[x] User cannot edit or delete another user's update (403 from API)
[x] All update endpoints require OnboardedDep (403 if not onboarded)
[x] React Query cache updated optimistically on submit/edit/delete
[x] Backend unit tests pass for update repo + service + router
[ ] Frontend unit tests pass for UpdateForm + UpdateCard + hooks — DEFERRED
[x] CI passes on feature/milestone-2 branch
```

---

## Files Created — Summary

### Backend (apps/api/)

```
app/models/update.py                              ✅
app/schemas/update.py                             ✅
app/repositories/update_repo.py                   ✅
app/services/update_service.py                    ✅
app/routers/updates.py                            ✅
app/api/_utils.py                                 ✅ (handle_update_error added)
alembic/versions/fdafb0962976_add_updates_table.py ✅
tests/unit/test_update_repo.py                    ✅
tests/unit/test_update_service.py                 ✅
tests/unit/test_update_router.py                  ✅
```

### Frontend (apps/web/src/)

```
lib/api/client.ts                                 ✅
hooks/useWorkspace.ts                             ✅
hooks/useUpdates.ts                               ✅
components/providers/query-provider.tsx           ✅
app/(app)/layout.tsx                              ✅
components/layout/app-shell.tsx                   ✅
components/layout/sidebar.tsx                     ✅
components/layout/top-bar.tsx                     ✅
components/domain/updates/empty-state.tsx         ✅
components/domain/updates/update-form.tsx         ✅
components/domain/updates/update-card.tsx         ✅
app/(app)/dashboard/page.tsx                      ✅
stories/domain/EmptyState.stories.tsx             ✅
stories/domain/UpdateForm.stories.tsx             ✅
stories/domain/UpdateCard.stories.tsx             ✅
tests/e2e/submit-update.spec.ts                   DEFERRED
```

### Docs

```
docs/specs/scaling/api/updates.md                 ✅
docs/specs/testing/MILESTONE_2_FRONTEND_TESTING_SPEC.md ✅
docs/specs/testing/MILESTONE_2_BACKEND_TESTING_SPEC.md  ✅
```
