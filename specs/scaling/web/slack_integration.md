# SoarUp — Scaling & Technical Debt: Slack Integration (Web)

# Path: specs/scaling/web/slack_integration.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 8

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the Slack integration frontend introduced in
Milestone 8. This covers `hooks/useSlack.ts`, `app/(app)/settings/slack/page.tsx`,
`components/layout/sidebar.tsx`, and
`components/domain/digests/digest-card.tsx`. Items are ordered by expected
impact, not urgency. None of these are blockers for early-stage use.

---

## Issue 1 — Toggles Fire Immediate PATCH Without Debounce

**Where:** `apps/web/src/app/(app)/settings/slack/page.tsx`
→ `handleToggle`

**What:** Each notification toggle fires a `PATCH /slack/settings` request
immediately on click without debounce:

```typescript
// Current — immediate PATCH on every toggle click
async function handleToggle(
  key: "slack_digest_enabled" | "slack_updates_enabled",
) {
  await updateSettings.mutateAsync({
    [key]: !settings?.[key],
  });
}
```

If a user rapidly clicks a toggle (e.g. double-click), two sequential
mutations fire — first setting the value to `true`, then immediately back
to `false`. The final state depends on which response resolves last, which
is non-deterministic. The `disabled={updateSettings.isPending}` prop
mitigates this but only prevents clicks while the first mutation is in
flight, not rapid clicks before the disable state renders.

**Impact:** Low — toggle interactions are deliberate user actions. Rapid
double-clicks on a settings toggle are unlikely in normal usage. The worst
case is an unexpected toggle state that self-corrects on the next page load.

**Fix:** Disable toggle buttons while any settings mutation is pending:

```typescript
disabled={!settings?.slack_configured || updateSettings.isPending}
```

This is already present in the current implementation. An additional
optimistic update (flip the toggle immediately, revert on error) would
make the interaction feel more responsive:

```typescript
onMutate: async (payload) => {
  await queryClient.cancelQueries({ queryKey: slackKeys.settings(workspaceId) });
  const previous = queryClient.getQueryData(slackKeys.settings(workspaceId));
  queryClient.setQueryData(slackKeys.settings(workspaceId), (old) => ({
    ...old,
    ...payload,
  }));
  return { previous };
},
onError: (_, __, context) => {
  queryClient.setQueryData(slackKeys.settings(workspaceId), context?.previous);
},
```

**Effort:** Low — standard React Query optimistic update pattern.

---

## Issue 2 — Webhook URL Input Has No Client-Side Validation Feedback

**Where:** `apps/web/src/app/(app)/settings/slack/page.tsx`
→ webhook URL `<input>`

**What:** The webhook URL input accepts any text and only validates when
the user clicks "Save settings", at which point the backend returns a 422
if the URL does not start with `https://hooks.slack.com/`. The user sees
no inline feedback while typing an invalid URL.

```typescript
// Current — no inline validation
<input
  type="url"
  value={webhookUrl}
  onChange={(e) => {
    setWebhookUrl(e.target.value);
    setIsDirty(true);
  }}
  ...
/>
```

**Impact:** Low — the URL format is well-known and admins generally paste
from the Slack dashboard rather than typing manually. Invalid URLs are
caught on save with a clear error from the backend.

**Fix:** Add client-side validation on blur or on change:

```typescript
const isValidWebhookUrl = !webhookUrl ||
  webhookUrl.startsWith('https://hooks.slack.com/');

// Show inline error when invalid
{webhookUrl && !isValidWebhookUrl && (
  <p className="font-label text-[10px] text-error">
    Must be a valid Slack incoming webhook URL.
  </p>
)}

// Disable save when URL is invalid
<button disabled={!isValidWebhookUrl || updateSettings.isPending}>
```

**Effort:** Near-zero — one regex/startsWith check + conditional error
message.

---

## Issue 3 — Test Result Message Persists Indefinitely After Test Send

**Where:** `apps/web/src/app/(app)/settings/slack/page.tsx`
→ `testResult` state

