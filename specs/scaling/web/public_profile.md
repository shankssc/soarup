# SoarUp — Scaling & Technical Debt: Public Profile Pipeline (Web)

# Path: specs/scaling/web/public_profile.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 9

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the public profile frontend introduced in
Milestone 9. This covers `app/u/[username]/page.tsx` (server component +
OG metadata), `app/u/[username]/client.tsx` (public profile render),
`hooks/usePublicProfile.ts` (`usePublicProfile`, `useUsernameAvailability`),
`hooks/useDebounce.ts`, `components/ui/toast.tsx`, and
`app/(app)/settings/profile/page.tsx` (extended with M9 fields). Items are
ordered by expected impact, not urgency. None of these are blockers for
early-stage use.

---

## Issue 1 — OG Image is the User's Avatar, Not a Generated Card

**Where:** `apps/web/src/app/u/[username]/page.tsx`
→ `generateMetadata` → `openGraph.images`

**What:** The OG image for link preview cards is set to the user's avatar
URL. If the user has no avatar, the `images` array is empty and social
platforms render a plain text card with no image, which has significantly
lower click-through rates than image cards.

```typescript
// Current — avatar or nothing
images: profile.avatar_url
  ? [{ url: profile.avatar_url, width: 400, height: 400 }]
  : [],
```

A generated OG card (e.g. via Vercel OG / Satori) would render the user's
name, streak, and a heatmap thumbnail — the standard pattern for "building
in public" tools like Wakatime, GitHub contribution graphs, etc.

**Impact:** Medium if link sharing becomes a growth driver. A bare text
card with no image is the default fallback for ~40% of SoarUp users (those
without avatars) and materially reduces engagement when shared on Twitter/X,
LinkedIn, or Slack.

**Fix (post-M9):** Implement a Vercel OG image generation endpoint at
`/api/og/profile/[username]` using `@vercel/og` and Satori. The generated
card renders the user's display name, `@username`, current streak, and a
simplified heatmap as SVG. Pass this URL as the OG image:

```typescript
images: [{
  url: `${process.env.NEXT_PUBLIC_APP_URL}/api/og/profile/${params.username}`,
  width: 1200,
  height: 630,
}],
```

**Effort:** Medium — new API route + Satori SVG template + font loading.

---

## Issue 2 — Username Availability Check Fires on Every Keystroke Before Debounce Settles

**Where:** `apps/web/src/app/(app)/settings/profile/page.tsx`
→ `useUsernameAvailability` + `useDebounce`

