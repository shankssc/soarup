# Scaling Challenges — OAuth Milestone

Documents potential scaling concerns introduced or surfaced by the OAuth
milestone changes, across both the API and web layers.

---

## API Layer

### 1. `session_from_supabase` — profile creation under concurrent OAuth logins

**What happens today:**
On every OAuth login, `/auth/session` calls `get_by_user_id()` and if no
profile exists, calls `profile_repo.create()`. This is a check-then-act
pattern — not atomic.

**The risk at scale:**
If a user double-clicks the OAuth button or a retry fires before the first
request completes, two concurrent requests can both find no profile and
both attempt `profile_repo.create()`. The second one hits an
`IntegrityError` which is caught — but the caught path logs a warning and
continues with `profile=None`, which means `_map_user_to_response` returns
a response with all profile fields as their defaults. The profile row does
exist in the DB (the first request created it), it just isn't fetched on
the second request's failure path.

**Mitigation:**
Add a `get_or_create` pattern using `INSERT ... ON CONFLICT DO NOTHING
RETURNING *` at the repository level — this makes profile creation atomic
and eliminates the race entirely. On conflict, fetch the existing row
rather than continuing with `profile=None`.

---

### 2. `get_user_by_token` — Supabase Admin API call on every session exchange

**What happens today:**
Every call to `/auth/session` calls `auth_repo.get_user_by_token()` which
hits the Supabase Admin API (`GET /auth/v1/admin/users/{id}` or token
introspection) to validate and decode the access token.

**The risk at scale:**
At high OAuth login volume this becomes an external HTTP call per session
exchange — not pooled, not cached. Supabase rate-limits Admin API calls.
Under burst traffic (e.g. a product launch or a viral signup moment) this
can queue or fail, making every OAuth login dependent on Supabase Admin
API availability and rate limits.

**Mitigation:**
JWT access tokens are self-contained and signed — validate them locally
using the Supabase JWT secret (`SUPABASE_JWT_SECRET`) rather than making
an outbound Admin API call. Reserve Admin API calls for cases where token
revocation needs to be checked. This removes the external dependency from
the hot path entirely.

---

### 3. Profile repository — no connection pool tuning for OAuth burst

**What happens today:**
OAuth sign-ins can arrive in bursts (e.g. a "Sign in with Google" button
on a landing page driving simultaneous signups). Each request opens a DB
session via SQLAlchemy's async pool.

**The risk at scale:**
Default SQLAlchemy async pool settings (`pool_size=5`, `max_overflow=10`)
may be insufficient under burst OAuth signup traffic, causing requests to
queue waiting for a connection. This isn't OAuth-specific but OAuth
lowers the barrier to signup, which increases the likelihood of signup
bursts.

**Mitigation:**
Tune `pool_size` and `max_overflow` based on expected concurrency.
Add pool timeout monitoring. Consider a connection pooler (PgBouncer)
in front of Postgres for high-concurrency deployments.

---

### 4. `_map_user_to_response` — `user_metadata` shape is unvalidated

**What happens today:**
`user_metadata` is read with `.get()` chains — safe from `KeyError` but
the shape is entirely trust-based. If a provider changes its metadata
structure or sends unexpected fields, `full_name` silently falls back to
`None`.

**The risk at scale:**
As more OAuth providers are added (LinkedIn, Apple, etc.), each may have
a different `user_metadata` shape. The current approach accumulates
provider-specific `.get()` fallbacks inline, which doesn't scale cleanly
past two or three providers.

**Mitigation:**
Introduce a provider-aware metadata normalizer — a small mapping layer
that takes `(provider, user_metadata)` and returns a normalised dict with
guaranteed keys. This centralises provider differences and makes adding
new providers a one-function change.

---
