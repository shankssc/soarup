# SoarUp — Onboarding Feature Spec

# Branch: feature/auth/onboarding

# Merges into: feature/auth → develop

---

## Overview

Onboarding is the bridge between signup and the dashboard. A user who
completes signup has a Supabase Auth account and a PostgreSQL profile
record with `is_onboarded = false`. Onboarding collects the remaining
required data and creates their first workspace, then sets
`is_onboarded = true` and redirects to the dashboard.

---

## Google Stitch Prompt

```
Design a clean, minimal multi-step onboarding flow for a developer productivity
SaaS called SoarUp. The design system is called Electric Atelier:

Colors (dark mode defaults):
- Background: #0e0e10 (near black)
- Surface: #0e0e10, Surface High: #1f1f22, Surface Highest: #262528
- Primary accent: #53ddfc (electric cyan) — used for CTAs, focus rings, active states
- Secondary accent: #ec63ff (digital magenta) — used sparingly for highlights
- On-surface text: #f9f5f8 (light), muted: #adaaad
- Borders: outline-variant #48474a, outline #767577
- Error: #ff716c

Colors (light mode):
- Background: #ebfdfc (pale teal), Surface Lowest: #ffffff (white card)
- Primary accent: #00687a (dark teal) — CTAs readable on light bg
- On-surface text: #0e1e1e (dark), muted: #3d494c

Typography:
- Headlines: Newsreader (serif, italic) — used for page titles only
- UI/labels/buttons: Space Grotesk (sans-serif)
- Button text: uppercase, tracked, bold
- Field labels: 10px uppercase tracked (Space Grotesk)

Design rules:
- 0px border radius everywhere except pills (9999px) and feature cards (4px)
- Sharp corners are intentional — part of the brand
- Primary CTA buttons use asymmetric radius: top-left/bottom-right 1.5rem,
  top-right/bottom-left 0.5rem
- Input fields use bottom-border only (no full border), cyan animated underline on focus
- No shadows except subtle electric glow on primary buttons

Step 1 — Profile Setup:
- Page title: "Set up your profile" (Newsreader italic, large)
- Subtitle: "TELL US A BIT ABOUT YOURSELF" (Space Grotesk, 10px uppercase tracked)
- Step progress bar at top: two segments, first active (cyan), second inactive (muted)
- Step counter: "1 / 2" right-aligned next to progress bar
- Fields: Display name (text input), Timezone (searchable dropdown with region groups),
  Default update mode (text/voice toggle — two buttons side by side)
- CTA: "Continue →" (primary asymmetric button, full width, cyan fill)

Step 2 — Workspace:
- Page title: "Create your workspace"
- Subtitle: "WHERE YOUR TEAM'S UPDATES WILL LIVE"
- Step progress bar: both segments active
- Two options side by side: "Create workspace" (primary) | "Join with invite" (secondary)
- Create path: Workspace name input + slug input (auto-generated, editable)
  Slug preview: "soarup.app/join/[slug]" shown below slug input
- Join path: Single invite code input
- CTA: "Create workspace →" or "Join workspace →"

General layout:
- Full height page, same header as auth pages (SoarUp wordmark left, theme toggle right)
- Content centered, max-width 512px
- White card on light mode, dark container card on dark mode
- Consistent spacing with auth pages
```

---

## Branch Strategy

```
feature/auth (current)
└── feature/auth/onboarding  ← create this branch
    ├── Backend: workspace endpoints
    ├── Backend: require_onboarded dependency
    ├── Frontend: onboarding form wired to real APIs
    ├── Frontend: onboarding stories
    └── Tests: unit + integration for workspace + onboarding

Merge order:
  feature/auth/onboarding → feature/auth → develop
```

---

## What Already Exists

### Frontend

- `src/app/onboarding/page.tsx` — page shell with session guard ✅
- `src/components/domain/auth/onboarding-form.tsx` — multi-step form UI ✅
  - Step 1: display name + timezone (full IANA list with search) + update mode toggle
  - Step 2: workspace name + slug (auto-generated) — currently placeholder
- `src/components/ui/select.tsx` — Radix Select primitive + SelectField ✅
- `src/lib/utils/timezones.ts` — full IANA list, detectBrowserTimezone, searchTimezones ✅
- `@radix-ui/react-select` needs to be installed ← TODO

### Backend

- `PATCH /api/v1/auth/profile` — updates full_name, timezone, is_onboarded ✅
- `profiles.is_onboarded` column + migration ✅
- `ProfileResponse` includes `is_onboarded` ✅

### What's Missing

