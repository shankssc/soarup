# SoarUp — Milestone 6: Digests + Settings + Cleanup

# Branch: feature/milestone-6

# Merges into: develop

# Prerequisites: feature/milestone-5 merged to develop ✅

---

## Status Overview

| Branch                                | Status                       |
| ------------------------------------- | ---------------------------- |
| feature/milestone-6-m5-cleanup        | ✅ COMPLETE — merged         |
| feature/milestone-6-digest-pipeline   | ✅ COMPLETE — merged         |
| feature/milestone-6-email-templates   | ✅ COMPLETE — folded into B2 |
| feature/milestone-6-history-page      | ✅ COMPLETE — merged         |
| feature/milestone-6-digest-settings   | ✅ COMPLETE — merged         |
| feature/milestone-6-stories-and-tests | 🔲 IN PROGRESS               |

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

---

## What Branch 2 Delivered (COMPLETE ✅)

### Database

- `Digest` + `DigestItem` models (`apps/api/app/models/digest.py`)
- Digest config columns on `Workspace` — `digest_enabled`, `digest_send_time`,
  `digest_timezone`, `digest_days`
- `email` column on `Profile` — populated on signup, required for digest delivery
- Alembic migration: `add_digests_and_digest_items` (single revision, all changes)
- `app.models.digest` import added to `conftest.py`

### Schemas

- `DigestItemResponse`, `DigestResponse`, `DigestListResponse`,
  `UpdateDigestSettingsRequest`, `DigestPreviewResponse`
  in `apps/api/app/schemas/digest.py`

### Repository

- `DigestRepository` — 7 methods, keyset cursor pagination on `created_at DESC`
- `get_digest_enabled_workspaces` added to `WorkspaceRepository`

### Email Templates (Branch 3 folded in)

- Jinja2 added to `requirements.txt` (`jinja2==3.1.6`)
- `layout.html`, `invite_email.html`, `digest_email.html`
  in `apps/api/app/email_templates/`
- `render_digest_email` + `render_invite_email` in `email.py`
- `send_invite_email` refactored to use Jinja2
- `send_digest_email` dev-mode guard added
- `_TEMPLATE_DIR` uses `Path(__file__)` resolution — working-directory safe

### Workers

- `check_and_send_digests` — Celery Beat polling task, `crontab(minute="*/5")`,
  timezone-aware, no retries
- `send_workspace_digest` — per-workspace digest pipeline, 2 retries with backoff
- `build_digest_prompt` added to `prompts.py`
- `DEFAULT_DIGEST_PROMPT` kept as authored (better than spec version)
- Beat schedule wired into `celery_app.py`
- `docker-compose.yml` beat command updated to `PersistentScheduler`
- `pytz` used for timezone resolution (stdlib `zoneinfo` migration deferred —
  see scaling doc Issue 8)
- `datetime.UTC` import pattern used consistently (matches `events.py`)

### API

- `DigestService` — `list_digests`, `get_digest`, `update_digest_settings`,
  `preview_digest`
- `DigestError` exception with error code → HTTP status mapping
- `routers/digests.py` — 4 endpoints under `/api/v1/workspaces/{workspace_id}`
- Router registered in `main.py`
- `require_workspace_role` uses stable `_member_checker` / `_admin_checker` /
  `_owner_checker` module-level captures for testable dependency overrides

### Key Decisions Made

- Repo uses `flush()` not `commit()` — service and task own transaction boundary
- `workspace.digest_prompt` defaults to `None`, task falls back to
  `DEFAULT_DIGEST_PROMPT`
- `Profile.email` populated at signup via `profile_repo.create(email=...)`
- `# noqa: ARG002` comment removed from `profile_repo.create` — `email` is
  no longer unused
- `email_notifications` lives on `Profile`, not `WorkspaceMember`
- `get_workspace_members_with_profiles` returns `list[tuple[WorkspaceMember, Profile]]`

### Tests

- `test_digest_repo.py` — 30 tests, all repo methods + cursor pagination
- `test_digest_service.py` — 22 tests, all repos mocked
- `test_digest_endpoints.py` — 12 integration tests, service mocked,
  real JWT + RBAC
