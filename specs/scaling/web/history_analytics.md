# SoarUp — Scaling & Technical Debt: History & Analytics Pipeline (Web)

# Path: specs/scaling/web/history_analytics.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 7

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the history and analytics frontend introduced in
Milestone 7. This covers `hooks/useUpdateHistory.ts`, `hooks/useAnalytics.ts`,
`components/ui/heatmap.tsx`, `components/ui/streak-card.tsx`,
`components/domain/updates/update-card-compact.tsx`, and
`app/(app)/history/page.tsx`. Items are ordered by expected impact, not
urgency. None of these are blockers for early-stage use.

---

## Issue 1 — Analytics Data Not Invalidated After Update Submission

**Where:** `apps/web/src/hooks/useUpdates.ts` → `useSubmitUpdate`
and `apps/web/src/hooks/useAnalytics.ts`

**What:** Personal and team analytics are cached with a 5-minute stale time.
When a user submits an update and immediately navigates to the Analytics tab,
their streak and heatmap will not reflect the new submission for up to 5
minutes. There is no `invalidateQueries` call for analytics keys in the
submit mutation's `onSuccess`.

```typescript
// Current — analytics cache not invalidated on update submission
onSuccess: (newUpdate) => {
  queryClient.setQueryData(updateKeys.byDate(workspaceId, date), ...);
  // analyticsKeys.personal not invalidated here
},
```

**Impact:** Low — analytics are a reflection tool, not real-time. A 5-minute
delay is acceptable and is documented as a known tradeoff in
`useAnalytics.ts`. The stale data is visually consistent — there is no
incorrect value shown, just a slightly behind-the-moment count.

**Fix (post-M9):** Add analytics invalidation to `useSubmitUpdate`'s
`onSuccess`:

```typescript
onSuccess: (newUpdate) => {
  queryClient.setQueryData(updateKeys.byDate(workspaceId, date), ...);
  queryClient.invalidateQueries({
    queryKey: analyticsKeys.personal(workspaceId),
  });
},
```

**Effort:** Near-zero — one additional `invalidateQueries` call.

---

## Issue 2 — Heatmap Colors Are Hardcoded Hex, Not CSS Custom Properties

**Where:** `apps/web/src/components/ui/heatmap.tsx`
→ `DARK` and `LIGHT` color maps

**What:** The heatmap SVG uses hardcoded hex values for cell fill colors
rather than CSS custom properties (`var(--color-primary)` etc.). This is
an intentional workaround — SVG `fill` attributes do not reliably support
CSS custom properties in all browsers, and the heatmap needs to work in
both dark and light modes without a stylesheet dependency.

```typescript
// Current — hardcoded hex, not CSS vars
const DARK: Record<0 | 1 | 2 | 3, string> = {
  0: "#1f1f22",
  1: "#1a3d4a",
  2: "#1f7a8c",
  3: "#53ddfc", // matches --color-primary but hardcoded
};
```

**Impact:** Low — if the design system's primary cyan ever changes, the
heatmap colors must be updated manually in two places (the component and
`globals.css`). Currently `#53ddfc` matches `--color-primary` exactly.

**Fix:** If browser support for CSS custom properties in SVG improves to
cover all target browsers, replace the hex maps with `getComputedStyle`
lookups at render time:

```typescript
const primary = getComputedStyle(document.documentElement)
  .getPropertyValue("--color-primary")
  .trim();
```

Until then, document the hardcoded values with a comment linking to the
design token so they stay in sync during design system updates.

**Effort:** Near-zero — documentation + a comment in the component pointing
to `globals.css` color tokens.

---

## Issue 3 — History Page Lazy-Loads All Three Tabs on First Render

**Where:** `apps/web/src/app/(app)/history/page.tsx`

**What:** The history page initialises `useDigests`, `useUpdateHistory`,
and `usePersonalAnalytics` at the top of the component. `useUpdateHistory`
and `usePersonalAnalytics` are conditionally enabled based on `mainTab`,
so they do not fire on initial render of the Digests tab. However, all
three hooks are always instantiated, adding three React Query subscriptions
to the component regardless of which tab is active.

```typescript
// Current — all hooks instantiated, only enabled conditionally
const updatesQuery = useUpdateHistory(
  mainTab === "updates" ? workspace?.id : undefined,
  datePreset,
);
const { data: personalData } = usePersonalAnalytics(
  mainTab === "analytics" ? workspace?.id : undefined,
);
```

**Impact:** None currently — disabled queries add negligible overhead.
React Query does not allocate cache entries or fire requests for disabled
queries.

**Fix:** No fix required. The conditional `enabled` pattern is the correct
React Query approach for tab-based lazy loading. Document this as intentional.

**Effort:** N/A — document only.

---

## Issue 4 — UpdateCardCompact Renders Full Content Inline — No Virtualisation

**Where:** `apps/web/src/app/(app)/history/page.tsx` → Updates tab
and `apps/web/src/components/domain/updates/update-card-compact.tsx`

**What:** The Updates tab renders all fetched updates as DOM nodes in a flat
list. With the default 20-item page size, 20 `UpdateCardCompact` nodes are
rendered simultaneously. If a user clicks "Load more" repeatedly, the DOM
accumulates all loaded updates (40, 60, 80...) without removing off-screen
items.

```typescript
// Current — all pages accumulated in DOM
{updatesData?.pages.flatMap((p) => p.updates).map((update) => (
  <UpdateCardCompact key={update.id} update={update} workspaceId={...} />
))}
```