- `POST /api/v1/workspaces` — create workspace endpoint ← BUILD FIRST
- `POST /api/v1/workspaces/join` — join via invite code ← BUILD
- `require_onboarded` FastAPI dependency ← BUILD
- Frontend workspace step wired to real API ← WIRE AFTER BACKEND
- Middleware update for onboarding redirect logic ← UPDATE

---

## Backend — Build Order

### Step 1: Data Model

New table: `workspaces`

```python
class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str]           # UUID, PK
    name: Mapped[str]         # max 100 chars
    slug: Mapped[str]         # unique, max 50, lowercase alphanumeric + hyphens
    owner_id: Mapped[str]     # FK → profiles.id
    plan: Mapped[str]         # "free" default
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

New table: `workspace_members`

```python
class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    workspace_id: Mapped[str]  # FK → workspaces.id
    user_id: Mapped[str]       # FK → profiles.id
    role: Mapped[str]          # "owner" | "admin" | "member"
    joined_at: Mapped[datetime]
    # PK: (workspace_id, user_id)
```

Alembic migration:

```bash
docker compose exec api alembic revision --autogenerate -m "add_workspaces_and_workspace_members"
docker compose exec api alembic upgrade head
```

### Step 2: Schemas

```python
# apps/api/app/schemas/workspace.py

class CreateWorkspaceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50,
                      pattern=r'^[a-z0-9-]+$')

class JoinWorkspaceRequest(BaseModel):
    invite_code: str = Field(..., min_length=1)

class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    owner_id: str
    plan: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class WorkspaceMemberResponse(BaseModel):
    workspace_id: str
    user_id: str
    role: str
    joined_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

### Step 3: Repository

```python
# apps/api/app/repositories/workspace_repo.py

class WorkspaceRepository:
    async def create(self, owner_id, name, slug) -> Workspace
    async def get_by_id(self, workspace_id) -> Workspace | None
    async def get_by_slug(self, slug) -> Workspace | None
    async def slug_exists(self, slug) -> bool
    async def add_member(self, workspace_id, user_id, role) -> WorkspaceMember
    async def get_member(self, workspace_id, user_id) -> WorkspaceMember | None
    async def get_user_workspaces(self, user_id) -> list[Workspace]
```

### Step 4: Service

```python
# apps/api/app/services/workspace_service.py

class WorkspaceError(Exception):
    error_code: str
    message: str

class WorkspaceService:
    async def create_workspace(
        self,
        user_id: str,
        request: CreateWorkspaceRequest
    ) -> WorkspaceResponse:
        # 1. Check slug uniqueness
        # 2. Create workspace
        # 3. Add creator as owner member
        # 4. Set user is_onboarded = True via ProfileRepository
        # 5. Return WorkspaceResponse

    async def join_workspace(
        self,
        user_id: str,
        invite_code: str
    ) -> WorkspaceResponse:
        # 1. Validate invite code (future: InviteRepository)
        # 2. Add user as member
        # 3. Set user is_onboarded = True
        # 4. Return WorkspaceResponse
```

Error codes:

```python
"slug_already_taken"    → 409
"invalid_invite_code"   → 400
"already_member"        → 409
"workspace_not_found"   → 404
```

### Step 5: Router

```python
# apps/api/app/routers/workspaces.py

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

@router.post("/", response_model=WorkspaceResponse, status_code=201)
async def create_workspace(
    request: CreateWorkspaceRequest,
    user_ctx: AuthDep,
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    ...

@router.post("/join", response_model=WorkspaceResponse, status_code=200)
async def join_workspace(
    request: JoinWorkspaceRequest,
    user_ctx: AuthDep,
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    ...

@router.get("/me", response_model=list[WorkspaceResponse], status_code=200)
async def get_my_workspaces(
    user_ctx: AuthDep,
    service: WorkspaceService = Depends(get_workspace_service),
) -> Response:
    # Returns all workspaces the authenticated user belongs to
    ...
```

### Step 6: require_onboarded dependency

```python
# apps/api/app/api/dependencies.py — add this

async def require_onboarded(
    user_ctx: dict[str, str] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, str]:
    """
    Extends get_current_user — additionally checks that the user has
    completed onboarding before accessing app routes.
    Returns 403 if is_onboarded is False.
    """
    profile_repo = ProfileRepository.from_session(db)
    profile = await profile_repo.get_by_user_id(user_ctx["user_id"])

    if not profile or not profile.is_onboarded:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Onboarding required before accessing this resource",
        )
    return user_ctx

# Add type alias
OnboardedDep = Annotated[dict[str, str], Depends(require_onboarded)]
```

