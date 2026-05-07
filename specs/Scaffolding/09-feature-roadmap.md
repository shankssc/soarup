# 09 — Feature Roadmap
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 00-product-vision.md

---

## Guiding principle

Ship nothing that is not production-grade. Each milestone produces a fully working, tested, deployed slice of the platform — not a prototype or demo. Features build on each other; nothing is throwaway.

The order is deliberate: infrastructure and auth first, then core user flows, then team features, then AI and notifications. Skipping ahead creates debt that slows everything down.

---

## Milestone 0 — Foundation (no user-facing features)

**Goal:** A working monorepo where both apps run locally, all quality tooling is configured, CI passes, and staging is deployed. No login screen yet — just a health endpoint.

**Acceptance criteria:**
- [ ] `make dev` starts all Docker Compose services (api, worker, beat, flower, web, db, redis, minio)
- [ ] `GET /health` returns `200` with database, redis, and worker status
- [ ] All pre-commit hooks pass on both `apps/api` and `apps/web`
- [ ] `pr-checks.yml` GitHub Actions workflow runs and passes on a test PR
- [ ] SvelteKit app builds and deploys to Cloudflare Pages (staging, showing a blank page is fine)
- [ ] FastAPI deploys to Railway (staging)
- [ ] Dependabot configured for both Python and npm
- [ ] Coderabbit configured on the repo
- [ ] `.env.example` documents every required environment variable
- [ ] `specs/` directory committed with all nine spec documents

**What you learn:** Monorepo setup, Docker Compose networking, GitHub Actions, Railway + Cloudflare Pages deploy pipelines.

---

## Milestone 1 — Auth and onboarding

**Goal:** A user can sign up, log in, and complete onboarding. A workspace is created. Nothing else works yet.

**Acceptance criteria:**
- [ ] Email + password signup with confirmation email (Supabase Auth)
- [ ] Google OAuth login
- [ ] Magic link login
- [ ] First-time onboarding: display name, timezone, default update mode
- [ ] Workspace creation with name and slug (slug uniqueness validated)
- [ ] Authenticated user sees their workspace dashboard (empty state)
- [ ] Unauthenticated users redirected to `/login`
- [ ] Session persists across page reloads
- [ ] `POST /api/v1/auth/profile` creates user profile on first login
- [ ] RLS verified: user cannot access another user's data
- [ ] Vitest tests for auth store and profile form
- [ ] Playwright E2E: signup → onboarding → dashboard flow

**What you learn:** Supabase Auth integration in SvelteKit, JWT flow end-to-end, RLS in Postgres, SvelteKit layout-level auth guards.

---

## Milestone 2 — Text update submission

**Goal:** A user can submit a text standup update. It is stored and displayed on the dashboard. No AI processing yet — raw text only.

**Acceptance criteria:**
- [ ] `POST /api/v1/workspaces/:id/updates` (text mode) stores the update
- [ ] Update appears on the dashboard immediately after submission
- [ ] User cannot submit a second update for the same date (UI prevents it, API enforces it)
- [ ] User can edit their update for the current day
- [ ] User can delete their update
- [ ] Updates display with user name, avatar, and submitted time
- [ ] Empty state shown when no updates exist for today
- [ ] API returns `202` and enqueues a (no-op for now) processing task
- [ ] Pytest integration tests for update CRUD endpoints
- [ ] Vitest tests for `UpdateForm` and `UpdateCard` components

**What you learn:** SvelteKit form actions, optimistic UI updates, SvelteKit `load` functions and data invalidation.

---

## Milestone 3 — AI processing pipeline

**Goal:** Submitted text updates are summarised by Claude. The summary appears on the dashboard. The pipeline is async and robust.

**Acceptance criteria:**
- [ ] Celery worker picks up `process_update` tasks
- [ ] Claude API call generates a summary from the raw text
- [ ] Summary stored on the `updates` row, status set to `processed`
- [ ] WebSocket message `update.status_changed` sent to connected clients
- [ ] Dashboard shows a loading state while the update is processing
- [ ] Dashboard shows the AI summary once processed
- [ ] Failed tasks retry up to 3 times with exponential backoff
- [ ] Failed tasks after max retries shown as an error state in the UI
- [ ] Celery task tests with mocked Claude API
- [ ] Flower dashboard accessible at `/flower` (basic auth protected)
- [ ] Memray CI step produces a flamegraph artifact

**What you learn:** Celery task chains, WebSocket real-time updates in Svelte, mocking external AI APIs in tests, async error handling.

---

## Milestone 4 — Voice update submission

**Goal:** A user can record a voice note as their update. It is transcribed by Whisper and summarised by Claude.

