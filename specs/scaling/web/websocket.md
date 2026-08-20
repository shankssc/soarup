# SoarUp — Scaling & Technical Debt: WebSocket Layer (Web)

# Path: specs/scaling/web/websocket.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 3

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the WebSocket connection layer introduced in
Milestone 3. This covers the connection lifecycle (`useWebSocket`), the
pub/sub registry, React Query cache patching (`useDashboardUpdates`), and
the `ConnectionIndicator` in the sidebar. Items are ordered by expected
impact, not urgency. None of these are blockers for early-stage use.

---

## Issue 1 — JWT Passed as URL Query Parameter

**Where:** `apps/web/src/hooks/useWebSocket.ts` → `connect`
and `apps/api/app/routers/websockets.py` → `workspace_websocket`

**What:** Browsers cannot send `Authorization` headers on WebSocket connections,
so the Supabase JWT is passed as a query parameter (`?token=<jwt>`). This means
the token appears in server access logs, browser history, and any proxy/CDN
logs that record full URLs.

```typescript
// Current — token in URL
const url = `${WS_BASE}/workspaces/${workspaceId}?token=${accessToken}`;
```

**Impact:** Low in development and early production. JWTs expire after 1 hour
(Supabase default), limiting the window of exposure. The token only grants
access to the authenticated user's workspace, so the blast radius of a leaked
token is limited to the user's own data.

**Fix (pre-public launch):** Two common mitigations:

Option A — Ticket-based auth: exchange the JWT for a short-lived
single-use WebSocket ticket via a REST endpoint, then pass the ticket
in the URL instead of the JWT.

```typescript
// Exchange JWT for a WS ticket (valid for 30 seconds)
const { ticket } = await apiClient.post("/auth/ws-ticket", {}, accessToken);
const url = `${WS_BASE}/workspaces/${workspaceId}?ticket=${ticket}`;
```

Option B — First-message auth: accept the connection unauthenticated,
require the client to send the JWT as the first WebSocket message within
a timeout window, then close with `4001` if not received.

**Effort:** Medium for Option A (new endpoint + Redis ticket store).
Medium for Option B (changes to both WS endpoint and `useWebSocket`).

---

## Issue 2 — Reconnect Backoff Does Not Account for Token Expiry

**Where:** `apps/web/src/hooks/useWebSocket.ts` → `onclose` handler

**What:** When the WebSocket closes with code `4001` (unauthorized), the hook
sets `status = 'error'` and stops reconnecting — this is correct. However,
if the access token expires during a session (after 1 hour), the server will
close the connection with `4001`, and the client will permanently stop
reconnecting even though the user is still authenticated. A token refresh
would fix the connection, but the hook has no awareness of token state.

```typescript
// Current — 4001 treated as permanent, no token refresh attempt
ws.onclose = (event) => {
  if (event.code === 4001) {
    setStatus('error');
    return; // never reconnects
  }
  ...
};
```

**Impact:** Low for now — Supabase access tokens expire after 1 hour and
`useAuth` does not yet auto-refresh them. When token refresh is implemented
(Milestone 5), a 1-hour session cap will cause WebSocket disconnections that
require a page reload to fix.

**Fix (Milestone 5, when token refresh lands):** On `4001` close, attempt
a token refresh via `useAuth.refreshTokens()`. If the refresh succeeds,
reconnect with the new token. If it fails (refresh token also expired),
redirect to login.

```typescript
ws.onclose = async (event) => {
  if (event.code === 4001) {
    try {
      await refreshTokens(); // new access token in store
      connect(); // reconnect with fresh token
    } catch {
      router.replace('/login');
    }
    return;
  }
  ...
};
```

**Effort:** Low once token refresh exists — a few lines in `useWebSocket`.

---

## Issue 3 — Registry Is a Module-Level Singleton

**Where:** `apps/web/src/lib/websocket/registry.ts`

**What:** The handler registry is a plain `Map` at module scope. This works
correctly in the browser (one module instance per tab) but has two edge cases:

1. **Test isolation** — tests must call `clearAllHandlers()` in `beforeEach`
   to prevent handler leakage between tests. This is documented in the M3
   testing spec but is a footgun if forgotten.

2. **Multiple workspaces** — if SoarUp ever supports switching between
   workspaces without a full page reload, handlers registered for workspace A
   would still fire for events from workspace B until `useDashboardUpdates`
   unmounts. The `workspace_id` guard in `useDashboardUpdates` prevents
   incorrect cache mutations, but the handlers still run unnecessarily.

```typescript
// Current — module-level singleton
const handlers = new Map<string, Set<Handler>>();
```

**Impact:** No functional impact in production — browsers get a fresh module
instance per page load. Test footgun is documented and mitigated. Workspace
switching is not yet a feature.

**Fix (when workspace switching lands):** Scope the registry to a React
context provider rather than module scope. This allows per-workspace registry
instances that are torn down cleanly when the workspace changes.

**Effort:** Medium — requires wrapping the registry in a context and updating
all `subscribe`/`dispatch` call sites.

---

## Issue 4 — `setQueryData` Cache Patch Does Not Handle Stale Updates After Reconnect

