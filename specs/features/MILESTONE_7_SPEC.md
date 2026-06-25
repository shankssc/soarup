# SoarUp — Milestone 7: History & Analytics

# Branch: feature/milestone-7

# Merges into: develop

# Prerequisites: feature/milestone-polish merged to develop ✅

# Status: COMPLETE ✅ — tests passing, smoke test pending

---

## What This Milestone Delivers

1. `/history` page extended — tabbed view combining digest history and
   individual update history in one intuitive page ✅
2. Cursor-based pagination on `GET /workspaces/:id/updates/history` — new
   endpoint (existing dashboard endpoint unchanged) ✅
3. Personal analytics tab — submission streak + personal heatmap (last 52
   weeks) for all members ✅
4. Team analytics tab — aggregate participation rate + per-member breakdown
   - workspace heatmap (last 12 weeks), admin-only ✅
5. Streak calculation respects workspace digest days config — falls back to
   calendar days for solo/unconfigured workspaces ✅
6. Heatmap built with SVG — no third-party chart library ✅
7. All history queries use indexes — five indexes added via Alembic
   migration ✅

---

## Branch Strategy

```
develop
└── feature/milestone-7
    ├── feature/milestone-7-pagination       ← cursor pagination on updates API ✅
    ├── feature/milestone-7-analytics        ← streak + heatmap backend + frontend ✅
    ├── feature/milestone-7-history-page     ← extended /history with tabs ✅
    └── feature/milestone-7-stories-tests    ← Storybook + unit tests ✅

Actual merge order (deviated from spec):
  feature/milestone-7-pagination    → feature/milestone-7  ✅
  feature/milestone-7-analytics     → feature/milestone-7  ✅
  feature/milestone-7-history-page  → feature/milestone-7  ✅
  feature/milestone-7-stories-tests → feature/milestone-7  ✅
  feature/milestone-7               → develop  ← pending smoke test
```

---

## Google Stitch Prompt

```
Design a history and analytics page for SoarUp, an async standup tool.
Use the Electric Atelier design system.

Colors (dark mode): Background #0e0e10, Primary #53ddfc (cyan),
Surface High #1f1f22, Surface Highest #262528, On-surface #f9f5f8,
Error #ff716c, Outline-variant #48474a, Amber #fbbf24
Colors (light mode): Background #ebfdfc, Primary #00687a,
Surface Lowest #ffffff, On-surface #0e1e1e

Design rules: 0px border radius except pills and 4px cards.
Space Grotesk UI (DM Sans headlines after polish milestone),
bottom-border inputs, asymmetric CTA buttons, shadow-card on surfaces.

Page layout — /history:
- Page title: "History" (DM Sans headline)
- Three tab pills below title: "Digests" | "Updates" | "Analytics"
  Active tab: cyan fill pill. Inactive: outline pill.

Tab 1 — Digests (existing M6 content, unchanged):
- Digest card list, newest first, cursor-paginated Load more
- Each card: date, update count, team summary, expandable items

Tab 2 — Updates:
- Date range filter: "Last 7 days" / "Last 30 days" / "Last 90 days"
  pill toggles above the list (Custom range deferred — not built)
- Update card list (compact variant vs dashboard full variant):
  avatar + name + date + content snippet (2 lines)
  Clicking a card expands to full content + summary + transcript
- "Load more" button at bottom
- Empty state: "No updates in this period."

Tab 3 — Analytics:
Sub-tabs inside the analytics tab: "My stats" | "Team" (admin only —
Team tab hidden for non-admin members)

My stats sub-tab:
- Streak card: large number "14 days", subtitle "Current streak",
  secondary stat "Best streak: 21 days", total updates
  Streak calculated against workspace digest days (or calendar days if
  no schedule configured)
- Personal heatmap: GitHub contribution graph style, last 52 weeks
  Squares: empty (no submission), 3 intensity levels (1 = light cyan,
  2 = medium cyan, 3+ = full primary cyan)
  Month labels above, day labels (M W F) on left
  Hover tooltip via SVG <title>: "2 submissions on Tuesday 14 May"

Team sub-tab (admin only):
- Aggregate stat cards in a row:
  "82% participation rate" (last 30 days)
  "4.2 avg updates/day" (last 30 days)
  "12 active members"
- Per-member participation table:
  Avatar + name + streak + last 30 days % + sparkline (14-day mini bars)
  (Sorting deferred — tracked in scaling doc)
- Workspace heatmap: last 12 weeks, same style as personal but
  color intensity = number of members who submitted that day
```

