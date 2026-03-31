# 03 — API Contracts
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 01-architecture.md, 02-data-models.md

---

## Conventions

- **Base URL:** `/api/v1`
- **Authentication:** All endpoints except `/auth/*` and `/health` require a valid Supabase JWT in the `Authorization: Bearer <token>` header.
- **Content type:** `application/json` unless noted otherwise.
- **Timestamps:** ISO 8601 UTC (`2025-03-01T09:00:00Z`).
- **Errors:** All errors follow a consistent envelope:
  ```json
  {
    "error": {
      "code": "UPDATE_NOT_FOUND",
      "message": "Update with id abc123 was not found.",
      "details": {}
    }
  }
  ```
- **Pagination:** Cursor-based. All list endpoints accept `?cursor=<uuid>&limit=<int>` and return `{ data: [], next_cursor: string | null }`.
- **Versioning:** Breaking changes increment the version prefix (`/api/v2`). Additive changes (new fields, new endpoints) are non-breaking and do not require a version bump.

---

## Health

### `GET /health`
Returns API and worker health. No authentication required.

**Response `200`:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "ok",
  "redis": "ok",
  "worker": "ok"
}
```

---

## Auth

Auth token issuance and refresh are handled entirely by Supabase Auth on the client side. The API only validates tokens — it never issues them. These endpoints handle the application-level profile that exists alongside the Supabase auth record.

### `POST /api/v1/auth/profile`
Create or update the user's application profile. Called on first login and on profile updates.

**Request body:**
```json
{
  "display_name": "Suyash Chaudhary",
  "timezone": "America/Indiana/Indianapolis",
  "default_update_mode": "voice"
}
```

**Response `200`:**
```json
{
  "id": "uuid",
  "display_name": "Suyash Chaudhary",
  "timezone": "America/Indiana/Indianapolis",
  "default_update_mode": "voice",
  "onboarded_at": null,
  "created_at": "2025-03-01T00:00:00Z"
}
```

### `GET /api/v1/auth/profile`
Returns the authenticated user's profile.

---

## Workspaces

### `POST /api/v1/workspaces`
Create a new workspace. The authenticated user becomes the owner.

**Request body:**
```json
{
  "name": "My Team",
  "slug": "my-team"
}
```

**Response `201`:** Workspace object.

**Error `409`:** Slug already taken.

### `GET /api/v1/workspaces`
List all workspaces the authenticated user is a member of.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "My Team",
      "slug": "my-team",
      "role": "owner",
      "member_count": 3,
      "created_at": "2025-03-01T00:00:00Z"
    }
  ]
}
```

### `GET /api/v1/workspaces/:workspace_id`
Get a single workspace. User must be a member.

### `PATCH /api/v1/workspaces/:workspace_id`
Update workspace name. Owner only.

### `DELETE /api/v1/workspaces/:workspace_id`
Delete workspace and all data. Owner only. Requires confirmation token.

---

## Workspace members

### `GET /api/v1/workspaces/:workspace_id/members`
List all members of a workspace.

**Response `200`:**
```json
{
  "data": [
    {
      "user_id": "uuid",
      "display_name": "Suyash Chaudhary",
      "avatar_url": null,
      "role": "owner",
      "joined_at": "2025-03-01T00:00:00Z"
    }
  ]
}
```

### `POST /api/v1/workspaces/:workspace_id/invites`
Send an invite to an email address. Admin or owner only.

**Request body:**
```json
{
  "email": "teammate@example.com",
  "role": "member"
}
```

**Response `201`:** Invite object with token (for testing) and expiry.

### `POST /api/v1/invites/:token/accept`
Accept a workspace invite. Authenticated user must match the invited email.

### `DELETE /api/v1/workspaces/:workspace_id/members/:user_id`
Remove a member. Admin/owner only. Cannot remove the owner.

### `PATCH /api/v1/workspaces/:workspace_id/members/:user_id`
Update a member's role. Owner only.

---

## Updates

### `POST /api/v1/workspaces/:workspace_id/updates`
Submit a standup update. Triggers the async processing pipeline.

**Request body (text mode):**
```json
{
  "input_mode": "text",
  "raw_text": "Yesterday I finished the auth flow. Today I'm starting the update submission endpoint. No blockers.",
  "submitted_date": "2025-03-01"
}
```