**What:** After the test message is sent, the success or failure message
is stored in `testResult` state and displayed below the test button. It
persists indefinitely — there is no auto-dismiss, no timeout, and no manual
close button. If the user sends a test, sees the success message, then
changes their webhook URL and saves, the stale success message from the
previous webhook is still visible.

```typescript
// Current — testResult never cleared after display
const [testResult, setTestResult] = React.useState<{
  success: boolean;
  message: string;
} | null>(null);
```

**Impact:** Low — stale success message is cosmetic and does not affect
functionality. The message is cleared when the component unmounts (navigation
away from the page).

**Fix:** Auto-clear `testResult` after 8 seconds using a timeout, or clear
it when the webhook URL input changes:

```typescript
// Clear test result when webhook URL changes
onChange={(e) => {
  setWebhookUrl(e.target.value);
  setIsDirty(true);
  setTestResult(null); // clear stale result
}}

// Or auto-dismiss after 8s
React.useEffect(() => {
  if (!testResult) return;
  const timer = setTimeout(() => setTestResult(null), 8000);
  return () => clearTimeout(timer);
}, [testResult]);
```

**Effort:** Near-zero — one `useEffect` or one `setTestResult(null)` call.

---

## Issue 4 — Slack Settings Not Included in WorkspaceResponse Cache

**Where:** `apps/web/src/hooks/useWorkspace.ts`
→ `WorkspaceResponse`
and `apps/web/src/app/(app)/settings/slack/page.tsx`

**What:** The `/settings/slack` page fetches Slack settings via a dedicated
`GET /slack/settings` endpoint rather than reading from the workspace cache.
This means two API calls are made when the page loads: one for
`GET /workspaces/` (workspace cache) and one for `GET /slack/settings`.
The `WorkspaceResponse` type now includes `slack_configured`,
`slack_digest_enabled`, and `slack_updates_enabled`, but these fields are
not used by the settings page — it always fetches fresh from the dedicated
endpoint.

**Impact:** None currently — the dedicated endpoint is the correct approach
since it also returns `webhook_url_hint` which is not on the workspace
response. The double-fetch is one additional lightweight request per page
load.

**Fix:** No fix required. The dedicated settings endpoint is the right
pattern — it returns the hint which cannot live on the workspace response
(security: webhook URL should not be in the general workspace cache). The
`slack_*` fields on `WorkspaceResponse` serve a different purpose — they
allow other parts of the app (sidebar badge, dashboard) to know if Slack
is configured without an additional fetch. Document this as intentional.

**Effort:** N/A — document only.

---

## Issue 5 — Slack Delivery Badge Uses SVG Icon Instead of Material Symbols

**Where:** `apps/web/src/components/domain/digests/digest-card.tsx`
→ Slack delivery badge

**What:** The Slack delivery badge in the digest card uses an inline SVG
label icon rather than a Material Symbols icon. This was a deliberate
workaround for a Storybook font loading issue — Material Symbols was not
loading in the Storybook environment, causing the `tag`/`label` icon to
render as raw text.

```typescript
// Current — inline SVG instead of Material Symbols
<svg width="10" height="10" viewBox="0 0 24 24" ...>
  <path d="M20.59 13.41l-7.17 7.17..." />
  <line x1="7" y1="7" x2="7.01" y2="7" />
</svg>
```

The Storybook font issue was resolved separately by adding a Material
Symbols font loader decorator to `preview.ts`. The inline SVG remains but
is now inconsistent with the rest of the icon system.

**Impact:** Low — the SVG renders correctly and looks visually consistent.
The inconsistency is only visible at the code level, not to users.

**Fix:** Replace the inline SVG with the standard Material Symbols pattern
now that Storybook loads the font correctly:

```typescript
<span
  className="material-symbols-outlined text-[11px]"
  aria-hidden="true"
>
  label
</span>
```

**Effort:** Near-zero — replace SVG block with span.

---

## Issue 6 — `/settings/slack` Page Has No Loading Skeleton

**Where:** `apps/web/src/app/(app)/settings/slack/page.tsx`

**What:** While `useSlackSettings` is loading, the page renders a full-page
spinner via the loading guard:

```typescript
if (isLoading || !workspace) {
  return (
    <div className="flex justify-center py-16">
      <span className="material-symbols-outlined animate-spin ...">
        progress_activity
      </span>
    </div>
  );
}
```

This causes a layout shift when the full page content loads — the spinner
disappears and the page content appears. Other settings pages (Profile,
Digest) have the same pattern, so this is consistent, but a skeleton
matching the page layout would provide a better perceived performance.

**Impact:** Low — `useSlackSettings` typically resolves in < 200ms (small
payload, cached workspace data). The spinner is rarely visible.

**Fix (post-M9):** Add a skeleton matching the page layout — a banner
skeleton, an input skeleton, and two toggle row skeletons:

```typescript
if (isLoading) {
  return (
    <div className="max-w-lg space-y-8">
      <div className="h-8 w-24 animate-pulse bg-surface-high" />
      <div className="h-10 w-full animate-pulse bg-surface-high" />
      <div className="space-y-4">
        <div className="h-6 w-full animate-pulse bg-surface-high" />
        <div className="h-6 w-full animate-pulse bg-surface-high" />
      </div>
    </div>
  );
}
```

**Effort:** Low — skeleton markup matching the page structure.

---

## Issue 7 — Remove Integration Confirmation Has No Loading State

**Where:** `apps/web/src/app/(app)/settings/slack/page.tsx`
→ danger zone remove confirmation

**What:** When the user clicks "Yes, remove", the `removeIntegration.mutateAsync()`
call fires and the button shows "Removing..." while pending. However, the
"Cancel" button remains active during the removal — a user who clicks
"Cancel" while the DELETE request is in flight will set
`showRemoveConfirm(false)`, hiding the confirmation UI, but the mutation
continues and completes in the background. The settings page then updates
correctly but the UI transition is jarring.

```typescript
// Current — cancel available while removal is in flight
<button
  type="button"
  onClick={() => setShowRemoveConfirm(false)}
  className="font-label text-xs text-outline hover:underline"
>
  Cancel
</button>
```

**Impact:** Low — the mutation completes correctly regardless of UI state.
The visual jarring is cosmetic.

**Fix:** Disable the Cancel button while the mutation is pending:

```typescript
<button
  type="button"
  onClick={() => setShowRemoveConfirm(false)}
  disabled={removeIntegration.isPending}
  className="font-label text-xs text-outline hover:underline disabled:opacity-40"
>
  Cancel
</button>
```

**Effort:** Near-zero — one `disabled` prop.

---

## Summary Table

| #   | Issue                                                    | Impact                                       | Fix Milestone | Effort    |
| --- | -------------------------------------------------------- | -------------------------------------------- | ------------- | --------- |
| 1   | Toggles fire immediate PATCH without optimistic update   | Low (disabled guard partially mitigates)     | Post-M9       | Low       |
| 2   | Webhook URL input has no client-side validation feedback | Low (backend catches invalid URLs)           | Post-M9       | Near-zero |
| 3   | Test result message persists indefinitely                | Low (cosmetic, cleared on navigation)        | Post-M9       | Near-zero |
| 4   | Slack settings fetched separately from workspace cache   | None (correct — hint requires own endpoint)  | N/A           | N/A       |
| 5   | Slack badge uses inline SVG instead of Material Symbols  | Low (code inconsistency only)                | Post-M9       | Near-zero |
| 6   | No loading skeleton on /settings/slack                   | Low (< 200ms load, spinner rarely visible)   | Post-M9       | Low       |
| 7   | Cancel button active while remove mutation is in flight  | Low (cosmetic, mutation completes correctly) | Post-M9       | Near-zero |

---

## Pre-Production Checklist (Web — Slack Integration)

```
[ ] Issue 7:  Disable Cancel button while removeIntegration.isPending
[ ] Issue 2:  Add inline webhook URL validation on blur/change
[ ] Issue 3:  Auto-clear testResult after 8s or on webhook URL change
[ ] Issue 5:  Replace inline SVG badge with material-symbols-outlined label icon
[ ] Issue 1:  Add optimistic update to useUpdateSlackSettings
[ ] Issue 6:  Add loading skeleton matching page layout
```