---

## Existing Stack Reference

### Backend

- FastAPI, Python 3.12, SQLAlchemy async
- Supabase Auth + PostgreSQL (Supabase CLI local)
- Alembic, Structlog, Redis, Celery + Celery Beat
- pytest + pytest-asyncio, full conftest.py fixture suite
- All milestone models: Profile, Workspace, WorkspaceMember,
  Update, Digest, DigestItem, WorkspaceInvite

### Frontend

- Next.js 14 App Router, TypeScript
- Tailwind CSS + Electric Atelier tokens + shadow-card utilities
- @tanstack/react-query v5 — useInfiniteQuery for paginated lists
- Zustand + persist
- WebSocket registry + useWebSocket + useDashboardUpdates
- DM Sans headlines (post-polish)

### React Query cache keys (established + M7 additions)

```typescript
// Established
updateKeys.byDate(workspaceId, date);
updateKeys.all(workspaceId);
workspaceKeys.mine();
memberKeys.list(workspaceId);
digestKeys.list(workspaceId);
digestKeys.detail(workspaceId, digestId);
digestKeys.settings(workspaceId);
audioKeys.playback(workspaceId, updateId);

// Added in M7
analyticsKeys.personal(workspaceId); // ["analytics", workspaceId, "personal"]
analyticsKeys.team(workspaceId); // ["analytics", workspaceId, "team"]
updateHistoryKeys.list(workspaceId, { fromDate, toDate });
```

### conftest.py fixtures

```python
db_session, api_client, client_with_mocks, unauthenticated_client
make_jwt(user_id, email), auth_headers(user_id)
test_user_id, seeded_profile, seeded_workspace, workspace_repo
login_response(), profile_response()
```

---

## Backend — What Was Built

### Step 1: Database Indexes ✅

```python
# apps/api/app/models/update.py — added to __table_args__

__table_args__ = (
    UniqueConstraint(
        "workspace_id", "user_id", "update_date",
        name="uq_updates_user_workspace_date",
    ),
    Index("ix_updates_workspace_date", "workspace_id", "update_date"),
    Index("ix_updates_user_workspace", "user_id", "workspace_id"),
    Index("ix_updates_user_date", "user_id", "update_date"),
)
```

```python
# apps/api/app/models/digest.py — added to __table_args__

__table_args__ = (
    Index("ix_digests_workspace_created", "workspace_id", "created_at"),
    Index("ix_digests_workspace_date", "workspace_id", "digest_date"),
)
```

Migration: `alembic revision -m "add_history_indexes"` (not `--autogenerate`
— autogenerate does not reliably detect index additions on existing tables).
The `down_revision` must be set to the previous migration head manually.
Verify all five `op.create_index` calls are present before running upgrade.

```bash
docker compose exec api alembic revision -m "add_history_indexes"
# Open generated file, paste upgrade/downgrade bodies, set down_revision
docker compose exec api alembic upgrade head
docker compose exec api alembic current  # verify new revision is (head)
```

---

### Step 2: Cursor Pagination on Updates Endpoint ✅

**Repository — `update_repo.py`:**

```python
async def get_workspace_updates_paginated(
    self,
    workspace_id: str,
    limit: int = 20,
    cursor: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    user_id: str | None = None,
) -> tuple[list[Update], str | None]:
```

Keyset pagination on `(update_date DESC, id DESC)`. Cursor is `update.id`
of the last seen item. Handles date ties via `OR` clause:

```python
query = query.where(
    or_(
        Update.update_date < cursor_update.update_date,
        and_(
            Update.update_date == cursor_update.update_date,
            Update.id < cursor_update.id,
        ),
    )
)
```

**Schema — `update.py`:** Added `UpdateHistoryResponse` and
`UpdateHistoryParams`.

`total_in_range` is approximate (current page count only, not a full
`COUNT(*)`) — field name chosen deliberately to communicate this.

**Service — `update_service.py`:** Added `get_update_history`.

Profile batch fetch uses `ProfileRepository.get_by_user_ids` (new method
added to `profile_repo.py`) — not `get_profiles_for_updates` which does
not exist. Uses `_to_response_batch` (not `_to_response_with_profile`
which does not exist).

```python
profile_map = await ProfileRepository.from_session(self.db).get_by_user_ids(user_ids)
responses = [self._to_response_batch(u, profile_map) for u in updates]
```

**Router — `updates.py`:**

New endpoint registered before the existing date-specific endpoint.
Uses `get_update_service` dependency (same pattern as other update
endpoints). Uses `WorkspaceMemberDep` for RBAC — this is the only update
endpoint that uses RBAC, which is why the integration test fixture
(`history_client`) patches `get_member` separately from `update_client`.

```python
@router.get("/{workspace_id}/updates/history", status_code=200)
async def get_update_history(
    api_version: ApiVersionDep,
    user_ctx: WorkspaceMemberDep,
    workspace_id: str,
    cursor: str | None = None,
    limit: int = 20,
    from_date: str | None = None,
    to_date: str | None = None,
    user_id: str | None = None,
    service: UpdateService = Depends(get_update_service),
) -> Response:
```

Response is flat (no `data` wrapper) — `create_success_response` calls
`model_dump()` directly, consistent with all other update endpoints.

---

### Step 3: Analytics Schemas ✅

```python
# apps/api/app/schemas/analytics.py

class HeatmapDay(BaseModel):
    date: str       # ISO YYYY-MM-DD
    count: int
    intensity: int  # 0-3

class StreakResponse(BaseModel):
    current_streak: int
    best_streak: int
    total_submissions: int
    last_submission_date: str | None

class PersonalAnalyticsResponse(BaseModel):
    streak: StreakResponse
    heatmap: list[HeatmapDay]
    heatmap_weeks: int = 52

class MemberParticipationRow(BaseModel):
    user_id: str
    full_name: str | None
    avatar_url: str | None
    current_streak: int
    participation_rate_30d: float
    submissions_30d: int
    sparkline: list[int]  # 14 elements, oldest→newest

class TeamAnalyticsResponse(BaseModel):
    participation_rate_30d: float
    avg_updates_per_day_30d: float
    active_member_count: int
    members: list[MemberParticipationRow]
    workspace_heatmap: list[HeatmapDay]
    workspace_heatmap_weeks: int = 12
```

---

### Step 4: Analytics Repository ✅

```python
# apps/api/app/repositories/analytics_repo.py

class AnalyticsRepository:
    async def get_user_submission_dates(
        self, workspace_id, user_id, from_date, to_date
    ) -> list[str]:
        # Descending order — used directly by _calculate_streak
        # Hits ix_updates_user_date

    async def get_workspace_daily_counts(
        self, workspace_id, from_date, to_date
    ) -> dict[str, int]:
        # {date_str: distinct_member_count}
        # Hits ix_updates_workspace_date

    async def get_member_submission_counts(
        self, workspace_id, user_id, from_date, to_date
    ) -> dict[str, int]:
        # {date_str: count} — sparse, missing days absent
        # Hits ix_updates_user_workspace

    async def get_workspace_total_updates(
        self, workspace_id, from_date, to_date
    ) -> int:
        # Total non-deleted updates for avg/day calculation
```

---

### Step 5: Analytics Service ✅

