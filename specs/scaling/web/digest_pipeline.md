# SoarUp — Scaling & Technical Debt: Digest Pipeline (Web)

# Path: specs/scaling/web/digest_pipeline.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 6

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the digest frontend introduced in Milestone 6.
This covers `useDigests.ts`, `DigestCard.tsx`, `DigestItemRow.tsx`,
`digest-settings-panel.tsx`, `history/page.tsx`, and
`settings/digest/page.tsx`. Items are ordered by expected impact, not
urgency. None of these are blockers for early-stage use.

---

## Issue 1 — Digest Settings Form Not Initialised from Server State on Navigation

**Where:** `apps/web/src/app/(app)/settings/digest/page.tsx`

**What:** The digest settings form is initialised from `workspace` data via
a `useEffect` that depends on `workspace?.id`. This correctly handles the
initial load but has one edge case: if the user navigates away from
`/settings/digest`, modifies digest settings from another browser tab, and
navigates back, the form will not re-sync because `workspace?.id` has not
changed — only the workspace field values have changed.

```typescript
// Current — only re-syncs on workspace identity change, not field changes
React.useEffect(() => {
  if (!workspace) return;
  setValues({...});
  setIsDirty(false);
}, [workspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

This was an intentional decision to prevent React Query background refetches
from resetting unsaved form state mid-edit.

**Impact:** Low — multi-tab concurrent editing of workspace settings is an
unlikely edge case in small teams. The stale form will show outdated values
until a full page reload.

**Fix:** Add a page visibility listener that re-syncs form state when the
tab becomes visible, but only if `isDirty` is false (no unsaved changes):

```typescript
React.useEffect(() => {
  function onVisible() {
    if (!isDirty)
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
  }
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}, [isDirty, queryClient]);
```

**Effort:** Low — one visibility listener.

---

## Issue 2 — `useDigest` Detail Query Fired Per Card on Expand — No Prefetch

**Where:** `apps/web/src/components/domain/digests/digest-card.tsx`
→ lazy load on expand

**What:** Each `DigestCard` fires a separate `GET /workspaces/{id}/digests/{digest_id}`
request on first expand. On the history page with 20 digests visible, a user
who expands all cards will fire 20 sequential detail requests. React Query
deduplicates concurrent identical requests but not requests for different
digest IDs.

```typescript
// Current — one request per card, triggered on expand
const { data: detailData, isLoading: isLoadingItems } = useDigest(
  fetchEnabled ? workspaceId : undefined,
  fetchEnabled ? digest.id : undefined,
);
```

**Impact:** Low — users rarely expand all digest cards at once. Each request
is small (a few KB of JSON). The skeleton loading state handles the latency
gracefully.

**Fix (post-M9):** Prefetch the top N digest details (e.g. the 3 most recent)
on history page load using `queryClient.prefetchQuery`. Users who open the
page and immediately expand the latest digest see instant content.

**Effort:** Low — `prefetchQuery` call in `history/page.tsx` after initial
digest list loads.

---

## Issue 3 — History Page Has No Date Filtering or Search

**Where:** `apps/web/src/app/(app)/history/page.tsx`

**What:** The history page shows all digests in reverse chronological order
with a "Load more" cursor-pagination button. There is no way to filter by
date range, status, or search by summary content. A workspace that has been
active for 6 months will have 130+ digest cards with no way to jump to a
specific week.

**Impact:** Low at early stage — few enough digests that scrolling is
acceptable. Becomes a usability problem at 3+ months of history.

**Fix (post-M9):** Add a date range picker and status filter above the digest
list. Pass `from_date`, `to_date`, and `status` as query params to
`GET /workspaces/{id}/digests`. Requires corresponding filter params on the
backend list endpoint.

**Effort:** Medium — date picker UI + backend query filter support.

---

## Issue 4 — Digest Settings Page Has No Optimistic Update on Save

**Where:** `apps/web/src/app/(app)/settings/digest/page.tsx` → `handleSave`

**What:** `handleSave` calls `updateSettings.mutateAsync(...)` and waits for
the server response before clearing `isDirty`. The save button shows
"Saving..." during the request (typically 200-500ms). There is no optimistic
update — the UI does not immediately reflect the saved state.

```typescript
// Current — waits for server response before clearing dirty state
async function handleSave() {
  await updateSettings.mutateAsync({...});
  setIsDirty(false);
}
```

**Impact:** Low — 200-500ms save latency is imperceptible for a settings
form. No user-facing issue.

**Fix:** Apply optimistic update via `onMutate` in `useUpdateDigestSettings`:

```typescript
onMutate: async (payload) => {
  await queryClient.cancelQueries({ queryKey: workspaceKeys.mine() });
  const previous = queryClient.getQueryData(workspaceKeys.mine());
  queryClient.setQueryData(workspaceKeys.mine(), (old) => ({ ...old, ...payload }));
  return { previous };
},
onError: (_, __, context) => {
  queryClient.setQueryData(workspaceKeys.mine(), context?.previous);
},
```

**Effort:** Low — standard React Query optimistic update pattern.

---

## Issue 5 — Preview Modal Uses `srcDoc` Which Loads Full HTML Per Open

**Where:** `apps/web/src/components/domain/digests/digest-settings-panel.tsx`
→ `DigestPreviewModal`

**What:** The preview modal renders the digest email HTML via
`<iframe srcDoc={html} sandbox="allow-same-origin" />`. The `srcDoc` content
is the full email HTML string (typically 5-15KB). Every time the modal is
opened, the iframe re-parses and renders the full HTML. If the user opens
and closes the preview modal repeatedly, the preview HTML is regenerated
via a new Claude API call each time (because `useDigestPreview` is a
mutation with no caching).

```typescript
// Current — new Claude call on every preview click
async function handlePreviewClick() {
  await onPreview(); // fires POST /digests/preview → Claude
  setShowPreview(true);
}
```

**Impact:** Low — preview is an intentional admin action, not a frequent
operation. Claude API cost per preview call is negligible.

**Fix:** Cache the preview result in component state and only regenerate
when the user explicitly clicks a "Regenerate" button:

```typescript
// Only call onPreview() if no cached HTML or user explicitly refreshes
async function handlePreviewClick() {
  if (!previewHtml) await onPreview();
  setShowPreview(true);
}
```

The page already stores `previewHtml` in state — this is a one-line guard.

**Effort:** Near-zero — one conditional check before calling `onPreview`.

---

## Issue 6 — `useInfiniteQuery` Total Count Comes From First Page Only

**Where:** `apps/web/src/hooks/useDigests.ts` → `useDigests`
and `apps/web/src/app/(app)/history/page.tsx`

**What:** The history page displays "N digests generated" using
`data?.pages[0]?.total`. The `total` field comes from the first page of
the infinite query response. If digests are generated while the user is
on the history page (e.g. a new digest arrives during their session), the
`total` shown will be stale until the user refreshes the page. The new
digest will not appear in the list automatically.

```typescript
// Current — total from first page, stale after new digest arrives
const total = data?.pages[0]?.total ?? 0;
```

**Impact:** Low — digests are generated once daily. The stale count is a
minor cosmetic issue.

**Fix:** Invalidate `digestKeys.list(workspaceId)` when a WebSocket event
signals a new digest (e.g. a new `digest.sent` event type). This would
require adding `digest.sent` to the backend `EVENT_TYPES` and handling it
in `useDashboardUpdates` or a new `useDigestUpdates` hook.

**Effort:** Medium — new event type on backend + WebSocket handler on frontend.

---

## Issue 7 — DigestCard Skeleton Count May Exceed Visible Viewport

**Where:** `apps/web/src/components/domain/digests/digest-card.tsx`
→ skeleton loading state

**What:** When a `DigestCard` is expanded and `isLoadingItems` is true, the
skeleton renders `digest.update_count` rows. For a digest with a high
`update_count` (e.g. 20 updates in a large team), this generates 20 skeleton
rows that may overflow the viewport and cause an unexpected scroll jump when
the real items load.

```typescript
// Current — one skeleton row per update, no cap
{Array.from({ length: digest.update_count }).map((_, i) => (
  <div key={i} className="h-6 w-6 ... animate-pulse" />
))}
```

**Impact:** Low — large teams with 20+ daily updates are unlikely at early
stage. The layout shift is cosmetic.

**Fix:** Cap the skeleton count at a reasonable maximum (e.g. 5) regardless
of `update_count`:

```typescript
{Array.from({ length: Math.min(digest.update_count, 5) }).map((_, i) => (...))}
```

**Effort:** Near-zero — one `Math.min` call.

---

## Issue 8 — Digest Settings Not Reflected in Sidebar Without Page Reload

**Where:** `apps/web/src/app/(app)/settings/digest/page.tsx`
and `apps/web/src/components/layout/sidebar.tsx`

**What:** The sidebar currently has no visual indicator for digest status
(enabled/disabled). If a future version adds a digest status badge to the
sidebar nav link, it would need to read from the workspace query cache.
The current settings save flow updates the workspace record on the server
but only invalidates `digestKeys.settings(workspaceId)` — it does not
invalidate `workspaceKeys.mine()`, so the workspace cache (used by
`useWorkspace` throughout the app) is not refreshed after a settings save.

```typescript
// Current — only invalidates digest settings cache, not workspace cache
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: digestKeys.settings(workspaceId) });
},
```

**Impact:** None currently — no component reads `workspace.digest_enabled`
for display outside the settings page. Latent issue if workspace data is
used for display elsewhere.

**Fix:** Also invalidate `workspaceKeys.mine()` on successful settings update:

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: digestKeys.settings(workspaceId) });
  queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
},
```

