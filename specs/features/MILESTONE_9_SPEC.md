# SoarUp — Milestone 9: Public Profile

# Branch: feature/milestone-9

# Merges into: develop

# Prerequisites: feature/milestone-8 merged to develop ✅

---

## What This Milestone Delivers

### Pre-checklist (clear before feature work starts)

1. Block Kit text truncation utility (#85)
2. Platform flag guard in Celery Slack blocks (#86)
3. Inline webhook URL validation on settings page (#92)
4. Auto-clear Slack test result after 8 seconds (#93)
5. Replace inline SVG Slack badge with Material Symbol (#94)
6. Disable Cancel button during remove mutation (#95)
7. Replace sync boto3 with aioboto3 in Celery audio task (#9)
8. Add Postgres trigger for updated_at (#23)
9. Remove total_in_range from UpdateHistoryResponse (#69)
10. Invalidate analyticsKeys.personal after update submission (#78)

### Core M9 Features

11. Username field on Profile — validated, unique, GitHub-style rules
12. Bio and tagline optional fields on Profile
13. Debounced username availability check with inline feedback
14. Public profile toggle on /settings/profile — disabled until username saved
15. Public profile at /u/:username — unauthenticated, shareable
16. Heatmap on public profile aggregated across all user workspaces
17. OpenGraph metadata for link preview cards
18. Empty state toast when profile has zero activity
19. /auth/check-username endpoint — unauthenticated, excludes own username

---

## Branch Strategy

```
develop
└── feature/milestone-9
    ├── feature/milestone-9-prechecklist     ← all 10 pre-checklist items
    ├── feature/milestone-9-profile-model    ← DB + schema + API changes
    ├── feature/milestone-9-public-page      ← /u/:username page + OG metadata
    ├── feature/milestone-9-settings         ← /settings/profile extensions
    └── feature/milestone-9-stories-tests   ← Storybook + unit tests

Merge order:
  feature/milestone-9-prechecklist  → feature/milestone-9
  feature/milestone-9-profile-model → feature/milestone-9
  feature/milestone-9-public-page   → feature/milestone-9
  feature/milestone-9-settings      → feature/milestone-9
  feature/milestone-9-stories-tests → feature/milestone-9
  feature/milestone-9               → develop
```

---

## Google Stitch Prompt

```
Design two screens for SoarUp using the Electric Atelier design system.

Colors (dark mode): Background #0e0e10, Primary #53ddfc (cyan),
Surface High #1f1f22, Surface Highest #262528, On-surface #f9f5f8,
Error #ff716c, Outline-variant #48474a
Colors (light mode): Background #ebfdfc, Primary #00687a,
Surface Lowest #ffffff, On-surface #0e1e1e

Design rules: 0px border radius except pills and 4px cards.
DM Sans headlines, Space Grotesk UI, shadow-card on surfaces,
asymmetric CTA buttons.

Screen 1 — /u/:username (public profile page, unauthenticated):

Hero section at top:
- Large circular avatar (96px) or initials fallback
- Display name (DM Sans headline, 24px)
- @username handle (Space Grotesk, 14px, text-outline)
- Optional: bio text (one line, italic, text-on-surface-variant)
- Optional: tagline pill (small, border border-outline-variant,
  rounded-full, Space Grotesk 11px)
- "Built with SoarUp" subtle badge bottom-right of hero

Stats row below hero (3 cards inline):
- Current streak: large cyan number + "day streak" label
- Best streak: number + "best" label
- Total updates: number + "updates" label
Each card: bg-surface-high shadow-card rounded-card px-4 py-3

Heatmap section:
- Section label: "ACTIVITY" (10px uppercase tracked Space Grotesk, text-outline)
- Full-width SVG heatmap, last 52 weeks
- Same style as /history analytics personal heatmap
- Month labels above, M W F day labels left
- Intensity: 0=surface-high, 1-3=cyan tints to full primary

Empty state (when zero submissions):
- Heatmap shown with all cells at intensity 0
- Toast notification at bottom of screen:
  "No activity yet — updates will appear here once submitted"
  Dismissible, appears after data loads

Footer:
- "Sign up to SoarUp →" link (primary color, asymmetric button style)
- Subtle copyright line

Screen 2 — /settings/profile (extended, existing page):

Existing fields preserved:
- Display name input (bottom-border style)
- Timezone selector
- Avatar upload section

New fields added above existing (identity section first):

Username section at top:
- Label: "USERNAME" (10px uppercase tracked)
- Input (bottom-border style) with @ prefix label
- Debounced availability indicator to the right of input:
  Loading: small spinner
  Available: green checkmark + "available" text
  Taken: red X + "already taken" text
  Own username: green checkmark + "your current username"
- Helper text: "soarup.app/u/your-username"

Bio section:
- Label: "BIO" (10px uppercase tracked)
- Single-line input, placeholder "Full-stack engineer building in public"
- Optional — no validation required

Tagline section:
- Label: "TAGLINE" (10px uppercase tracked)
- Single-line input, placeholder "Building in public · Open source"
- Optional — renders as pill on public profile

Public profile section:
- Toggle: "Make profile public"
- Description: "Share your activity at soarup.app/u/username"
- Disabled with tooltip when no username set:
  "Set a username above to enable your public profile"
- When enabled: show full shareable URL as copyable link
  + "Copy link" button (copies to clipboard)
  + "View profile →" link (opens /u/:username in new tab)

Save button at bottom (asymmetric primary CTA)
Unsaved changes amber indicator
```

---

## Part 1: Pre-Checklist

### #85 — Block Kit truncation

```python
# apps/api/app/lib/slack_blocks.py — add at top of file

def _truncate(text: str, max_len: int = 2900) -> str:
    """
    Slack Block Kit section text fields have a 3000 character maximum.
    Truncate to 2900 chars to leave headroom for mrkdwn formatting.
    """
    return text if len(text) <= max_len else text[:max_len] + "\u2026"


# Apply to all text fields in build_digest_blocks:
"text": f"*Team Summary*\n>{_truncate(team_summary)}",
"text": f"*{name}*\n{_truncate(summary)}",

# Apply to build_update_notification_blocks:
"text": f"*Update*\n{_truncate(content)}",
"text": f"*Summary*\n>{_truncate(summary)}",
```

---

### #86 — Platform flag guard in Celery tasks

```python
# apps/api/app/workers/tasks.py — all three Slack delivery blocks
# Add settings.slack_integration_enabled check before per-workspace check:

if (
    settings.slack_integration_enabled
    and workspace.slack_digest_enabled
    and workspace.slack_webhook_url_encrypted
):
    ...  # digest Slack delivery

if (
    settings.slack_integration_enabled
    and workspace
    and workspace.slack_updates_enabled
    and workspace.slack_webhook_url_encrypted
):
    ...  # update notification

# Same pattern in _process_audio_update_async
```

---

### #92 — Inline webhook URL validation

```typescript
// apps/web/src/app/(app)/settings/slack/page.tsx

const isValidWebhookUrl =
  !webhookUrl ||
  webhookUrl.startsWith("https://hooks.slack.com/");

// Add below the URL input:
{webhookUrl && !isValidWebhookUrl && (
  <p className="font-label text-[10px] text-error mt-1">
    Must be a valid Slack incoming webhook URL starting with
    https://hooks.slack.com/
  </p>
)}

// Disable save when URL is typed but invalid:
disabled={!isValidWebhookUrl || !isDirty || updateSettings.isPending}
```

---

### #93 — Auto-clear test result

```typescript
// apps/web/src/app/(app)/settings/slack/page.tsx

React.useEffect(() => {
  if (!testResult) return;
  const timer = setTimeout(() => setTestResult(null), 8000);
  return () => clearTimeout(timer);
}, [testResult]);

// Also clear on webhook URL change:
onChange={(e) => {
  setWebhookUrl(e.target.value);
  setIsDirty(true);
  setTestResult(null);
}}
```

---

### #94 — Replace SVG Slack badge

```typescript
// apps/web/src/components/domain/digests/digest-card.tsx
// Replace inline SVG block with:

<span
  className="material-symbols-outlined text-[11px] text-outline"
  aria-hidden="true"
>
  label
</span>
```

---

### #95 — Disable Cancel during removal

```typescript
// apps/web/src/app/(app)/settings/slack/page.tsx
// Add disabled prop to Cancel button:

<button
  type="button"
  onClick={() => setShowRemoveConfirm(false)}
  disabled={removeIntegration.isPending}
  className="font-label text-xs text-outline hover:underline
             disabled:opacity-40 disabled:cursor-not-allowed"
>
  Cancel
</button>
```

---

### #9 — Replace boto3 with aioboto3

```python
# apps/api/requirements.txt
# Remove: boto3
# Add: aioboto3>=13.0.0

# apps/api/app/workers/tasks.py — _process_audio_update_async
# Replace sync boto3 download pattern:

# Current:
import boto3
s3 = boto3.client("s3", ...)
s3.download_fileobj(bucket, key, buffer)

# Replace with:
import aioboto3
session = aioboto3.Session()
async with session.client(
    "s3",
    endpoint_url=settings.r2_endpoint_url,
    aws_access_key_id=settings.r2_access_key_id,
    aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
    region_name="auto",
) as s3:
    await s3.download_fileobj(bucket, key, buffer)
```

Remove `import boto3` from all files. Verify no other files reference
`boto3` before removing:

```bash
grep -r "import boto3" apps/api/
```

---

### #23 — Postgres trigger for updated_at

```python
# apps/api/alembic/versions/YYYYMMDD_*_add_updated_at_trigger.py

def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER updates_updated_at
        BEFORE UPDATE ON updates
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)

def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS updates_updated_at ON updates;")
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column;")
```

```bash
docker compose exec api alembic revision -m "add_updated_at_trigger"
# Paste upgrade/downgrade bodies, set down_revision manually
docker compose exec api alembic upgrade head
```

---

### #69 — Remove total_in_range

```python
# apps/api/app/schemas/update.py
# Remove total_in_range from UpdateHistoryResponse:

class UpdateHistoryResponse(BaseModel):
    updates: list[UpdateResponse]
    next_cursor: str | None
    # total_in_range removed — was approximate (page count only)
    # Frontend uses hasNextPage from next_cursor instead
```

Update `apps/api/app/services/update_service.py` — remove `total_in_range`
from the returned `UpdateHistoryResponse` instantiation.

Update `apps/web/src/hooks/useUpdateHistory.ts` — remove any reference
to `total_in_range` from the `UpdateHistoryResponse` TypeScript interface.

---

### #78 — Invalidate analytics on update submission

```typescript
// apps/web/src/hooks/useUpdates.ts — useSubmitUpdate onSuccess

onSuccess: (newUpdate) => {
  // existing cache update
  queryClient.setQueryData(
    updateKeys.byDate(workspaceId, date),
    (old) => ({ ...old, updates: [newUpdate, ...(old?.updates ?? [])] }),
  );
  // new: invalidate personal analytics so streak + heatmap update
  queryClient.invalidateQueries({
    queryKey: analyticsKeys.personal(workspaceId),
  });
},
```

---

## Part 2: Profile Model Changes

### Step 1: Database Migration

```python
# apps/api/app/models/profile.py — add new columns

username: Mapped[str | None] = mapped_column(
    String(30),
    nullable=True,
    unique=True,
    index=True,
    doc="Public username for /u/:username profile URL. "
        "Lowercase alphanumeric + hyphens, 3-30 chars. "
        "Must be unique across all users.",
)
bio: Mapped[str | None] = mapped_column(
    String(160),
    nullable=True,
    doc="Optional one-line bio shown on public profile.",
)
tagline: Mapped[str | None] = mapped_column(
    String(60),
    nullable=True,
    doc="Optional tagline rendered as a pill on public profile.",
)
profile_public: Mapped[bool] = mapped_column(
    Boolean,
    default=False,
    nullable=False,
    doc="Whether this profile is publicly visible at /u/:username. "
        "Requires username to be set.",
)
```

Alembic migration:

```bash
docker compose exec api alembic revision --autogenerate \
  -m "add_username_bio_tagline_profile_public_to_profiles"
docker compose exec api alembic upgrade head
```

⚠️ The UNIQUE constraint on `username` will be generated automatically
by `autogenerate` — verify it appears as `op.create_unique_constraint`
in the migration before running upgrade.

---

### Step 2: Username Validation

```python
# apps/api/app/schemas/profile.py (or auth.py) — add validator

import re

USERNAME_PATTERN = re.compile(r'^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$')
# Rules:
# - 3-30 characters total
# - Lowercase alphanumeric and hyphens only
# - Cannot start or end with a hyphen
# - No consecutive hyphens (add check below)

def validate_username(username: str) -> str:
    username = username.lower().strip()
    if not USERNAME_PATTERN.match(username):
        raise ValueError(
            "Username must be 3-30 characters, lowercase letters, "
            "numbers, and hyphens only. Cannot start or end with a hyphen."
        )
    if "--" in username:
        raise ValueError("Username cannot contain consecutive hyphens.")
    return username
```

---

### Step 3: Profile Schemas Update

```python
# apps/api/app/schemas/auth.py (or profile.py)

class UpdateProfileRequest(BaseModel):
    full_name: str | None = None
    timezone: str | None = None
    username: str | None = Field(None, min_length=3, max_length=30)
    bio: str | None = Field(None, max_length=160)
    tagline: str | None = Field(None, max_length=60)
    profile_public: bool | None = None
    is_onboarded: bool | None = None

    @field_validator("username", mode="after")
    @classmethod
    def validate_username_field(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return validate_username(v)

    @model_validator(mode="after")
    def profile_public_requires_username(self) -> "UpdateProfileRequest":
        """Cannot enable public profile without a username."""
        # This is enforced at the service layer where we can check the
        # existing profile state — schema validation is stateless
        return self


class PublicProfileResponse(BaseModel):
    """
    Response shape for public profile endpoint.
    Never includes email or workspace details.
    """
    username: str
    full_name: str | None
    avatar_url: str | None
    bio: str | None
    tagline: str | None
    streak: StreakResponse           # from analytics_service
    heatmap: list[HeatmapDay]        # aggregated across all workspaces
    heatmap_weeks: int = 52
    model_config = ConfigDict(from_attributes=True)


class UsernameAvailabilityResponse(BaseModel):
    username: str
    available: bool
    message: str   # "Available", "Already taken", "Your current username"
```

Update `UserResponse` to include new public profile fields:

```python
class UserResponse(BaseModel):
    ...  # existing fields
    username: str | None = None
    bio: str | None = None
    tagline: str | None = None
    profile_public: bool = False
```

---

### Step 4: Profile Repository Updates

```python
# apps/api/app/repositories/profile_repo.py — add

async def get_by_username(self, username: str) -> Profile | None:
    """Fetch profile by username for public profile lookup."""
    result = await self.db.execute(
        select(Profile).where(
            func.lower(Profile.username) == username.lower()
        )
    )
    return result.scalar_one_or_none()

async def is_username_taken(
    self,
    username: str,
    exclude_user_id: str | None = None,
) -> bool:
    """
    Check if a username is already in use.
    exclude_user_id: skip the current user's own record so their
    existing username doesn't appear as taken.
    """
    query = select(Profile.id).where(
        func.lower(Profile.username) == username.lower()
    )
    if exclude_user_id:
        query = query.where(Profile.id != exclude_user_id)
    result = await self.db.execute(query)
    return result.scalar_one_or_none() is not None
```

---

### Step 5: Analytics Service — Cross-Workspace Heatmap

Add a new method to `AnalyticsService` for the public profile heatmap
that aggregates across all workspaces:

```python
# apps/api/app/services/analytics_service.py

async def get_public_profile_analytics(
    self,
    user_id: str,
) -> tuple[StreakResponse, list[HeatmapDay]]:
    """
    Analytics for the public profile page.
    Aggregates submission activity across ALL workspaces the user
    belongs to — not scoped to a single workspace.
    """
    analytics_repo = AnalyticsRepository.from_session(self.db)

    today = datetime.now(UTC).date()
    heatmap_start = today - timedelta(weeks=52)

    # Get all submission dates across all workspaces
    # Note: uses a new repo method that doesn't filter by workspace_id
    submission_date_strs = await analytics_repo\
        .get_user_submission_dates_all_workspaces(
            user_id=user_id,
            from_date=heatmap_start,
            to_date=today,
        )

    # No digest_days for public profile — use calendar days
    # (user may belong to workspaces with different schedules)
    current_streak, best_streak = _calculate_streak(
        submission_date_strs,
        digest_days=None,  # calendar days for cross-workspace view
    )

    # Build heatmap — count per day (max 1 per day per workspace,
    # but could be multiple if user submits in multiple workspaces)
    date_counts: dict[str, int] = {}
    for d in submission_date_strs:
        date_counts[d] = date_counts.get(d, 0) + 1

    heatmap = _build_heatmap(date_counts, heatmap_start, today)
    last_date = submission_date_strs[0] if submission_date_strs else None

    streak = StreakResponse(
        current_streak=current_streak,
        best_streak=best_streak,
        total_submissions=len(submission_date_strs),
        last_submission_date=last_date,
    )
    return streak, heatmap
```

Add to `AnalyticsRepository`:

```python
async def get_user_submission_dates_all_workspaces(
    self,
    user_id: str,
    from_date: date,
    to_date: date,
) -> list[str]:
    """
    All submission dates for a user across ALL workspaces.
    Used for public profile heatmap — workspace-agnostic.
    Returns dates sorted descending.
    """
    result = await self.db.execute(
        select(Update.update_date)
        .where(
            and_(
                Update.user_id == user_id,
                Update.is_deleted == False,  # noqa: E712
                Update.update_date >= from_date.isoformat(),
                Update.update_date <= to_date.isoformat(),
            )
        )
        .order_by(Update.update_date.desc())
    )
    return [row[0] for row in result.all()]
```

---

### Step 6: Auth Service Updates

Update `AuthService.patch_profile` to handle new fields:

```python
async def patch_profile(
    self,
    user_id: str,
    request: UpdateProfileRequest,
) -> UserResponse:
    repo = ProfileRepository.from_session(self.db)
    profile = await repo.get_by_user_id(user_id)
    if not profile:
        raise AuthError("profile_not_found", "Profile not found.")

    # Username uniqueness check
    if request.username is not None:
        taken = await repo.is_username_taken(
            request.username, exclude_user_id=user_id
        )
        if taken:
            raise AuthError(
                "username_taken",
                "This username is already taken. Please choose another.",
            )
        profile.username = request.username

    # Cannot enable public profile without a username
    if request.profile_public is True:
        if not profile.username and not request.username:
            raise AuthError(
                "username_required",
                "A username is required before making your profile public.",
            )
        profile.profile_public = True
    elif request.profile_public is False:
        profile.profile_public = False

    if request.full_name is not None:
        profile.full_name = request.full_name
    if request.timezone is not None:
        profile.timezone = request.timezone
    if request.bio is not None:
        profile.bio = request.bio
    if request.tagline is not None:
        profile.tagline = request.tagline
    if request.is_onboarded is not None:
        profile.is_onboarded = request.is_onboarded

    await self.db.commit()
    await self.db.refresh(profile)
    return self._map_user_to_response(profile)
```

---

### Step 7: New API Endpoints

```python
# apps/api/app/routers/auth.py — add two new endpoints

@router.get("/check-username", status_code=200)
async def check_username_availability(
    username: str,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    # Intentionally unauthenticated — used by public profile lookup too
    # Optional: pass current user_id to exclude own username
    current_user_id: str | None = None,
) -> Response:
    """
    Check if a username is available.
    Unauthenticated — used by settings page and public profile routing.
    Excludes current_user_id from the taken check so users can
    re-save their own existing username.
    """
    try:
        validated = validate_username(username)
    except ValueError as e:
        return create_success_response(
            UsernameAvailabilityResponse(
                username=username,
                available=False,
                message=str(e),
            ),
            api_version=api_version,
        )

    repo = ProfileRepository.from_session(db)
    taken = await repo.is_username_taken(validated, exclude_user_id=current_user_id)

    return create_success_response(
        UsernameAvailabilityResponse(
            username=validated,
            available=not taken,
            message="Available" if not taken else "Already taken",
        ),
        api_version=api_version,
    )
```

```python
# apps/api/app/routers/public_profiles.py — new file

from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(prefix="/profiles", tags=["public-profiles"])


@router.get("/{username}", status_code=200)
async def get_public_profile(
    username: str,
    api_version: ApiVersionDep,
    db: DBSessionDep,
    # No auth dependency — fully public endpoint
) -> Response:
    """
    Public profile endpoint. Unauthenticated.
    Returns 404 if username not found OR profile_public=False.
    """
    repo = ProfileRepository.from_session(db)
    profile = await repo.get_by_username(username)

    if not profile or not profile.profile_public:
        return create_error_response(
            "profile_not_found",
            "This profile does not exist or is not public.",
            404,
            api_version=api_version,
        )

    analytics_service = AnalyticsService(db)
    streak, heatmap = await analytics_service.get_public_profile_analytics(
        user_id=profile.id
    )

    return create_success_response(
        PublicProfileResponse(
            username=profile.username,
            full_name=profile.full_name,
            avatar_url=profile.avatar_url,
            bio=profile.bio,
            tagline=profile.tagline,
            streak=streak,
            heatmap=heatmap,
        ),
        api_version=api_version,
    )
```

Register in `main.py`:

```python
from app.routers import public_profiles
app.include_router(public_profiles.router, prefix="/api/v1")
```

---

## Part 3: Frontend

### Step 1: Middleware — Carve Out Public Profile Routes

```typescript
// apps/web/src/middleware.ts

// Add to public routes — must never appear in PROTECTED_ROUTES
// /u/* — public profile pages, requires no auth to view
// /api/v1/profiles/* — public profile API, no auth required
// /api/v1/auth/check-username — username availability, no auth required

// Ensure /u/:username is NOT in PROTECTED_ROUTES or AUTH_ROUTES
```

---

### Step 2: Hooks

```typescript
// apps/web/src/hooks/usePublicProfile.ts

export interface PublicProfile {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  tagline: string | null;
  streak: StreakData;
  heatmap: HeatmapDay[];
  heatmap_weeks: number;
}

export const publicProfileKeys = {
  profile: (username: string) => ["public-profile", username] as const,
  availability: (username: string) =>
    ["username-availability", username] as const,
};

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: publicProfileKeys.profile(username),
    queryFn: () => apiClient.getPublic<PublicProfile>(`/profiles/${username}`),
    staleTime: 5 * 60 * 1000,
    retry: false, // 404 should not retry
  });
}

export function useUsernameAvailability(
  username: string,
  currentUserId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: publicProfileKeys.availability(username),
    queryFn: () =>
      apiClient.getPublic<UsernameAvailabilityResponse>(
        `/auth/check-username?username=${encodeURIComponent(username)}` +
          (currentUserId ? `&current_user_id=${currentUserId}` : ""),
      ),
    enabled: enabled && username.length >= 3,
    staleTime: 30 * 1000,
  });
}
```

Note: `apiClient.getPublic` is a variant of `apiClient.get` that does
not attach an `Authorization` header. Add this method to `apiClient.ts`:

```typescript
// apps/web/src/lib/api-client.ts
getPublic: async <T>(path: string): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiRequestError(
      error.error_code ?? "request_failed",
      error.message ?? "Request failed",
      res.status,
    );
  }
  return res.json();
},
```

---

### Step 3: Public Profile Page

```typescript
// apps/web/src/app/u/[username]/page.tsx
// Next.js App Router — Server Component for OG metadata
// Client Component for interactive elements (toast)

import type { Metadata } from "next";
import { PublicProfileClient } from "./client";

interface Props {
  params: { username: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Fetch profile server-side for OG tags
  try {
    const profile = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/profiles/${params.username}`,
      { next: { revalidate: 300 } },   // revalidate every 5 minutes
    ).then((r) => (r.ok ? r.json() : null));

    if (!profile) {
      return { title: "Profile not found — SoarUp" };
    }

    const streakText = profile.streak.current_streak > 0
      ? `${profile.streak.current_streak} day streak · `
      : "";

    return {
      title: `${profile.full_name ?? profile.username} (@${profile.username}) — SoarUp`,
      description:
        `${streakText}${profile.streak.total_submissions} updates · ` +
        (profile.bio ?? "Building in public with SoarUp"),
      openGraph: {
        title: `${profile.full_name ?? profile.username} on SoarUp`,
        description:
          `${streakText}${profile.streak.total_submissions} standup updates · ` +
          (profile.bio ?? "Building in public with SoarUp"),
        url: `${process.env.NEXT_PUBLIC_APP_URL}/u/${params.username}`,
        siteName: "SoarUp",
        images: profile.avatar_url
          ? [{ url: profile.avatar_url, width: 400, height: 400 }]
          : [],
        type: "profile",
      },
      twitter: {
        card: "summary",
        title: `${profile.full_name ?? profile.username} (@${profile.username})`,
        description:
          `${streakText}${profile.streak.total_submissions} standup updates on SoarUp`,
        images: profile.avatar_url ? [profile.avatar_url] : [],
      },
    };
  } catch {
    return { title: "SoarUp — Async Standups" };
  }
}

export default function PublicProfilePage({ params }: Props) {
  return <PublicProfileClient username={params.username} />;
}
```

```typescript
// apps/web/src/app/u/[username]/client.tsx
"use client";

import * as React from "react";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { Heatmap } from "@/components/ui/heatmap";
import { StreakCard } from "@/components/ui/streak-card";
import { Toast } from "@/components/ui/toast";

interface Props {
  username: string;
}

export function PublicProfileClient({ username }: Props) {
  const { data: profile, isLoading, isError } = usePublicProfile(username);
  const [showEmptyToast, setShowEmptyToast] = React.useState(false);

  // Show empty state toast after data loads and confirms zero activity
  React.useEffect(() => {
    if (profile && profile.streak.total_submissions === 0) {
      setShowEmptyToast(true);
    }
  }, [profile]);

  if (isLoading) {
    return <PublicProfileSkeleton />;
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-headline text-2xl text-on-surface">
            Profile not found
          </p>
          <p className="font-body text-sm text-on-surface-variant">
            This profile doesn't exist or hasn't been made public yet.
          </p>
          <a
            href="/"
            className="font-label text-xs text-primary hover:underline"
          >
            Go to SoarUp →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">

        {/* Hero */}
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-primary-container
                          flex items-center justify-center text-3xl
                          font-bold text-primary-on-container flex-shrink-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? profile.username}
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              (profile.full_name?.[0] ?? profile.username[0]).toUpperCase()
            )}
          </div>

          {/* Identity */}
          <div className="space-y-1 flex-1 min-w-0">
            <h1 className="font-headline text-2xl text-on-surface truncate">
              {profile.full_name ?? profile.username}
            </h1>
            <p className="font-label text-sm text-outline">
              @{profile.username}
            </p>
            {profile.bio && (
              <p className="font-body text-sm italic text-on-surface-variant">
                {profile.bio}
              </p>
            )}
            {profile.tagline && (
              <span className="inline-block font-label text-[11px]
                               border border-outline-variant rounded-full
                               px-2 py-0.5 text-outline mt-1">
                {profile.tagline}
              </span>
            )}
          </div>

          {/* Built with SoarUp badge */}
          <a
            href="/"
            className="flex-shrink-0 font-label text-[10px] uppercase
                       tracking-[0.15em] text-outline hover:text-primary
                       transition-colors"
          >
            Built with SoarUp
          </a>
        </div>

        {/* Stats row */}
        <StreakCard streak={profile.streak} />

        {/* Heatmap */}
        <div className="space-y-3">
          <p className="font-label text-[10px] uppercase tracking-[0.2em]
                        text-outline">
            Activity — last 52 weeks
          </p>
          <div className="bg-surface-high shadow-card rounded-card p-4
                          overflow-x-auto">
            <Heatmap
              days={profile.heatmap}
              weeks={profile.heatmap_weeks}
            />
          </div>
        </div>

        {/* Footer CTA */}
        <div className="pt-6 border-t border-outline-variant
                        flex items-center justify-between">
          <p className="font-label text-[10px] text-outline">
            © SoarUp {new Date().getFullYear()}
          </p>
          <a
            href="/signup"
            className="asymmetric-btn px-5 py-2 bg-primary text-on-primary
                       font-label text-xs uppercase tracking-[0.15em]"
          >
            Sign up to SoarUp →
          </a>
        </div>
      </div>

      {/* Empty state toast */}
      {showEmptyToast && (
        <Toast
          message="No activity yet — updates will appear here once submitted"
          onDismiss={() => setShowEmptyToast(false)}
        />
      )}
    </div>
  );
}

function PublicProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-8 animate-pulse">
      <div className="flex items-start gap-6">
        <div className="w-24 h-24 rounded-full bg-surface-high flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-7 w-48 bg-surface-high rounded-card" />
          <div className="h-4 w-24 bg-surface-high rounded-card" />
          <div className="h-4 w-64 bg-surface-high rounded-card" />
        </div>
      </div>
      <div className="h-20 bg-surface-high rounded-card" />
      <div className="h-40 bg-surface-high rounded-card" />
    </div>
  );
}
```

---

### Step 4: Toast Component

```typescript
// apps/web/src/components/ui/toast.tsx
// Simple bottom-of-screen toast for the public profile empty state.
// Not a full toast system — just what's needed for M9.

"use client";

import * as React from "react";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;  // ms, default 6000
}

export function Toast({ message, onDismiss, duration = 6000 }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                 bg-surface-highest border border-outline-variant
                 shadow-modal rounded-card px-5 py-3
                 flex items-center gap-3 max-w-sm w-full mx-4
                 animate-in slide-in-from-bottom-4 duration-300"
      role="status"
      aria-live="polite"
    >
      <p className="font-body text-sm text-on-surface-variant flex-1">
        {message}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-outline hover:text-on-surface transition-colors
                   flex-shrink-0"
        aria-label="Dismiss"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}
```

---

### Step 5: /settings/profile Page Extensions

```typescript
// apps/web/src/app/(app)/settings/profile/page.tsx
// Extend the existing page — add username, bio, tagline, public toggle

// Username section (add above existing display name input):

const [usernameInput, setUsernameInput] = React.useState(
  user?.username ?? ""
);
const [usernameDirty, setUsernameDirty] = React.useState(false);
const debouncedUsername = useDebounce(usernameInput, 500);

const availabilityQuery = useUsernameAvailability(
  debouncedUsername,
  user?.id,
  usernameDirty && debouncedUsername.length >= 3,
);

// Username availability indicator:
function UsernameIndicator() {
  if (!usernameDirty || usernameInput.length < 3) return null;
  if (usernameInput === user?.username) {
    return (
      <span className="font-label text-[10px] text-emerald-400 flex items-center gap-1">
        <span className="material-symbols-outlined text-[12px]">check_circle</span>
        Your current username
      </span>
    );
  }
  if (availabilityQuery.isLoading) {
    return (
      <span className="material-symbols-outlined text-[14px] text-outline animate-spin">
        progress_activity
      </span>
    );
  }
  if (availabilityQuery.data?.available) {
    return (
      <span className="font-label text-[10px] text-emerald-400 flex items-center gap-1">
        <span className="material-symbols-outlined text-[12px]">check_circle</span>
        Available
      </span>
    );
  }
  return (
    <span className="font-label text-[10px] text-error flex items-center gap-1">
      <span className="material-symbols-outlined text-[12px]">cancel</span>
      Already taken
    </span>
  );
}

// Public profile toggle:
const hasUsername = !!(user?.username || (
  availabilityQuery.data?.available && usernameInput.length >= 3
));

{/* Public profile section */}
<div className="space-y-3">
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="font-body text-sm text-on-surface">
        Make profile public
      </p>
      <p className="font-label text-[11px] text-outline mt-0.5">
        {hasUsername
          ? `Share your activity at soarup.app/u/${user?.username ?? usernameInput}`
          : "Set a username above to enable your public profile"
        }
      </p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={user?.profile_public ?? false}
      disabled={!hasUsername || updateProfile.isPending}
      onClick={() => updateProfile.mutate({
        profile_public: !(user?.profile_public ?? false)
      })}
      className={`relative w-10 h-6 rounded-full transition-colors
                  flex-shrink-0 disabled:opacity-40
                  ${user?.profile_public ? "bg-primary" : "bg-surface-highest"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white
                        transition-transform
                        ${user?.profile_public
                          ? "translate-x-5"
                          : "translate-x-1"}`}
      />
    </button>
  </div>

  {/* Shareable URL when public */}
  {user?.profile_public && user?.username && (
    <div className="flex items-center gap-2 p-3 bg-surface-high
                    rounded-card border border-outline-variant">
      <code className="font-label text-xs text-primary flex-1 truncate">
        soarup.app/u/{user.username}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(
            `${window.location.origin}/u/${user.username}`
          );
        }}
        className="font-label text-[10px] uppercase tracking-[0.1em]
                   text-outline hover:text-primary transition-colors
                   flex-shrink-0"
      >
        Copy
      </button>
      <a
        href={`/u/${user.username}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-label text-[10px] uppercase tracking-[0.1em]
                   text-outline hover:text-primary transition-colors
                   flex-shrink-0"
      >
        View →
      </a>
    </div>
  )}
</div>
```

Add `useDebounce` hook:

```typescript
// apps/web/src/hooks/useDebounce.ts

import * as React from "react";

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

---

## Storybook Stories

```
src/stories/pages/PublicProfilePage.stories.tsx
  ← WithActivityDark/Light (streak + full heatmap)
  ← WithBioAndTaglineDark (all optional fields shown)
  ← NoAvatarDark (initials fallback)
  ← EmptyStateDark (zero submissions, toast shown)
  ← LoadingSkeletonDark
  ← NotFoundDark (404 state)
  ← MobileDark/Light

src/stories/ui/Toast.stories.tsx
  ← DefaultDark/Light
  ← LongMessageDark

src/stories/settings/ProfilePage.stories.tsx ← extend existing
  ← WithUsernameDark (username set, available indicator)
  ← UsernameTakenDark (red indicator)
  ← UsernameLoadingDark (spinner)
  ← PublicEnabledDark (toggle on, URL shown, copy + view links)
  ← PublicDisabledNoUsernameDark (toggle disabled, tooltip)
  ← WithBioAndTaglineDark
```

---

## Unit Tests

### Backend

```
tests/unit/test_profile_repo.py ← extend existing
  ← get_by_username: returns profile when username matches
  ← get_by_username: case-insensitive match
  ← get_by_username: returns None when not found
  ← is_username_taken: True when username exists
  ← is_username_taken: False when username belongs to exclude_user_id
  ← is_username_taken: False when username not found

tests/unit/test_username_validation.py
  ← valid: "suyash", "suyash-sharma", "dev123"
  ← invalid: starts with hyphen "-suyash"
  ← invalid: ends with hyphen "suyash-"
  ← invalid: consecutive hyphens "su--yash"
  ← invalid: too short "ab"
  ← invalid: too long (31 chars)
  ← invalid: uppercase "Suyash" (lowercased by validator)
  ← invalid: special chars "suyash@dev"

tests/unit/test_public_profile_endpoint.py
  ← GET /profiles/:username → 200 when profile_public=True
  ← GET /profiles/:username → 404 when profile_public=False
  ← GET /profiles/:username → 404 when username not found
  ← response never includes email
  ← response includes streak + heatmap

tests/unit/test_check_username_endpoint.py
  ← GET /auth/check-username?username=available → available=True
  ← GET /auth/check-username?username=taken → available=False
  ← GET /auth/check-username with current_user_id → own username=True
  ← GET /auth/check-username with invalid format → available=False + message

tests/unit/test_analytics_service.py ← extend
  ← get_public_profile_analytics aggregates across all workspaces
  ← get_public_profile_analytics uses calendar days (no digest_days)

tests/unit/test_analytics_repo.py ← extend
  ← get_user_submission_dates_all_workspaces includes all workspaces
  ← get_user_submission_dates_all_workspaces excludes deleted updates
```

### Frontend

```
hooks/usePublicProfile.test.ts
  ← usePublicProfile calls /profiles/:username without auth header
  ← usePublicProfile retry=false (404 not retried)
  ← useUsernameAvailability disabled when username < 3 chars
  ← useUsernameAvailability passes current_user_id when provided

hooks/useDebounce.test.ts
  ← value not updated until delay has passed
  ← returns updated value after delay

components/Toast.test.tsx
  ← renders message
  ← auto-dismisses after duration
  ← calls onDismiss when close clicked
  ← has aria-live="polite"

components/PublicProfileClient.test.tsx
  ← renders hero with name + username + avatar
  ← renders bio when present
  ← renders tagline pill when present
  ← shows empty toast when total_submissions=0
  ← does not show toast when total_submissions > 0
  ← shows 404 state when isError=true
  ← shows skeleton when isLoading=true
```

---

## Known Tradeoffs

**1. OG image is the user's avatar, not a generated card**
Dynamic OG image generation (e.g. via Vercel OG or Satori) would produce
a richer preview with the heatmap rendered as an image. Using the avatar
is simpler and sufficient for M9. Post-launch if link previews become a
growth driver, revisit with a generated card.

**2. Public profile analytics uses calendar days, not workspace digest days**
Cross-workspace streak calculation uses calendar days since the user may
belong to workspaces with different digest schedules. A user who submits
Mon-Fri in workspace A and Mon-Wed in workspace B gets a calendar-day
streak. Slightly less meaningful for teams but more honest for a public
profile that crosses workspace boundaries.

**3. Server-side fetch for OG metadata is not cached at the CDN layer**
`generateMetadata` fetches the profile server-side with `revalidate: 300`
(5 minutes). This means OG metadata is at most 5 minutes stale. Acceptable
for streak/bio data that changes infrequently.

**4. Username is globally unique across all workspaces**
A user who is a member of multiple workspaces has one username for their
public profile regardless of which workspace they're most active in.
Correct and intentional — the public profile is identity-level, not
workspace-level.

**5. Toast component is minimal — not a full toast system**
The Toast component built in M9 handles the empty state case only. A full
toast system (multiple simultaneous toasts, different variants, positioning
options) is post-M9 if other parts of the app need toast notifications.

---

## Acceptance Criteria

```
[ ] Pre-checklist items #85, #86, #92, #93, #94, #95 completed
[ ] Pre-checklist items #9, #23, #69, #78 completed
[ ] username field added to Profile model (unique, indexed)
[ ] bio and tagline optional fields added to Profile model
[ ] profile_public boolean added to Profile model
[ ] PATCH /auth/profile accepts username, bio, tagline, profile_public
[ ] Username validation: 3-30 chars, lowercase alphanumeric + hyphens
[ ] Cannot start or end with hyphen, no consecutive hyphens
[ ] Username uniqueness enforced at DB level (UNIQUE constraint)
[ ] GET /auth/check-username unauthenticated endpoint works
[ ] Own username shows as available (exclude_user_id logic)
[ ] Cannot enable profile_public without username set
[ ] GET /api/v1/profiles/:username returns 200 when profile_public=True
[ ] GET /api/v1/profiles/:username returns 404 when profile_public=False
[ ] Public profile response never includes email field
[ ] Heatmap aggregated across all user workspaces
[ ] Streak uses calendar days on public profile
[ ] /u/:username page renders without authentication
[ ] OpenGraph metadata generated server-side for link previews
[ ] OG title includes name + streak
[ ] OG description includes total submissions + bio
[ ] 404 state shown when profile not found or not public
[ ] Loading skeleton shown while data fetches
[ ] Empty state toast shown when total_submissions=0
[ ] Toast auto-dismisses after 6 seconds
[ ] Toast dismissible manually
[ ] /settings/profile has username input at top
[ ] Debounced availability check fires after 500ms
[ ] Green checkmark shown when username available
[ ] Red X shown when username taken
[ ] Own username shows green checkmark (not "taken")
[ ] Bio and tagline inputs optional, no validation required
[ ] Public profile toggle disabled until username is saved
[ ] Shareable URL shown when profile is public
[ ] Copy link button copies full URL to clipboard
[ ] View profile link opens /u/:username in new tab
[ ] Middleware carves out /u/* as public route
[ ] Backend unit tests pass for profile repo + validation + endpoints
[ ] Frontend unit tests pass for hooks + Toast + PublicProfileClient
[ ] Storybook stories added for public profile page + profile settings
[ ] CI passes on feature/milestone-9 branch
```

---

## Files To Create Summary

### Backend (apps/api/)

```
app/routers/public_profiles.py
alembic/versions/YYYYMMDD_*_add_username_bio_tagline_profile_public.py
alembic/versions/YYYYMMDD_*_add_updated_at_trigger.py
tests/unit/test_username_validation.py
tests/unit/test_public_profile_endpoint.py
tests/unit/test_check_username_endpoint.py
```

### Frontend (apps/web/src/)

```
app/u/[username]/page.tsx              ← server component + OG metadata
app/u/[username]/client.tsx            ← client component
components/ui/toast.tsx
hooks/usePublicProfile.ts
hooks/useDebounce.ts
stories/pages/PublicProfilePage.stories.tsx
stories/ui/Toast.stories.tsx
tests/unit/usePublicProfile.test.ts
tests/unit/useDebounce.test.ts
tests/unit/Toast.test.tsx
tests/unit/PublicProfileClient.test.tsx
```

### Updated Files

```
apps/api/app/models/profile.py           ← +username, +bio, +tagline,
                                            +profile_public
apps/api/app/schemas/auth.py             ← +UpdateProfileRequest fields,
                                            +PublicProfileResponse,
                                            +UsernameAvailabilityResponse
apps/api/app/repositories/profile_repo.py ← +get_by_username,
                                             +is_username_taken
apps/api/app/repositories/analytics_repo.py ← +get_user_submission_dates_all_workspaces
apps/api/app/services/auth_service.py    ← +username handling in patch_profile
apps/api/app/services/analytics_service.py ← +get_public_profile_analytics
apps/api/app/routers/auth.py             ← +GET /check-username endpoint
apps/api/app/main.py                     ← +public_profiles router
apps/api/tests/unit/test_profile_repo.py ← +username methods
apps/api/tests/unit/test_analytics_service.py ← +public profile test
apps/api/tests/unit/test_analytics_repo.py ← +all workspaces method
apps/web/src/lib/api-client.ts           ← +getPublic method
apps/web/src/middleware.ts               ← +/u/* public route carve-out
apps/web/src/app/(app)/settings/profile/page.tsx ← username + bio +
                                                    tagline + public toggle
apps/web/src/stories/settings/ProfilePage.stories.tsx ← extended
```