```python
# apps/api/app/services/analytics_service.py

def _intensity(count: int, max_count: int) -> int:
    # 0=none, 1=<33%, 2=33-67%, 3=>=67% (or any submission when max=1)

def _build_heatmap(
    submission_counts: dict[str, int],
    from_date: date,
    to_date: date,
) -> list[HeatmapDay]:
    # Fills every calendar day — missing dates get count=0, intensity=0

def _calculate_streak(
    submission_date_strs: list[str],
    digest_days: list[int] | None,
) -> tuple[int, int]:
    # Returns (current_streak, best_streak)
    # digest_days: ISO weekday ints (1=Mon..7=Sun), None = all days count
    # Walks backward through counting days only — non-digest days skipped
    # Saturday on Mon-Fri schedule does NOT break the streak
    # Safety cap: 730 iterations max
```

**Known limitation — `_calculate_streak` testability:**
`_calculate_streak` calls `datetime.now(UTC)` internally. The Saturday
edge case test (streak of 5 on Friday checked on Saturday) was removed
because `datetime` cannot be reliably patched at the module level for a
pure function. Fix deferred: add `today: date | None = None` parameter.
See `specs/scaling/api/history_analytics.md` Issue 2.

```python
class AnalyticsService:
    async def get_personal_analytics(self, workspace_id, user_id)
        -> PersonalAnalyticsResponse
    async def get_team_analytics(self, workspace_id)
        -> TeamAnalyticsResponse
```

`get_team_analytics` makes 2N queries per request (one `get_user_submission_dates`

- one `get_member_submission_counts` per member). Acceptable at current
  scale. See `specs/scaling/api/history_analytics.md` Issue 1.

---

### Step 6: Analytics Router ✅

```python
# apps/api/app/routers/analytics.py

@router.get("/{workspace_id}/analytics/personal")
# WorkspaceMemberDep — all members
# Returns PersonalAnalyticsResponse flat (no data wrapper)

@router.get("/{workspace_id}/analytics/team")
# WorkspaceAdminDep — admin and owner only, 403 for member role
# Returns TeamAnalyticsResponse flat (no data wrapper)
```

Registered in `main.py`:

```python
from app.routers import analytics
app.include_router(analytics.router, prefix="/api/v1")
```

Also added to `ProfileRepository`:

```python
async def get_by_user_ids(self, user_ids: list[str]) -> dict[str, Profile]:
    # Batch fetch — returns {user_id: Profile}
    # Used by get_update_history to avoid N+1 on author names
```

---

## Frontend — What Was Built

### Step 1: `useAnalytics.ts` ✅

5-minute stale time. Disabled when `workspaceId` or token absent. Full
TypeScript types for all response shapes. `analyticsKeys` exported for
future cache invalidation.

### Step 2: `useUpdateHistory.ts` ✅

`useInfiniteQuery` with `getNextPageParam` reading `next_cursor`. `DateRangePreset`
type (`'7d' | '30d' | '90d'`). `from_date` computed via `date-fns` `subDays`.
Query key includes date strings — key changes when preset changes, triggering
refetch. Key also changes at midnight, which is correct and desirable.

### Step 3: `heatmap.tsx` ✅

Pure SVG, no third-party chart library. Dark/light mode via `MutationObserver`
on `document.documentElement.classList`.

**SSR fix applied (from pre-build flags):**

```typescript
// SSR-safe lazy initializer — prevents flash of dark colors in light mode
const [isDark, setIsDark] = React.useState<boolean>(() =>
  typeof document !== "undefined"
    ? document.documentElement.classList.contains("dark")
    : true,
);
```

Colors are hardcoded hex (`#53ddfc` not `var(--color-primary)`) — SVG
`fill` attributes don't reliably support CSS custom properties across
all browsers. See `specs/scaling/web/history_analytics.md` Issue 2.

`data-testid="heatmap-cell"` and `data-intensity` on every `<rect>`.
SVG `<title>` provides tooltip across all browsers.

### Step 4: `streak-card.tsx` ✅