**Acceptance criteria:**
- [ ] `POST /api/v1/workspaces/:id/audio/upload-url` returns a pre-signed Minio/R2 URL
- [ ] Browser uploads audio blob directly to the pre-signed URL
- [ ] `VoiceRecorder` component: idle → recording → preview → uploading states
- [ ] `VoiceRecorder` works in Chrome, Firefox, and Safari (format handling)
- [ ] `POST /api/v1/workspaces/:id/updates` (voice mode) enqueues transcription task
- [ ] Celery worker: fetch audio from R2 → Whisper transcription → Claude summary
- [ ] Transcript stored alongside summary on the update
- [ ] Playback: user can replay their audio from the dashboard
- [ ] `GET /api/v1/workspaces/:id/updates/:id/audio` returns pre-signed playback URL
- [ ] Max file size validated (10MB) on the backend
- [ ] Vitest tests for `VoiceRecorder` component states
- [ ] Playwright E2E: record → upload → see summary flow (mocked Whisper in E2E)

**What you learn:** MediaRecorder API, pre-signed URL pattern, cross-browser audio compatibility, multi-step Celery task chains.

---

## Milestone 5 — Team features (multi-tenancy)

**Goal:** Multiple users can share a workspace. Invites work. Members see each other's updates.

**Acceptance criteria:**
- [ ] Workspace member list visible to all members
- [ ] Admin can invite a user by email (Resend sends the invite email)
- [ ] Invite link works: recipient signs up (or logs in) and joins the workspace
- [ ] Invite expires after 7 days
- [ ] Admin can remove a member
- [ ] Admin can change a member's role (member ↔ admin, not owner)
- [ ] Dashboard shows all members' updates for today, grouped by user
- [ ] Members who haven't submitted yet shown in a "pending" section
- [ ] WebSocket: when a team member submits an update, it appears on others' dashboards in real time
- [ ] RLS: member cannot access updates from a workspace they don't belong to
- [ ] Pytest integration tests for invite flow and member management
- [ ] Playwright E2E: invite flow from send to acceptance

**What you learn:** Multi-tenancy patterns, WebSocket broadcast to multiple connections, email delivery with Resend.

---

## Milestone 6 — Digests

**Goal:** The workspace receives a daily digest summarising all updates. Delivered by email.

**Acceptance criteria:**
- [ ] Celery Beat schedules `send_workspace_digests` at the workspace's configured time and timezone
- [ ] Digest aggregates all `processed` updates since the last digest
- [ ] Claude generates a team-level summary from individual summaries
- [ ] `Digest` and `DigestItem` records persisted
- [ ] Digest email sent via Resend to all workspace members
- [ ] Email uses a React Email template (rendered server-side to HTML)
- [ ] Digest visible in the app at `/history`
- [ ] `GET /api/v1/workspaces/:id/digest-settings` and `PUT` to update schedule
- [ ] Admin can configure: send time, timezone, days of week, email enabled/disabled
- [ ] `POST /api/v1/workspaces/:id/digests/preview` generates a preview without sending
- [ ] Celery beat task tests verifying correct workspace selection and timing logic

**What you learn:** Celery Beat scheduling with timezone handling, React Email templates, digest aggregation design.

---

## Milestone 7 — History and analytics

**Goal:** Users can look back at their update history. The workspace can see team activity over time.

**Acceptance criteria:**
- [ ] `/history` shows a paginated list of the user's past updates (cursor-based pagination)
- [ ] Updates filterable by date range
- [ ] Past digests accessible and readable
- [ ] User's personal submission streak displayed (consecutive days with updates)
- [ ] Workspace view: member participation rate for the last 30 days
- [ ] Simple heatmap showing which days each member submitted (GitHub contribution graph style)
- [ ] All data queries use indexes defined in the data models spec
- [ ] API response times for history queries under 300ms (p95) verified in CI

**What you learn:** Cursor-based pagination, Svelte data visualisation (heatmap built with SVG), query optimisation with Postgres indexes.

---

## Milestone 8 — Slack integration

**Goal:** Digests can be delivered to a Slack channel in addition to (or instead of) email.

**Acceptance criteria:**
- [ ] Admin can add a Slack webhook URL to digest settings
- [ ] Daily digest posted to the configured Slack channel
- [ ] Slack message formatted with Block Kit (not plain text)
- [ ] Webhook URL stored encrypted at rest
- [ ] Admin can test the Slack integration (sends a test message)
- [ ] Slack delivery tracked on the `Digest` record

---

## Milestone 9 — Building in public (personal public page)

**Goal:** Individual users can opt in to a public page showing their update history.

**Acceptance criteria:**
- [ ] User can enable a public profile at `/u/:username`
- [ ] Public page shows recent updates (summaries only, not full transcripts)
- [ ] Public page shows submission streak and heatmap
- [ ] User controls which workspaces' updates appear on the public page
- [ ] Public page requires no authentication to view
- [ ] OpenGraph tags for link previews

---

## Not on the roadmap (deliberate exclusions)

- Mobile app (web is mobile-responsive; native app is not planned)
- Video updates
- In-app chat or direct messaging
- Ticket/task management integration
- Enterprise SSO
- On-premise hosting

These are not "never" — they are "not until the core product is proven." The product vision document governs what belongs here.