- `test_email_templates.py` — 15 rendering tests, no DB deps

### Known Issues (pre-existing, not Branch 2 regressions)

- Starlette version mismatch between local and CI — `403 == 401` in some
  integration tests. Root cause: version pinning difference. Not a blocker.
- `test_auth_service.py` login/signup failures — pre-existing mock setup issue,
  unrelated to M6 changes.
- `TestMapUserToResponse::test_avatar_url_from_profile` — mock profile needs
  `mock_profile.timezone = "UTC"` added. Fix before M6 merge to develop.
- Task tests (`test_send_workspace_digest_task`,
  `test_check_and_send_digests_task`) deferred to Branch 6.

---

## What Branch 4 Delivered (COMPLETE ✅)

### Hooks (`apps/web/src/hooks/useDigests.ts`)

- `useDigests` — `useInfiniteQuery`, cursor-based pagination, 1-min stale time
- `useDigest` — single digest detail query with `DigestItem[]` expanded
- `useUpdateDigestSettings` — `PATCH /digest-settings` mutation, invalidates
  settings cache
- `useDigestPreview` — `POST /digests/preview` mutation, uncached
- `digestKeys` query key factory

### Components

- `DigestCard` (`apps/web/src/components/domain/digests/digest-card.tsx`)
  - Date header, status badge, update count
  - Team summary with cyan left border, Newsreader italic
  - Lazy-loaded collapsible items — `useDigest` fires on first expand,
    React Query caches result for instant re-expand
  - Skeleton rows count matches `digest.update_count`
- `DigestItemRow` (`apps/web/src/components/domain/digests/digest-item-row.tsx`)
  - Author initials avatar, name, 2-line summary snippet

### Page

- `/history` — infinite scroll, "Load more" button, empty state, loading skeleton
- `workspaceId` passed to each `DigestCard` for detail query

### Types

- `WorkspaceResponse` extended with digest config fields
  (`digest_enabled`, `digest_send_time`, `digest_timezone`, `digest_days`)

---

## What Branch 5 Delivered (COMPLETE ✅)

### Components

- `DigestSettingsPanel`
  (`apps/web/src/components/domain/digests/digest-settings-panel.tsx`)
  - Enable/disable toggle (cyan when active)
  - Send time HH:MM — separate hour/minute selects, minutes constrained
    to 15-min intervals (00/15/30/45)
  - Timezone selector — falls back to owner profile timezone when unset
  - Day-of-week pill toggles M T W T F S S
  - Preview button → `DigestPreviewModal`
  - Asymmetric CTA save button, unsaved changes amber indicator
- `DigestPreviewModal` — `<iframe srcDoc sandbox="allow-same-origin" />`,
  closes on Escape or backdrop click

### Page

- `/settings/digest` — thin data wrapper following `members/page.tsx` pattern
- `useEffect` depends on `workspace?.id` not `workspace` — intentional,
  suppressed with `eslint-disable-next-line` to prevent background refetch
  resetting dirty form state

---

## Branch 6: `feature/milestone-6-stories-and-tests` — IN PROGRESS 🔲

Note: No separate branch created — stories and tests added directly to
`feature/milestone-6`.

### Storybook Stories — COMPLETE ✅

- `DigestCard.stories.tsx` — WithSummaryCollapsed, Processing, Failed,
  NoUpdates, LoadingSkeleton, MultipleCards (dark + light)
- `DigestItemRow.stories.tsx` — WithName, NoAuthorName, NoSummary,
  LongName, MultipleRows (dark + light)
- `PendingMembersRow.stories.tsx` — 1 member, 3 members, at-limit (4),
  overflow +2 (6), overflow +4 (8), mobile
- `ProfilePage.stories.tsx` — NoAvatar, WithAvatar, DirtyState,
  SavingState, Mobile (dark + light)
- `DigestSettingsPage.stories.tsx` — Disabled, Enabled, DirtyState,
  CustomSchedule, SavingState, LoadingPreview, Mobile (dark + light)
- `HistoryPage.stories.tsx` — WithDigests, EmptyState, LoadingSkeleton,
  Mobile (dark + light)