`data-testid="streak-badge"` and `data-testid="streak-count"`. Singular
"day" / plural "days" handled correctly.

### Step 5: `update-card-compact.tsx` ✅

Collapsed by default. Aligned with `UpdateCard` conventions:

- `Avatar` sub-component with `author_avatar_url` support and `next/image`
- `VoiceBadge` with `mic` material symbol + `border border-outline-variant`
  (not a rounded pill — matches `UpdateCard`)
- Summary: `border-l-2 border-primary pl-3` + `font-headline text-sm italic`
  (not `border-primary-container` — corrected to match `UpdateCard`)
- Summary gated on `status === 'processed'`
- `border border-outline-variant` card surface
- `data-testid="update-card-compact"` on the root div

Import from `@/hooks/useUpdates` (not `@/types/update` which does not exist).

### Step 6: `history/page.tsx` ✅ (full rewrite)

Preserves all existing Digests tab UI conventions from M6:

- `mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8` container
- `animate-pulse border border-outline-variant bg-surface-high` skeletons
- Material symbol empty states
- `type="button"` on all buttons
- Load more button with `hover:border-primary hover:text-primary` transitions
- Single-quote strings, numeric Tailwind sizing (`text-[13px]`)

All three tabs use lazy queries (only enabled when tab is active).
Team sub-tab hidden for non-admin via role check against `useWorkspaceMembers`.
`StatCard` and `MemberRow` use no border radius — consistent with 0px
card radius convention in Electric Atelier.

---

## Storybook Stories ✅

All four files follow the established pattern from `PageTransition.stories.tsx`:

- `@storybook/nextjs-vite` imports
- Inline `dark`/`light` decorator functions manipulating
  `document.documentElement.classList` directly
- `satisfies Meta` without generic type parameter
- Every story has an explicit `render` function with hardcoded fixture data
- Story names follow `'ComponentName — variant (Dark/Light)'` convention

```
src/stories/ui/Heatmap.stories.tsx
  PersonalFullDark/Light — 52 weeks varied
  PersonalEmptyDark/Light — 52 weeks all zero
  TeamDark/Light — 12 weeks
  FullIntensityDark — all cells max intensity

src/stories/ui/StreakCard.stories.tsx
  ActiveStreakDark/Light — 14 current, 21 best
  NoStreakDark/Light — 0 current, 8 best
  LongStreakDark — 112 days
  SingleDayDark — singular "day" label

src/stories/domain/updates/UpdateCardCompact.stories.tsx
  TextCollapsedDark/Light
  VoiceCollapsedDark/Light
  PendingDark
  ProcessingDark
  FeedDark/Light — three cards stacked

src/stories/pages/HistoryPage.stories.tsx
  WithDigestsDark/Light — existing M6 content preserved
  DigestsEmptyDark
  DigestsLoadingDark
  UpdatesTabDark/Light
  UpdatesTabEmptyDark
  UpdatesTabLoadingDark
  AnalyticsPersonalDark/Light
  AnalyticsPersonalLoadingDark
  AnalyticsTeamDark/Light
  MobileDark
```

---

## Unit Tests ✅

### Backend

**`tests/unit/test_analytics_repo.py`** — real DB tests via `db_session`
fixture with SAVEPOINT rollback. Covers all four repo methods including
soft-delete exclusion. Uses `_seed_update` helper with `flush()` not
`commit()`.

**`tests/unit/test_analytics_service.py`** — two sections:

- Pure function tests (`TestIntensity`, `TestBuildHeatmap`,
  `TestCalculateStreak`) — synchronous, no DB, no asyncio
- Service integration tests (`TestGetPersonalAnalytics`,
  `TestGetTeamAnalytics`) — patch `AnalyticsRepository.from_session`
  and `WorkspaceRepository.from_session` via `pytest.MonkeyPatch`

Saturday edge case test removed — `_calculate_streak` calls
`datetime.now(UTC)` internally making it untestable without refactor.
Note left in file pointing to scaling doc.

