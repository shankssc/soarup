# 06 — Auth and Multi-tenancy
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 02-data-models.md, 03-api-contracts.md

---

## Overview

Authentication is handled entirely by Supabase Auth. The API never issues tokens — it only validates them. Multi-tenancy is workspace-based: every resource belongs to a workspace, and access is governed by membership and role.

---

## Authentication providers (v1)

| Provider | Supported in v1 |
|----------|----------------|
| Email + password | Yes |
| Magic link (email) | Yes |
| Google OAuth | Yes |
| GitHub OAuth | Yes |
| Apple OAuth | No (v2) |

OAuth providers are configured in the Supabase dashboard. No additional backend code is needed — Supabase handles the OAuth flow and issues a JWT on success.

---

## JWT validation

On every protected API request:

1. Extract `Authorization: Bearer <token>` header.
2. Fetch Supabase's JWKS (JSON Web Key Set) endpoint on startup, cache the signing keys.
3. Validate the JWT signature, expiry, and audience claim.
4. Extract `sub` (user ID) and `email` from claims.
5. Attach to the request context as `current_user`.

Token refresh is handled client-side by the Supabase JS client, which automatically refreshes before expiry. The API never handles refresh — if a token is expired, it returns `401` and the frontend refreshes.

---

## Workspace model and roles

Every user can belong to multiple workspaces. Every workspace has exactly one owner.

| Role | Capabilities |
|------|-------------|
| `owner` | All admin capabilities + delete workspace + transfer ownership |
| `admin` | Invite members, remove members, change roles (up to admin), update digest settings |
| `member` | Submit updates, view team updates and digests, update own profile |

Role hierarchy: `owner > admin > member`. A user cannot grant a role higher than their own.

---

## Workspace creation flow

1. Authenticated user calls `POST /api/v1/workspaces`.
2. API creates a `workspaces` row with `owner_id = current_user.id`.
3. API creates a `workspace_members` row with `role = owner`.
4. API creates a `digest_settings` row with sensible defaults.
5. Frontend redirects to `/settings/workspace` for configuration.

A user can create multiple workspaces. There is no limit on the free tier (subject to review).

---

## Invite flow

```
Admin                     API                        Invitee
  |                         |                            |
  |-- POST /invites -------->|                            |
  |                         |-- persist invite w/ token  |
  |                         |-- send email via Resend --->|
  |<-- 201 invite object ----|                            |
  |                         |                            |
  |                         |           (invitee clicks link)
  |                         |<-- GET /invite/:token ------|
  |                         |-- validate token + expiry   |
  |                         |-- return workspace preview --|
  |                         |<-- POST /invites/:token/accept
  |                         |-- create workspace_member   |
  |                         |-- mark invite accepted      |
  |                         |-- return workspace object -->|
```

**Token security:**
- Tokens are 32-byte cryptographically random values (`secrets.token_urlsafe(32)`).
- Tokens expire after 7 days.
- Tokens are single-use — marked `accepted_at` on use.
- The invited email must match the authenticated user's email on accept.

---

## Row-level security (Postgres RLS)

RLS is the last line of defence — even if there is a bug in the application layer, the database will not return data that belongs to another user's workspace.

### Key RLS policies

**`updates` — read policy:**
```sql
CREATE POLICY "workspace_members_can_read_updates"
ON updates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_members.workspace_id = updates.workspace_id
    AND workspace_members.user_id = auth.uid()
  )
);
```

**`updates` — write policy:**
```sql
CREATE POLICY "users_can_write_own_updates"
ON updates FOR INSERT
WITH CHECK (user_id = auth.uid());
```

**`user_profiles` — read/write:**
```sql
CREATE POLICY "users_own_their_profile"
ON user_profiles FOR ALL
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
```

All tables with user data have RLS enabled. RLS is enabled by default in all new Supabase projects — the CI pipeline includes a test that verifies RLS is enabled on every user-facing table.

---

## Session and token lifecycle

| Event | Action |
|-------|--------|
| User signs up | Supabase creates `auth.users` row, sends confirmation email |
| User confirms email | Supabase marks email confirmed, session begins |
| User logs in | Supabase issues access token (1 hour) + refresh token (1 week) |
| Access token expires | Supabase JS client silently refreshes using refresh token |
| Refresh token expires | User redirected to `/login` |
| User signs out | Supabase revokes refresh token |
| User deletes account | `auth.users` row deleted → cascades to `user_profiles`, `workspace_members` (user's memberships removed but workspaces persist) |

---

## Workspace deletion

Deleting a workspace is a destructive, irreversible action:

1. Owner calls `DELETE /api/v1/workspaces/:id` with a `confirmation_token` in the body (a short code displayed in the UI that the user must type).
2. API verifies the token matches and that the caller is the owner.
3. All related data is deleted in order: `digest_items`, `digests`, `updates` (audio files deleted from R2 separately), `workspace_members`, `workspace_invites`, `digest_settings`, `workspaces`.
4. R2 audio file deletion is a background task — files are marked for deletion and a Celery task cleans them up. If the task fails, a retry handles it.
5. A confirmation email is sent to the owner after deletion.

---

## Ownership transfer (v2)

Not in v1. Current workaround: owner adds new owner as admin, owner leaves workspace, admin is manually promoted to owner via a support request.

---

## Personal workspace (v2)

In v1, every user must create a workspace explicitly. In v2, a personal workspace is auto-created on signup for solo use — no team invite needed to start submitting updates.

---

## Security hardening checklist

- [ ] Supabase Auth email confirmation required before login
- [ ] Password minimum 8 characters enforced by Supabase
- [ ] JWT secrets never logged or included in error responses
- [ ] Invite tokens are constant-time compared (`hmac.compare_digest`)
- [ ] RLS enabled and verified by CI on all user-facing tables
- [ ] All admin actions (delete workspace, remove member, change role) are logged to structured logs with actor + target
- [ ] `detect-secrets` baseline committed, runs on every commit
- [ ] `bandit` S105 (hardcoded passwords) and S106 (hardcoded tokens) rules enabled