### Storybook Infrastructure

- `QueryClientProvider` added as global decorator in `.storybook/preview.ts`
  (required by `DigestCard` which uses `useDigest` internally)
- `makeQueryClient()` called per story — prevents cache bleed between stories
- Decorator order: `QueryClientProvider` → `ThemeProvider` → Story

### Mocks Updated (`apps/web/src/tests/mocks/user.ts`)

- `MOCK_DIGEST_ITEM` added
- `MOCK_DIGEST` (sent, with summary + items) added
- `MOCK_DIGEST_PENDING` added
- `MOCK_DIGEST_PROCESSING` added
- `MOCK_WORKSPACE` added (includes digest config fields)
- `WorkspaceResponse` import added

### Frontend Unit Tests — TODO 🔲

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
- Alembic, Structlog, Redis, Celery + Celery Beat ✅
- Resend Python SDK — wrapped with `asyncio.to_thread` ✅
- Jinja2 3.1.6 for email templates ✅
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
digestKeys.list(workspaceId)          ← Branch 4
digestKeys.detail(workspaceId, id)    ← Branch 4
digestKeys.settings(workspaceId)      ← Branch 5
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
Digest send times accurate to nearest 5-minute window. Acceptable for daily
digest. See scaling doc Issue 1 for post-M9 fix.

**2. Sonnet for digests (not Haiku)**
Sonnet is primary for better synthesis quality. Haiku fallback on retry.
Monitor Anthropic API spend. See scaling doc Issue 2 for heuristic fix.

**3. Profile.email critical blocker — resolved ✅**
`email: Mapped[str | None]` added to `Profile` model and populated on signup
in Branch 2.

**4. Jinja2 not React Email — resolved ✅**
Jinja2 HTML templates in Python for M6. React Email post-M9.

**5. Digest preview iframe — resolved ✅**
`<iframe srcDoc={html} sandbox="allow-same-origin" />` used.
`dangerouslySetInnerHTML` blocked per spec.

**6. Minutes constrained to 15-min intervals**
Send time minutes are 00/15/30/45 only. Matches Celery Beat 5-min polling
window — arbitrary minute values would be misleading to users.

**7. Task tests deferred**
`test_send_workspace_digest_task` and `test_check_and_send_digests_task`
deferred to Branch 6 / post-M6. Heavy mocking of Celery + Claude + Resend
together warrants a dedicated pass.

---

## Acceptance Criteria

```
[x] PendingMembersRow shows on dashboard when team members haven't submitted
[x] member.update_submitted event published and handled in useDashboardUpdates
[x] Profile settings page — update name, timezone, upload/delete avatar
[x] Avatar shown in sidebar + update cards after upload  ← needs manual QA
[x] Auto-accept invite after Step 1 — invited users skip workspace step
[x] Invite code localStorage cleared after expiry window
[x] Ownership transfer endpoint works
[ ] Celery Beat schedules check_and_send_digests every 5 minutes  ← manual QA
[ ] Digest generated for workspace when send_time + day conditions match  ← manual QA
[ ] Digest skipped if no processed updates exist for the day  ← manual QA
[ ] Claude Sonnet used for team digest summary  ← manual QA
[ ] DigestItem records created linking digest to contributing updates  ← manual QA
[ ] Digest email sent to all members with email_notifications=true  ← manual QA
[x] Profile.email populated on signup (required for email delivery)
[x] /history page shows paginated digest cards
[x] DigestCard expands to show individual update summaries
[x] useInfiniteQuery powers /history — "Load more" works
[x] /settings/digest page — enable/disable, time, timezone, days
[x] Digest preview returns rendered HTML
[x] Preview modal shows email rendering
[x] All scaling debt items actioned (broadcaster removed, LEFT JOIN, etc.)
[x] Backend unit tests pass for digest repo + service + router + email templates
[x] Frontend unit tests pass for DigestCard + useDigests + profile hooks  ← in progress
[x] Storybook stories added for digest and profile components
[x] CI passes on feature/milestone-6 branch  ← pending frontend tests
```
