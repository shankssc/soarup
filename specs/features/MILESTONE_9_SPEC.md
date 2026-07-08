# SoarUp — Milestone 9: Public Profile

# Branch: feature/milestone-9

# Merges into: develop

# Prerequisites: feature/milestone-8 merged to develop ✅

# Status: COMPLETE ✅

# Completed: 2026-07-08

---

## What This Milestone Delivers

### Pre-checklist (all complete ✅)

1. Block Kit text truncation utility (#91) ✅
2. Platform flag guard in Celery Slack blocks (bundled with #9) ✅
3. Inline webhook URL validation on settings page (#98) ✅
4. Auto-clear Slack test result after 8 seconds (#99) ✅
5. Replace inline SVG Slack badge with Material Symbol (#100) ✅
6. Disable Cancel button during remove mutation (#101) ✅
7. Replace sync boto3 with aioboto3 in Celery audio task (#9) ✅
8. Add Postgres trigger for updated_at (#23) ✅
9. Remove total_in_range from UpdateHistoryResponse (#69) ✅
10. Invalidate analyticsKeys.personal after update submission (#78) ✅

> Note: Issue numbers in the original spec were placeholders. Real GitHub
> issue numbers: #91 (was #85), #98 (was #92), #99 (was #93), #100 (was #94),
> #101 (was #95). Platform flag guard had no GitHub issue — bundled into #9.
> #78 was labeled post-m9 in GitHub but included in pre-checklist per spec.

### Core M9 Features (all complete ✅)

11. Username field on Profile — validated, unique, GitHub-style rules ✅
12. Bio and tagline optional fields on Profile ✅
13. Debounced username availability check with inline feedback ✅
14. Public profile toggle on /settings/profile — disabled until username saved ✅
15. Public profile at /u/:username — unauthenticated, shareable ✅
16. Heatmap on public profile aggregated across all user workspaces ✅
17. OpenGraph metadata for link preview cards ✅
18. Empty state toast when profile has zero activity ✅
19. /auth/check-username endpoint — unauthenticated, excludes own username ✅

### Additional Deliverables (beyond original spec)

20. `expand_circle_down` icon replacing `expand_more` in digest-card expand toggle ✅
21. Scaling & technical debt docs for API and web public profile pipeline ✅
    - `specs/scaling/api/public_profile.md`
    - `specs/scaling/web/public_profile.md`

---

## Branch Strategy

```
develop
└── feature/milestone-9                          ✅ merged to develop
    ├── feature/milestone-9-prechecklist         ✅ merged
    ├── feature/milestone-9-profile-model        ✅ merged (done on feature/milestone-9 directly — process note below)
    ├── feature/milestone-9-public-page          ✅ merged
    ├── feature/milestone-9-settings             ✅ merged
    └── feature/milestone-9-stories-tests        ✅ merged
```

> Process note: `feature/milestone-9-profile-model` work was committed
> directly to `feature/milestone-9` rather than the sub-branch. No code
> impact — all changes are correct and present on the branch.

---

## Deviations from Original Spec

### Schema architecture — UpdateProfileRequest consolidated

The original spec added `UpdateProfileRequest` to `schemas/auth.py`. During
implementation it was found that `schemas/profile.py` already had an
`UpdateProfileRequest` and `ProfileService` already handled `PATCH /auth/profile`
via `ProfileService.update_profile`. Rather than create a parallel update path
through `AuthService`, the existing `UpdateProfileRequest` in `schemas/profile.py`
was extended with the M9 fields (username, bio, tagline, profile_public) and
`ProfileService.update_profile` was extended with the username uniqueness and
`profile_public` guard logic. `AuthService.patch_profile` was not created.

### `PublicProfileResponse` uses `dict[str, Any]` for streak and heatmap

To avoid circular imports between `schemas/auth.py` and `schemas/analytics.py`,
`PublicProfileResponse.streak` and `PublicProfileResponse.heatmap` are typed
as `dict[str, Any]` and `list[dict[str, Any]]` respectively. The serialised
shape is identical at runtime.

### `next/image` used instead of `<img>` in PublicProfileClient

The spec used a plain `<img>` tag for the avatar. Implementation uses
`next/image` to avoid the eslint `no img element` warning. Safe with
`unoptimized: true` in `next.config.mjs` (Cloudflare Pages handles
optimization).

### `expand_circle_down` icon in digest-card

During pre-checklist review, the `expand_more` chevron in `digest-card.tsx`
was swapped to `expand_circle_down` for a more polished look. Not in the
original spec — added during the pre-checklist pass.

### Storybook stories use static render components

The spec listed story names only. Implementation uses the same static
render component pattern as existing stories (e.g. `ProfilePage.stories.tsx`)
rather than mocking hooks. All story variants from the spec are present.

### Toast stories include `duration={999999}` to prevent auto-dismiss

In Storybook, the 6-second auto-dismiss would fire during story render.
All Toast stories pass `duration={999999}` to keep the toast visible for
inspection.

### `PublicProfileClient.test.tsx` — 404 assertion uses regex `.` wildcard

The original spec matcher `/doesn't exist or hasn't been made public/i`
failed because jsdom renders apostrophes as backticks in the test DOM.
Fixed with `/profile doesn.t exist or hasn.t been made public/i`.

---

## Implementation Notes

### Database migrations applied

```
4783b311c920 → fb090fad7a42  add_username_bio_tagline_profile_public_to_profiles
dc04381d2f54 → a1b2c3d4e5f6  add_updated_at_trigger
```

> `fb090fad7a42` required manual addition of `server_default=sa.text('false')`
> to the `profile_public` column before running `upgrade head` — autogenerate
> omits server_default for non-nullable Boolean columns with existing rows.

### Supabase client uses anon key — admin user fetch not available

`AuthRepository` uses the Supabase anon key, not the service role key.
`admin.get_user_by_id` would return 403. `patch_profile` constructs the
`UserResponse` directly from the profile object rather than re-fetching
from Supabase:

```python
return self._map_user_to_response(
    {"id": user_id, "email": profile.email or "", "email_confirmed_at": True},
    profile,
)
```

### `profile_public` toggle fires immediately (not part of Save flow)

The public profile toggle in `/settings/profile` calls `updateProfile.mutate`
directly on click. Username, bio, and tagline go through the Save button.
This is intentional — toggling visibility is an action, not a form field.

---

## Files Created

### Backend (apps/api/)

```
app/routers/public_profiles.py                                           ✅
alembic/versions/20260702_*_add_username_bio_tagline_profile_public.py   ✅
alembic/versions/a1b2c3d4e5f6_add_updated_at_trigger.py                 ✅
tests/unit/test_username_validation.py                                   ✅
tests/integration/test_public_profile_endpoint.py                        ✅
tests/integration/test_check_username_endpoint.py                        ✅
```

> Note: `test_public_profile_endpoint.py` and `test_check_username_endpoint.py`
> were placed in `tests/integration/` not `tests/unit/` — both test HTTP
> endpoints against a real DB session and belong in the integration folder.

### Frontend (apps/web/src/)

```
app/u/[username]/page.tsx                              ✅
app/u/[username]/client.tsx                            ✅
components/ui/toast.tsx                                ✅
hooks/usePublicProfile.ts                              ✅
hooks/useDebounce.ts                                   ✅
stories/pages/PublicProfilePage.stories.tsx            ✅
stories/ui/Toast.stories.tsx                           ✅
tests/unit/usePublicProfile.test.ts                    ✅
tests/unit/useDebounce.test.ts                         ✅
tests/unit/PublicProfileClient.test.tsx                ✅
```

> Note: `tests/unit/Toast.test.tsx` was scoped out — Toast is stateless
> enough that component tests were not added. `PublicProfileClient.test.tsx`
> covers the toast integration via mocked Toast component.

### Updated Files

```
apps/api/app/models/profile.py                ← +username, +bio, +tagline, +profile_public
apps/api/app/schemas/auth.py                  ← +validate_username, +PublicProfileResponse,
                                                 +UsernameAvailabilityResponse,
                                                 +UserResponse M9 fields
apps/api/app/schemas/profile.py               ← +UpdateProfileRequest M9 fields,
                                                 +ProfileResponse M9 fields
apps/api/app/repositories/profile_repo.py     ← +get_by_username, +is_username_taken,
                                                 +func import
apps/api/app/repositories/analytics_repo.py   ← +get_user_submission_dates_all_workspaces
apps/api/app/services/analytics_service.py    ← +get_public_profile_analytics
apps/api/app/services/profile_service.py      ← +username uniqueness check,
                                                 +profile_public guard in update_profile,
                                                 +M9 fields in get_profile
apps/api/app/routers/auth.py                  ← +GET /check-username endpoint
apps/api/app/routers/public_profiles.py       ← new file registered in main.py
apps/api/app/main.py                          ← +public_profiles router
apps/api/app/workers/tasks.py                 ← aioboto3 swap, platform flag guards,
                                                 duplicate author_name cleanup
apps/api/app/lib/slack_blocks.py              ← +_truncate utility
apps/api/app/schemas/update.py                ← -total_in_range
apps/api/tests/conftest.py                    ← +M9 fields in UserResponse + ProfileResponse helpers
apps/api/tests/unit/test_profile_repo.py      ← +TestGetByUsername, +TestIsUsernameTaken
apps/api/tests/unit/test_analytics_service.py ← +TestGetPublicProfileAnalytics
apps/api/tests/unit/test_analytics_repo.py    ← +TestGetUserSubmissionDatesAllWorkspaces
apps/api/tests/unit/test_profile_service.py   ← +_mock_profile M9 fields,
                                                 +username/profile_public tests
apps/web/src/lib/api/client.ts                ← +getPublic method
apps/web/src/middleware.ts                    ← +/u/* public route comment
apps/web/src/hooks/useAuth.ts                 ← +M9 fields in UserProfile interface
apps/web/src/hooks/useProfileSettings.ts      ← +M9 fields in useUpdateProfile
apps/web/src/hooks/useUpdates.ts              ← +analyticsKeys invalidation in onSuccess
apps/web/src/hooks/useUpdateHistory.ts        ← -total_in_range
apps/web/src/app/(app)/settings/profile/page.tsx  ← +username, +bio, +tagline,
                                                      +public toggle
apps/web/src/app/(app)/settings/slack/page.tsx    ← #98 validation, #99 auto-clear,
                                                      #101 Cancel disable
apps/web/src/components/domain/digests/digest-card.tsx  ← #100 Material Symbol badge,
                                                            expand_circle_down icon
apps/web/src/stories/settings/ProfilePage.stories.tsx   ← +M9 stories
apps/web/tests/mocks/user.ts                            ← +M9 fields in MOCK_USER
```

---

## Acceptance Criteria

```
[x] Pre-checklist items #91, #98, #99, #100, #101 completed
[x] Pre-checklist items #9 (+ platform flag guard), #23, #69, #78 completed
[x] username field added to Profile model (unique, indexed)
[x] bio and tagline optional fields added to Profile model
[x] profile_public boolean added to Profile model
[x] PATCH /auth/profile accepts username, bio, tagline, profile_public
[x] Username validation: 3-30 chars, lowercase alphanumeric + hyphens
[x] Cannot start or end with hyphen, no consecutive hyphens
[x] Username uniqueness enforced at DB level (UNIQUE constraint)
[x] GET /auth/check-username unauthenticated endpoint works
[x] Own username shows as available (exclude_user_id logic)
[x] Cannot enable profile_public without username set
[x] GET /api/v1/profiles/:username returns 200 when profile_public=True
[x] GET /api/v1/profiles/:username returns 404 when profile_public=False
[x] Public profile response never includes email field
[x] Heatmap aggregated across all user workspaces
[x] Streak uses calendar days on public profile
[x] /u/:username page renders without authentication
[x] OpenGraph metadata generated server-side for link previews
[x] OG title includes name + streak
[x] OG description includes total submissions + bio
[x] 404 state shown when profile not found or not public
[x] Loading skeleton shown while data fetches
[x] Empty state toast shown when total_submissions=0
[x] Toast auto-dismisses after 6 seconds
[x] Toast dismissible manually
[x] /settings/profile has username input at top
[x] Debounced availability check fires after 500ms
[x] Green checkmark shown when username available
[x] Red X shown when username taken
[x] Own username shows green checkmark (not "taken")
[x] Bio and tagline inputs optional, no validation required
[x] Public profile toggle disabled until username is saved
[x] Shareable URL shown when profile is public
[x] Copy link button copies full URL to clipboard
[x] View profile link opens /u/:username in new tab
[x] Middleware carves out /u/* as public route
[x] Backend unit tests pass for profile repo + validation + endpoints
[x] Frontend unit tests pass for hooks + PublicProfileClient
[x] Storybook stories added for public profile page + profile settings
[x] CI passes on feature/milestone-9 branch
```

---

## Known Tradeoffs

**1. OG image is the user's avatar, not a generated card**
Dynamic OG image generation (e.g. via Vercel OG or Satori) would produce
a richer preview with the heatmap rendered as an image. Using the avatar
is simpler and sufficient for M9. Post-launch if link previews become a
growth driver, revisit with a generated card. Tracked in
`specs/scaling/web/public_profile.md` Issue 1.

**2. Public profile analytics uses calendar days, not workspace digest days**
Cross-workspace streak calculation uses calendar days since the user may
belong to workspaces with different digest schedules. A user who submits
Mon-Fri in workspace A and Mon-Wed in workspace B gets a calendar-day
streak. Slightly less meaningful for teams but more honest for a public
profile that crosses workspace boundaries.

**3. Server-side fetch for OG metadata is not cached at the CDN layer**
`generateMetadata` fetches the profile server-side with `revalidate: 300`
(5 minutes). This means OG metadata is at most 5 minutes stale. Acceptable
for streak/bio data that changes infrequently. Tracked in
`specs/scaling/api/public_profile.md` Issue 2.

**4. Username is globally unique across all workspaces**
A user who is a member of multiple workspaces has one username for their
public profile regardless of which workspace they're most active in.
Correct and intentional — the public profile is identity-level, not
workspace-level.

**5. Toast component is minimal — not a full toast system**
The Toast component built in M9 handles the empty state case only. A full
toast system (multiple simultaneous toasts, different variants, positioning
options) is post-M9 if other parts of the app need toast notifications.
Tracked in `specs/scaling/web/public_profile.md` Issue 3.

**6. Race condition on username claim surfaces as 500**
Username availability is checked before commit. A concurrent claim between
check and commit raises an `IntegrityError` that is not currently caught
and mapped to a clean error response. Near-zero probability at current scale.
Tracked in `specs/scaling/api/public_profile.md` Issue 3.

**7. `/check-username` has no rate limiting**
The unauthenticated endpoint could be used to enumerate taken usernames.
Low risk — usernames are semi-public by design. Tracked in
`specs/scaling/api/public_profile.md` Issue 4.

---

## Post-M9 Backlog (from scaling docs)

### High priority (near-zero effort)

- Catch `IntegrityError` on username commit → map to `ProfileError("username_taken")`
- Add `isError` branch to `UsernameIndicator` (falls through to "taken" silently)
- Add `app/u/[username]/loading.tsx` to eliminate FOUC on first load

### Medium priority

- Add rate limiting to `/check-username` endpoint
- Add Redis cache to `get_public_profile_analytics` (5-min TTL)
- Implement Vercel OG image generation for profile link previews
- Add confirmation step when enabling `profile_public` toggle

### Lower priority

- Pass server-fetched profile as `initialData` to eliminate double fetch
- Decide on duplicate-day cross-workspace heatmap semantics
- Evaluate `sonner` or custom toast system for post-M9 toast needs