**What:** The debounce hook delays the API call by 500ms after the last
keystroke. However, between the user typing and the debounced value
settling, the `usernameInput` state updates on every keystroke and React
re-renders the settings page on each one. The availability query is correctly
disabled during this window (debounced value hasn't changed yet), but the
re-renders are unnecessary work.

```typescript
// Current — re-renders on every keystroke
const [usernameInput, setUsernameInput] = React.useState(user?.username ?? "");
const debouncedUsername = useDebounce(usernameInput, 500);
// usernameInput changes → re-render → debouncedUsername unchanged → no fetch
```

**Impact:** None visible — React's reconciler handles single-input re-renders
in < 1ms. On very low-end devices or long settings pages, accumulated
re-renders from multiple debounced inputs (username + bio + tagline) may
cause perceptible jank.

**Fix:** Use `useRef` for the raw input value and `useState` only for the
debounced value. This eliminates re-renders on every keystroke:

```typescript
const inputRef = React.useRef("");
const [debouncedUsername, setDebouncedUsername] = React.useState("");

// In onChange: update ref immediately, debounce the state update
```

Alternatively, use a form library (React Hook Form) which handles this
pattern natively via uncontrolled inputs.

**Effort:** Low — ref pattern or form library adoption.

---

## Issue 3 — Toast Component is Not a Full Toast System

**Where:** `apps/web/src/components/ui/toast.tsx`

**What:** The `Toast` component built in M9 handles one specific use case:
the public profile empty state notification. It has no support for multiple
simultaneous toasts, different variants (success, error, warning), or
positioning options. If other parts of the app need toast notifications
(e.g. "Link copied to clipboard", "Profile saved"), a new component would
need to be built or this one extended significantly.

```typescript
// Current — single toast, no variant, fixed position
export function Toast({ message, onDismiss, duration = 6000 }: ToastProps) {
  // fixed bottom-6, no variant styling, no queue
}
```

**Impact:** Low — M9 only needs the one toast. If other features require
toasts post-M9, there is a risk of parallel implementations diverging
(one team member adds a second toast component, another extends this one).

**Fix (post-M9):** Replace with a full toast system using a context provider
and queue:

```typescript
// Desired API
const { toast } = useToast();
toast({ message: "Link copied!", variant: "success", duration: 3000 });
toast({ message: "Profile saved", variant: "success" });
```

Options: build from scratch with a `useReducer` queue, or adopt
`sonner` (lightweight, Tailwind-compatible, used widely in the Next.js
ecosystem).

**Effort:** Medium — context provider + queue management + variant styles;
or low if adopting `sonner` directly.

---

## Issue 4 — Public Profile Page Has No Loading State for Slow Networks

**Where:** `apps/web/src/app/u/[username]/client.tsx`
→ `PublicProfileSkeleton`

**What:** The skeleton loading state renders correctly while `usePublicProfile`
is fetching. However, because `PublicProfileClient` is a client component
and the page has no `loading.tsx` in the `app/u/[username]/` directory,
there is a brief flash of unstyled content (FOUC) between the server render
of the page shell and the client component mounting and showing its skeleton.

```
Server renders page shell → hydration → client mounts → skeleton shows → data loads
                           ↑ FOUC window here
```

**Impact:** Low — the FOUC is sub-100ms on fast networks and only visible
on first load (not on subsequent navigations). On slow networks (3G), the
FOUC window is longer and more noticeable.

**Fix (post-M9):** Add `app/u/[username]/loading.tsx` with the same skeleton
markup as `PublicProfileSkeleton`. Next.js App Router will show this
automatically during the server-side data fetch phase:

```typescript
// app/u/[username]/loading.tsx
export default function Loading() {
  return <PublicProfileSkeleton />;
}
```

Move `PublicProfileSkeleton` to a shared file importable by both
`client.tsx` and `loading.tsx`.

**Effort:** Near-zero — one new file + export refactor.

---

## Issue 5 — `useUsernameAvailability` Does Not Handle API Errors Gracefully

**Where:** `apps/web/src/hooks/usePublicProfile.ts`
→ `useUsernameAvailability`
and `apps/web/src/app/(app)/settings/profile/page.tsx`
→ `UsernameIndicator`

**What:** `useUsernameAvailability` uses React Query's default error handling.
If the `/auth/check-username` endpoint returns a network error or 500, the
query enters `isError` state. The `UsernameIndicator` component only handles
`isLoading`, `available`, and `taken` states — it has no error branch:

```typescript
// Current — no error state rendered
function UsernameIndicator() {
  if (!usernameDirty || usernameInput.length < 3) return null;
  if (usernameInput === user?.username) return <OwnUsername />;
  if (availabilityQuery.isLoading) return <Spinner />;
  if (availabilityQuery.data?.available) return <Available />;
  return <Taken />;  // ← also catches isError silently
}
```

On API error, the indicator falls through to the "Already taken" state,
which is incorrect — the user may be blocked from saving a valid username
because the availability check failed silently.

**Impact:** Low — `/check-username` is a simple DB read unlikely to fail.
When it does fail, the user sees "Already taken" and may think their chosen
username is unavailable when it isn't.

**Fix (post-M9):** Add an explicit error branch to `UsernameIndicator`:

```typescript
if (availabilityQuery.isError) {
  return (
    <span className="font-label text-[10px] text-outline flex items-center gap-1">
      <span className="material-symbols-outlined text-[12px]">help</span>
      Could not check
    </span>
  );
}
```

**Effort:** Near-zero — one additional conditional branch.

---

## Issue 6 — Public Profile Toggle Fires Immediately Without Confirmation

**Where:** `apps/web/src/app/(app)/settings/profile/page.tsx`
→ public profile toggle `onClick`

**What:** The "Make profile public" toggle fires `updateProfile.mutate`
immediately on click with no confirmation step. Enabling the toggle makes
the user's full standup history heatmap publicly accessible at their profile
URL instantly. There is no "are you sure?" prompt and no way to preview the
public profile before making it live.

```typescript
// Current — immediate mutation on click
onClick={() =>
  updateProfile.mutate({ profile_public: !(user?.profile_public ?? false) })
}
```

The "Preview profile →" link allows viewing the profile after it is enabled,
but not before.

**Impact:** Low — most users intend to make their profile public when they
toggle it. The risk is an accidental tap on mobile making a private user's
activity public unexpectedly.

**Fix (post-M9):** Add a brief confirmation step when enabling (not when
disabling — turning off is low-risk):

```typescript
const [pendingPublic, setPendingPublic] = React.useState(false);

// On toggle to enable:
if (!user?.profile_public) {
  setPendingPublic(true); // show inline confirm
} else {
  updateProfile.mutate({ profile_public: false }); // disable immediately
}
```

Or open `/u/:username` in a new tab as a preview before the user confirms,
so they can see what will be public.

**Effort:** Low — state flag + inline confirm UI.

---

## Summary Table

| #   | Issue                                                                | Impact                                         | Fix Milestone | Effort    |
| --- | -------------------------------------------------------------------- | ---------------------------------------------- | ------------- | --------- |
| 1   | OG image is avatar, not a generated card                             | Medium (lower engagement without image)        | Post-M9       | Medium    |
| 2   | Username input re-renders on every keystroke before debounce settles | None (< 1ms on modern devices)                 | Post-M9       | Low       |
| 3   | Toast component is minimal — not a full toast system                 | Low (risk of parallel implementations post-M9) | Post-M9       | Medium    |
| 4   | No loading.tsx for public profile — brief FOUC on first load         | Low (sub-100ms on fast networks)               | Post-M9       | Near-zero |
| 5   | Username availability error silently falls through to "taken" state  | Low (misleads user on API failure)             | Post-M9       | Near-zero |
| 6   | Profile public toggle fires immediately without confirmation         | Low (accidental enable risk on mobile)         | Post-M9       | Low       |

---

## Pre-Production Checklist (Web — Public Profile)

```
[ ] Issue 5:  Add isError branch to UsernameIndicator component
[ ] Issue 4:  Add app/u/[username]/loading.tsx with skeleton markup
[ ] Issue 6:  Add confirmation step when enabling profile_public toggle
[ ] Issue 1:  Implement Vercel OG image generation for profile link previews
[ ] Issue 3:  Evaluate sonner or custom toast system for post-M9 toast needs
[ ] Issue 2:  Evaluate uncontrolled input pattern if settings page jank observed
```