**`tests/integration/test_update_endpoints.py`** — `TestGetUpdateHistory`
added to existing file (not a new file). Uses `history_client` fixture
which patches `app.api.rbac.WorkspaceRepository.get_member` in addition
to the standard `update_client` setup — required because history endpoint
uses `WorkspaceMemberDep` unlike other update endpoints.

Response body accessed flat (`response.json()["field"]` not
`response.json()["data"]["field"]`) — consistent with `create_success_response`
calling `model_dump()` directly.

**`tests/integration/test_analytics_endpoints.py`** — new file following
`test_member_endpoints.py` pattern: `RBAC_GET_MEMBER` patch with `side_effect`,
minimal `FastAPI()` app with analytics router only, `AnalyticsService`
methods patched on the class.

### Frontend

**`tests/unit/useAnalytics.test.ts`** — `usePersonalAnalytics` and
`useTeamAnalytics`. Covers endpoint called, response shape, disabled
states, query key structure. Imports from `../mocks/user`.

**`tests/unit/useUpdateHistory.test.ts`** — `useUpdateHistory` infinite
query. Covers endpoint + params, `hasNextPage` based on `next_cursor`,
disabled states, different presets produce different query keys (pure
assertion — no async).

The 7d/90d date diff tests were removed — they relied on a `date-fns`
mock that made `from_date` and `to_date` identical, always returning
diff = 0. Replaced with a query key assertion which tests the actual
invariant.

**`tests/unit/update-card-compact.test.tsx`** — follows `update-card.test.tsx`
pattern with `vi.mock('next/image')` and `userEvent.setup()`. Covers
collapsed rendering, voice badge, expand/collapse, summary gating on
`status === 'processed'`, transcript section, fallback text.

Heatmap and StreakCard have no component unit tests — display-only
components with no interaction logic, consistent with project convention.

---

## Known Tradeoffs

**1. Team analytics makes 2N queries per request (one per member)**
`get_team_analytics` calls `get_user_submission_dates` and
`get_member_submission_counts` per member. For a 20-member workspace,
that's 40 queries. Acceptable at current scale — all queries hit indexes.
Fix post-M9: rewrite as two workspace-scoped GROUP BY queries.
See `specs/scaling/api/history_analytics.md` Issue 1.

**2. `_calculate_streak` not deterministically testable**
The function calls `datetime.now(UTC)` internally. The Saturday edge case
cannot be pinned in a unit test without adding `today: date | None = None`
as a parameter. Deferred — see `specs/scaling/api/history_analytics.md`
Issue 2.

**3. Heatmap colors are hardcoded hex, not CSS vars**
SVG `fill` attributes don't support CSS custom properties reliably.
Colors hardcoded: dark `#53ddfc` / light `#00687a` for full intensity,
scaled tints for lower intensities. Theme detection via MutationObserver.
See `specs/scaling/web/history_analytics.md` Issue 2.

**4. Analytics data is not real-time**
5-minute stale time. A user who submits and immediately views analytics
will see stale data. Acceptable — analytics are a reflection tool.
Fix post-M9: invalidate `analyticsKeys.personal` in `useSubmitUpdate`
`onSuccess`. See `specs/scaling/web/history_analytics.md` Issue 1.

**5. `total_in_range` is approximate**
`UpdateHistoryResponse.total_in_range` is the current page count, not a
full `COUNT(*)`. Named deliberately to communicate this.

**6. Member table has no sorting**
Spec called for sortable columns. Deferred — client-side sort requires
no backend changes. See `specs/scaling/web/history_analytics.md` Issue 6.

**7. Custom date range filter not built**
Spec listed a "Custom" date range option. Only `7d / 30d / 90d` presets
were built. Custom range deferred.

**8. Cursor is a raw UUID**
The `next_cursor` value is `update.id` (UUID) returned directly. API
hygiene tradeoff — base64 encoding deferred.
See `specs/scaling/api/history_analytics.md` Issue 5.

---

## Acceptance Criteria