Export from `app/api/__init__.py`:

```python
from app.api.dependencies import OnboardedDep
```

---

## Frontend — Wire Onboarding Form

### Changes to onboarding-form.tsx

**Step 1 — Profile (already built, minor updates):**

- Remove `default_update_mode` field — deferred to settings page
- Pre-fill `full_name` from `useAuth().user.full_name` if set (OAuth users)
- On submit: call `PATCH /auth/profile` with `{ full_name, timezone }`
- On success: advance to step 2

**Step 2 — Workspace (replace placeholder):**

- Add tab/toggle: "Create workspace" | "Join with invite code"
- Create path: name + slug inputs, slug auto-generates from name
- Join path: single invite code input
- On submit (create): call `POST /workspaces/`
- On submit (join): call `POST /workspaces/join`
- On success: either path sets `is_onboarded = true` server-side
- Frontend: update Zustand store `user.is_onboarded = true` after success
- Redirect to `/dashboard`

### useAuth.ts update needed

After onboarding completes, update the persisted user in the Zustand store:

```typescript
// In onboarding-form.tsx after workspace creation succeeds:
const { setUser, user } = useAuth();
if (user) {
  setUser({ ...user, is_onboarded: true });
}
router.push("/dashboard");
```

### Middleware update

Current middleware redirects authenticated users hitting auth routes to
`/dashboard`. Add onboarding check:

```typescript
// After session check in middleware.ts:
if (isProtectedRoute(pathname) && !isAuthenticated) {
  // redirect to login (existing)
}

// New: redirect non-onboarded users away from app routes
// (except /onboarding itself)
if (isAuthenticated && !pathname.startsWith("/onboarding")) {
  // Check is_onboarded from session — or rely on the backend 403
  // The backend OnboardedDep handles this for API routes
  // Frontend middleware handles page-level redirect
}
```

Note: middleware can't read Zustand store (runs on Edge). Options:

1. Store `is_onboarded` in a cookie after login (set in syncSupabaseSession)
2. Rely on the backend returning 403 and handle it in the API client
3. Read from Supabase session user_metadata if you store it there

Recommended: Option 2 for now — the backend `OnboardedDep` protects API
routes. Add a global error handler in `useAuth` or an Axios interceptor
that redirects to `/onboarding` on 403. Simpler than cookie management.

---

## Install Required Package

```bash
cd apps/web
npm install @radix-ui/react-select
```

---

## Testing Scope for This Branch

### Backend Unit Tests

- `WorkspaceService.create_workspace` — slug uniqueness check, member creation,
  is_onboarded set to True
- `WorkspaceService.join_workspace` — invalid code, already member
- `WorkspaceRepository` — CRUD operations
- `require_onboarded` dependency — returns 403 when not onboarded

### Backend Integration Tests

- `POST /workspaces/` — full flow with real DB (use Supabase CLI in CI)
- `POST /workspaces/join` — invalid invite code returns 400
- `GET /workspaces/me` — returns user's workspaces
- Protected routes return 403 when `is_onboarded = false`

### Frontend Unit Tests

- `OnboardingForm` step 1 — validation, timezone search, submission
- `OnboardingForm` step 2 — slug auto-generation, tab switching
- `useAuth` — `needsOnboarding` correctly derived from `is_onboarded`

### E2E (Playwright — first real E2E test)

```
Complete happy path:
signup → onboarding step 1 (profile) → onboarding step 2 (workspace) →
dashboard redirect → verify is_onboarded = true in DB
```

---

## Acceptance Criteria

```
[✅] User who signs up is redirected to /onboarding
[✅] Step 1 saves full_name and timezone via PATCH /auth/profile
[✅] Step 2 creates workspace via POST /workspaces/
[✅] Workspace slug is unique — duplicate returns clear error
[✅] After workspace creation, is_onboarded = true in profiles table
[✅] User is redirected to /dashboard after onboarding
[✅] Returning user with is_onboarded = true skips onboarding
[✅] OAuth user's name is pre-filled in step 1
[✅] require_onboarded dependency returns 403 for non-onboarded users
[ ] All new endpoints covered by unit tests
[ ] CI passes on feature/auth/onboarding branch
```

---

## Known Decisions

- `default_update_mode` removed from onboarding — add to Settings page
  when voice recording is built (Milestone 4)
- Invite code system is a stub for now — `POST /workspaces/join` accepts
  a code but the invite generation endpoint comes in a later milestone
- Workspace plan defaults to "free" — billing/plan management is out of scope
- One workspace per user during onboarding — multi-workspace support comes
  after core product loop is working