**Impact:** Low at current scale — 60-80 compact cards in the DOM is
imperceptible on modern hardware. At 200+ accumulated updates, scroll
performance may degrade on low-end mobile devices.

**Fix (post-M9):** Implement virtual scrolling using `@tanstack/react-virtual`
for the updates list. Alternatively, replace "Load more" with true pagination
(page numbers or prev/next) so only one page is in the DOM at a time.

**Effort:** Medium — virtual scrolling requires row height estimation for
variable-height cards (collapsed vs expanded state changes height).

---

## Issue 5 — Heatmap MutationObserver Not Cleaned Up on Rapid Unmount

**Where:** `apps/web/src/components/ui/heatmap.tsx`

**What:** The heatmap registers a `MutationObserver` on
`document.documentElement` to detect dark/light mode changes. The cleanup
function calls `observer.disconnect()` in the `useEffect` return. In normal
usage this is correct. However, if the component is unmounted and remounted
rapidly (e.g. switching tabs quickly in the history page), there is a brief
window between the new observer connecting and the old one disconnecting
where two observers are simultaneously watching `document.documentElement`.

```typescript
// Current — brief double-observer window on rapid remount
React.useEffect(() => {
  const observer = new MutationObserver(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}, []);
```

**Impact:** None visible — two observers firing the same `setIsDark` call
is idempotent. React batches the resulting state updates. No memory leak
because both observers are eventually disconnected.

**Fix:** No fix required. The current implementation is correct and the
double-observer window is harmless. Document as intentional.

**Effort:** N/A — document only.

---

## Issue 6 — Team Analytics Member Table Has No Sorting or Filtering

**Where:** `apps/web/src/app/(app)/history/page.tsx`
→ Analytics tab → Team sub-tab

**What:** The team member table renders members in the order returned by
the API (currently unspecified — insertion order of workspace membership).
There is no way for an admin to sort by streak, participation rate, or
name, or to filter for members below a participation threshold.

**Impact:** Low at current team sizes — 5-10 members can be scanned visually.
At 20+ members, the unsorted list makes it hard to identify who is falling
behind or who has the longest streak.

**Fix (post-M9):** Add client-side sorting controls above the member table.
Since all member data is already in the React Query cache (no additional
fetch needed), sorting is a pure UI operation:

```typescript
const [sortKey, setSortKey] = React.useState<"streak" | "rate" | "name">(
  "rate",
);
const sorted = [...teamData.members].sort((a, b) => {
  if (sortKey === "streak") return b.current_streak - a.current_streak;
  if (sortKey === "rate")
    return b.participation_rate_30d - a.participation_rate_30d;
  return (a.full_name ?? "").localeCompare(b.full_name ?? "");
});
```

**Effort:** Low — client-side sort, no backend changes required.

---

## Issue 7 — `useUpdateHistory` Query Key Includes Full Date Strings

**Where:** `apps/web/src/hooks/useUpdateHistory.ts`
→ `updateHistoryKeys.list`

**What:** The history query key includes `fromDate` and `to_date` as ISO date
strings computed at render time. Since `to_date` is always today's date, the
key changes every time the component re-renders after midnight (the date
rolls over). A user who has the history page open across midnight will trigger
a refetch at the next render after midnight, which is correct behaviour but
may be surprising.

```typescript
// Current — to_date is today, changes at midnight
export const updateHistoryKeys = {
  list: (workspaceId: string, params: Record<string, string>) =>
    ["update-history", workspaceId, params] as const,
};
```

**Impact:** None visible — a refetch at midnight refreshes the history with
the correct new date range. No data loss or incorrect display. The refetch
is silent (background refetch, no loading state shown if data is cached).

**Fix:** No fix required. Midnight date rollover triggering a refetch is
correct and desirable — the history should show the current day's range.
Document as intentional.

**Effort:** N/A — document only.

---

## Summary Table

| #   | Issue                                                            | Impact                                    | Fix Milestone | Effort    |
| --- | ---------------------------------------------------------------- | ----------------------------------------- | ------------- | --------- |
| 1   | Analytics not invalidated after update submission                | Low (5-min stale window, documented)      | Post-M9       | Near-zero |
| 2   | Heatmap colors are hardcoded hex, not CSS vars                   | Low (manual sync if design tokens change) | Post-M9       | Near-zero |
| 3   | All three tab hooks instantiated on first render                 | None (conditional enabled is correct)     | N/A           | N/A       |
| 4   | Updates list accumulates all pages in DOM without virtualisation | Low (slow scroll at 200+ updates)         | Post-M9       | Medium    |
| 5   | MutationObserver brief double-register on rapid tab switch       | None (idempotent, no memory leak)         | N/A           | N/A       |
| 6   | Team member table has no sorting or filtering                    | Low (hard to scan at 20+ members)         | Post-M9       | Low       |
| 7   | Query key includes today's date — changes at midnight            | None (correct and desirable behaviour)    | N/A           | N/A       |

---

## Pre-Production Checklist (Web — History & Analytics)

```
[ ] Issue 1:  Invalidate analyticsKeys.personal in useSubmitUpdate onSuccess
[ ] Issue 2:  Add comment in heatmap.tsx linking hex values to globals.css tokens
[ ] Issue 6:  Add client-side sort controls to team member table
[ ] Issue 4:  Evaluate virtual scrolling for updates list at scale
```