**Effort:** Near-zero — one additional `invalidateQueries` call.

---

## Summary Table

| #   | Issue                                                      | Impact                               | Fix Milestone | Effort    |
| --- | ---------------------------------------------------------- | ------------------------------------ | ------------- | --------- |
| 1   | Settings form not re-synced on tab re-focus if stale       | Low (multi-tab edge case)            | Milestone 7   | Low       |
| 2   | No prefetch for top digest details on history page load    | Low (skeleton handles latency)       | Post-M9       | Low       |
| 3   | No date filter or search on history page                   | Low (fine under 3 months of history) | Post-M9       | Medium    |
| 4   | No optimistic update on settings save                      | Low (imperceptible latency)          | Post-M9       | Low       |
| 5   | Preview regenerated on every modal open                    | Low (intentional admin action)       | Milestone 7   | Near-zero |
| 6   | Total digest count stale after new digest arrives          | Low (cosmetic, daily cadence)        | Post-M9       | Medium    |
| 7   | Skeleton count uncapped — may overflow viewport            | Low (cosmetic layout shift)          | Milestone 7   | Near-zero |
| 8   | Workspace cache not invalidated after digest settings save | None currently (latent issue)        | Milestone 7   | Near-zero |

---

## Pre-Production Checklist (Web — Digest items)

```
[ ] Issue 7:  Cap DigestCard skeleton rows at Math.min(update_count, 5)
[ ] Issue 8:  Add workspaceKeys.mine() invalidation to useUpdateDigestSettings onSuccess
[ ] Issue 5:  Guard handlePreviewClick — skip Claude call if previewHtml already set
[ ] Issue 1:  Add visibilitychange listener to re-sync settings form on tab focus
[ ] Issue 2:  Prefetch top 3 digest details on history page load
[ ] Issue 4:  Add optimistic update to useUpdateDigestSettings
```