```
[x] /history page has three tabs: Digests, Updates, Analytics
[x] Digests tab: existing digest cards, unchanged
[x] Updates tab: compact update cards, date range filter (7d/30d/90d)
[x] Updates tab: cursor-based "Load more" pagination
[x] Updates tab: empty state when no updates in range
[x] Analytics tab: My stats sub-tab visible to all members
[x] Analytics tab: Team sub-tab visible to admin/owner only
[x] Analytics tab: Team sub-tab hidden for member role
[x] My stats: streak card shows current streak, best streak, total
[x] My stats: streak respects workspace digest days config
[x] My stats: personal heatmap covers last 52 weeks
[x] My stats: heatmap intensity reflects submission count correctly
[x] Team: aggregate participation rate, avg updates/day, member count
[x] Team: per-member table with streak + 30d % + sparkline
[x] Team: workspace heatmap covers last 12 weeks
[x] Team: heatmap intensity reflects number of members who submitted
[x] GET /workspaces/:id/updates/history with cursor pagination works
[x] Cursor returns correct next page with stable ordering
[x] from_date + to_date filters return correct results
[x] GET /analytics/personal available to all workspace members
[x] GET /analytics/team returns 403 for member role
[x] All history query indexes present on updates + digests tables
[x] Backend unit tests pass for analytics repo + service + endpoints
[x] Frontend unit tests pass for hooks + UpdateCardCompact
[x] Storybook stories added for all new components
[ ] CI passes on feature/milestone-7 branch  ← pending smoke test
[ ] feature/milestone-7 merged to develop    ← pending smoke test

Deferred from spec:
[ ] Member table sortable by name/streak/participation  ← post-M9
[ ] Custom date range filter on Updates tab             ← post-M9
[ ] Analytics invalidated on update submission          ← post-M9
```

---

## Files Created / Modified

### Backend (apps/api/)

**Created:**

```
app/schemas/analytics.py
app/repositories/analytics_repo.py
app/services/analytics_service.py
app/routers/analytics.py
alembic/versions/*_add_history_indexes.py
tests/unit/test_analytics_repo.py
tests/unit/test_analytics_service.py
tests/integration/test_analytics_endpoints.py
```

**Modified:**

```
app/models/update.py             ← +3 indexes in __table_args__
app/models/digest.py             ← +2 indexes in __table_args__
app/repositories/update_repo.py  ← +get_workspace_updates_paginated
app/repositories/profile_repo.py ← +get_by_user_ids (batch fetch)
app/schemas/update.py            ← +UpdateHistoryResponse, UpdateHistoryParams
app/services/update_service.py   ← +get_update_history
app/routers/updates.py           ← +GET /updates/history endpoint
app/main.py                      ← +analytics router registration
tests/integration/test_update_endpoints.py
                                 ← +TestGetUpdateHistory class
                                 ← +history_client fixture
                                 ← +get_update_history to _make_mock_update_service
                                 ← +UpdateHistoryResponse import
```

### Frontend (apps/web/src/)

**Created:**

```
hooks/useAnalytics.ts
hooks/useUpdateHistory.ts
components/ui/heatmap.tsx
components/ui/streak-card.tsx
components/domain/updates/update-card-compact.tsx
stories/ui/Heatmap.stories.tsx
stories/ui/StreakCard.stories.tsx
stories/domain/updates/UpdateCardCompact.stories.tsx
tests/unit/useAnalytics.test.ts
tests/unit/useUpdateHistory.test.ts
tests/unit/update-card-compact.test.tsx
```

**Modified:**

```
app/(app)/history/page.tsx        ← full rewrite — three tabs
stories/pages/HistoryPage.stories.tsx
                                  ← extended — Updates + Analytics stories added
                                  ← M6 digest stories preserved unchanged
```

### Specs

**Created:**

```
specs/scaling/api/history_analytics.md   ← 7 issues, pre-production checklist
specs/scaling/web/history_analytics.md   ← 7 issues, pre-production checklist
```