**Where:** `apps/web/src/hooks/useDashboardUpdates.ts`
and `apps/web/src/hooks/useWebSocket.ts` → `onopen`

**What:** When the WebSocket reconnects after a dropout, `useWebSocket` calls
`queryClient.invalidateQueries` on the current date's update list. This
triggers a refetch and ensures missed events are recovered via the DB. However,
`invalidateQueries` only marks the query stale — it does not immediately
refetch unless a component is actively subscribed to that query key.

If the dashboard page is mounted but the query's `staleTime` window has not
yet expired, React Query may serve the stale cache rather than refetching,
leaving the UI showing outdated statuses until the next natural refetch.

```typescript
// Current — invalidation on reconnect, relies on staleTime expiry
queryClient.invalidateQueries({
  queryKey: updateKeys.byDate(workspaceId, format(new Date(), "yyyy-MM-dd")),
});
```

**Impact:** Low — the `staleTime` for updates is 30 seconds, so the window of
stale display is at most 30 seconds after reconnect. In practice, reconnects
from short dropouts are usually fast enough that no events are missed.

**Fix:** Use `queryClient.refetchQueries` instead of `invalidateQueries` on
reconnect to force an immediate refetch regardless of staleTime:

```typescript
// Force immediate refetch on reconnect
queryClient.refetchQueries({
  queryKey: updateKeys.byDate(workspaceId, format(new Date(), "yyyy-MM-dd")),
});
```

**Effort:** Near-zero — one word change. Deferred because it increases
API calls and the current behaviour is acceptable for early-stage use.

---

## Issue 5 — `ConnectionIndicator` Reload on Disconnect Is a Blunt Instrument

**Where:** `apps/web/src/components/layout/sidebar.tsx` → `ConnectionIndicator`

**What:** When the WebSocket exhausts all 10 reconnect attempts, the
`ConnectionIndicator` shows a "Connection lost — reconnect" button that
calls `window.location.reload()`. A full page reload is the recovery path
because the `useWebSocket` hook's reconnect counter is at its maximum and
the hook has no mechanism to reset and retry from zero without remounting.

```typescript
// Current — full page reload as recovery
<button onClick={() => window.location.reload()}>
  Connection lost — reconnect
</button>
```

**Impact:** Low UX impact — max reconnect attempts (10 with exponential
backoff up to 30s) takes several minutes to exhaust. By that point a page
reload is a reasonable ask. The user's data is safe — the DB is the source
of truth.

**Fix:** Expose a `resetAndReconnect` action on `useWebSocketStore` that
resets `reconnectAttempts` to 0 and triggers a reconnect without a page
reload. Wire the button to this action instead of `location.reload()`.

```typescript
// In websocket-store.ts
resetAndReconnect: () => set({ reconnectAttempts: 0, status: 'connecting' }),
```

The `useWebSocket` hook would need to watch `status === 'connecting'` as a
signal to initiate a fresh connection even after being in `disconnected` state.

**Effort:** Low — store action + hook adjustment + button re-wire.

---

## Issue 6 — Single WebSocket Connection Per Dashboard Mount

**Where:** `apps/web/src/app/(app)/dashboard/page.tsx`
and `apps/web/src/hooks/useWebSocket.ts`

**What:** `useWebSocket` is called directly in `DashboardPage`, which means
the WebSocket connection is only alive while the dashboard is mounted. If a
user navigates to `/history` or `/settings`, the WebSocket disconnects and
reconnects when they return to `/dashboard`. Any events published during
that navigation window are lost (pub/sub has no persistence — see
`specs/scaling/api/ai_pipeline.md` Issue 1).

**Impact:** Low for now — updates are only submitted from the dashboard and
the processing window is short (seconds). A user navigating away mid-processing
will miss the real-time status update and see the correct state on return
(from the DB via React Query cache invalidation on reconnect).

**Fix (Milestone 5+):** Move `useWebSocket` into `AppShell` so the connection
persists across all app routes. This requires `useDashboardUpdates` to also
move up the tree or be refactored to register/deregister handlers dynamically
per route.

```typescript
// In AppShell — connection lives for the full app session
useWebSocket({
  workspaceId: workspace?.id,
  accessToken: tokens?.access_token,
  enabled: !!workspace?.id && !!tokens?.access_token,
});
```

**Effort:** Low for moving the hook. Medium for ensuring route-level
handlers register and deregister cleanly without memory leaks.

---

## Summary Table

| #   | Issue                                     | Impact                         | Fix Milestone | Effort     |
| --- | ----------------------------------------- | ------------------------------ | ------------- | ---------- |
| 1   | JWT in WebSocket URL                      | Low (now), Medium (at scale)   | Pre-launch    | Medium     |
| 2   | 4001 close does not attempt token refresh | Low (until token refresh)      | Milestone 5   | Low        |
| 3   | Registry is a module-level singleton      | Low (test footgun)             | When needed   | Medium     |
| 4   | Stale cache after reconnect               | Low (30s window only)          | When needed   | Near-zero  |
| 5   | Reload on disconnect is a blunt recovery  | Low (takes minutes to exhaust) | Milestone 5   | Low        |
| 6   | WS disconnects on route change            | Low (short processing window)  | Milestone 5+  | Low–Medium |