**Request body (voice mode):**
```json
{
  "input_mode": "voice",
  "audio_r2_key": "audio/workspace-uuid/user-uuid/2025-03-01.webm",
  "audio_duration_seconds": 47,
  "submitted_date": "2025-03-01"
}
```

**Response `202` (Accepted):**
```json
{
  "id": "uuid",
  "status": "pending",
  "submitted_date": "2025-03-01"
}
```

The `202` signals that the update was accepted but processing is async. The frontend subscribes to the WebSocket for status updates.

**Error `409`:** An update already exists for this user on this date. Use `PATCH` to replace.

### `GET /api/v1/workspaces/:workspace_id/updates`
List updates for the workspace. Supports `?date=2025-03-01` to filter by date.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "display_name": "Suyash Chaudhary",
        "avatar_url": null
      },
      "input_mode": "voice",
      "summary": "Finished auth flow. Starting update submission endpoint. No blockers.",
      "status": "processed",
      "submitted_date": "2025-03-01",
      "created_at": "2025-03-01T09:15:00Z"
    }
  ],
  "next_cursor": null
}
```

### `GET /api/v1/workspaces/:workspace_id/updates/:update_id`
Get a single update including transcript and summary.

### `PATCH /api/v1/workspaces/:workspace_id/updates/:update_id`
Replace the content of an existing update. Triggers reprocessing. Owner of the update only.

### `DELETE /api/v1/workspaces/:workspace_id/updates/:update_id`
Delete an update. Owner of the update or workspace admin.

### `GET /api/v1/workspaces/:workspace_id/updates/:update_id/audio`
Returns a pre-signed R2 URL for streaming the original audio file. Expires in 15 minutes.

**Response `200`:**
```json
{
  "url": "https://r2.cloudflarestorage.com/...",
  "expires_at": "2025-03-01T09:30:00Z"
}
```

---

## Audio upload

### `POST /api/v1/workspaces/:workspace_id/audio/upload-url`
Request a pre-signed R2 URL for direct browser-to-storage audio upload.

**Request body:**
```json
{
  "filename": "standup-2025-03-01.webm",
  "content_type": "audio/webm",
  "size_bytes": 245760
}
```

**Response `200`:**
```json
{
  "upload_url": "https://r2.cloudflarestorage.com/...?X-Amz-Signature=...",
  "r2_key": "audio/workspace-uuid/user-uuid/2025-03-01.webm",
  "expires_at": "2025-03-01T09:20:00Z"
}
```

The browser uploads directly to `upload_url` with a `PUT` request. On success, the browser calls `POST /updates` with the `r2_key`.

---

## Digests

### `GET /api/v1/workspaces/:workspace_id/digests`
List past digests for the workspace.

### `GET /api/v1/workspaces/:workspace_id/digests/:digest_id`
Get a single digest with all included update summaries.

### `POST /api/v1/workspaces/:workspace_id/digests/preview`
Generate a preview of today's digest without sending it. Useful for testing digest settings.

### `GET /api/v1/workspaces/:workspace_id/digest-settings`
Get current digest settings.

### `PUT /api/v1/workspaces/:workspace_id/digest-settings`
Replace digest settings. Admin/owner only.

---

## WebSocket

### `WS /api/v1/ws`
Single WebSocket connection per authenticated client. Authenticated via token in query param on connect: `?token=<jwt>`.

**Server → client message types:**

```typescript
// Update processing status changed
{
  type: "update.status_changed",
  payload: {
    update_id: string,
    workspace_id: string,
    status: "processing" | "processed" | "failed",
    summary?: string
  }
}

// New update submitted by another team member
{
  type: "update.created",
  payload: {
    update_id: string,
    workspace_id: string,
    user: { id: string, display_name: string },
    submitted_date: string
  }
}

// Digest sent for the workspace
{
  type: "digest.sent",
  payload: {
    digest_id: string,
    workspace_id: string,
    digest_date: string
  }
}
```

---

## Rate limits

| Endpoint group | Limit |
|----------------|-------|
| `POST /updates` | 10 per user per hour |
| `POST /audio/upload-url` | 10 per user per hour |
| `POST /invites` | 20 per workspace per day |
| All other write endpoints | 60 per user per minute |
| All read endpoints | 120 per user per minute |

Rate limit headers are returned on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
