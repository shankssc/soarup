# Scaling Challenges — OAuth Milestone

Documents potential scaling concerns introduced or surfaced by the OAuth
milestone changes, across both the API and web layers.

---

## Web Layer

### 5. `exchangeCodeForSession` — no retry or timeout handling

**What happens today:**
The PKCE code exchange in `callback/page.tsx` is a single
`supabase.auth.exchangeCodeForSession(code)` call with no timeout and no
retry. If it fails (network blip, Supabase hiccup), the user sees the
generic error message and has to start over.

**The risk at scale:**
Under high load, transient failures become more frequent. A user who
hits a transient failure during OAuth has no automatic recovery path —
they must click the OAuth button again manually, which re-initiates the
full provider flow.

**Mitigation:**
Wrap `exchangeCodeForSession` in a simple retry with exponential backoff
(2–3 attempts, 200ms–1s delays). A transient network failure on attempt
1 recovers silently on attempt 2 without user intervention.

---

### 6. `signInWithOAuth` — no PKCE code verifier persistence across tab restores

**What happens today:**
Supabase JS client stores the PKCE code verifier in `sessionStorage`
before redirecting to the provider. If the user's browser session is
restored from a crash or the tab is duplicated, `sessionStorage` may not
have the verifier, causing the code exchange to fail with a verifier
mismatch error.

**The risk at scale:**
More users means more edge-case browser behaviours — tab duplication,
session restore, browser crashes mid-flow. Each of these produces a
confusing error at the callback page that currently shows as "Could not
complete sign in. Please try again." with no actionable guidance.

**Mitigation:**
Detect verifier mismatch errors specifically at the callback page and
show a targeted message: "Your sign-in session expired — please try
again." with a direct link back to `/login`. This doesn't fix the
underlying browser behaviour but makes the failure recoverable without
user confusion.

---

### 7. Zustand store — `is_onboarded` as the sole routing signal

**What happens today:**
Post-OAuth routing (`/onboarding` vs `/dashboard`) is decided by reading
`user.is_onboarded` from the Zustand store immediately after
`hydrateSession()` resolves. The store is the source of truth.

**The risk at scale:**
If a future change introduces multiple tabs or concurrent sessions (e.g.
a user completes onboarding in one tab while another tab is still on the
callback page), the second tab may read a stale `is_onboarded: false`
from the store and re-route to `/onboarding`. The onboarding page's own
guard will eventually correct this, but the flicker is visible.

**Mitigation:**
For now the single-tab assumption holds and this is low risk. If
multi-tab support becomes a requirement, consider a `BroadcastChannel`
to sync Zustand store updates across tabs, or derive routing from the
API response directly rather than the store.

---

## Cross-cutting

### 8. OAuth error observability

**What happens today:**
OAuth errors (provider denial, exchange failure, initiation failure) are
surfaced to the user via inline error messages but are not logged or
tracked anywhere. The only signal is user-reported issues.

**At scale:**
A spike in OAuth failures (e.g. a misconfigured redirect URI after a
deployment) would be invisible until users report it. There's no way to
distinguish "user denied consent" (expected) from "exchange failed due to
Supabase outage" (actionable) in current observability.

**Mitigation:**
Add Sentry error captures at the callback page for exchange failures, and
structured log events on the API side distinguishing provider denial
(`error=access_denied`) from internal failures. This gives an alertable
signal without exposing sensitive OAuth data.
