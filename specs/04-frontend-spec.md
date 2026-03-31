# 04 — Frontend Spec
> **Status:** Living document · **Last updated:** 2025-03 · **References:** 01-architecture.md, 03-api-contracts.md

---

## Stack

| Concern | Tool | Why |
|---------|------|-----|
| Framework | Next.js 14 (App Router) | Existing React strength, file-based routing, RSC for data-heavy pages, infra freedom via `@cloudflare/next-on-pages` |
| Language | TypeScript (strict) | Existing strength, consistent with backend type discipline |
| Styling | Tailwind CSS | Existing strength, consistent utility-first design |
| UI components | TBD post-Google Stitch frames | shadcn/ui, Radix UI, or Headless UI — decision deferred until design frames exist |
| Component docs | Storybook (React CSF) | Isolated development, visual testing, reuse documentation — existing familiarity from auntEDNA |
| Server state | TanStack Query (React Query) | Cache management, background refetching, optimistic updates — pairs naturally with App Router |
| Client state | Zustand | Lightweight, minimal boilerplate for auth + workspace + WebSocket state |
| HTTP client | `fetch` + custom typed wrapper | Native fetch with typed error handling, no axios |
| WebSocket | Native WebSocket + Zustand store | Reactive, sufficient for the message volume |
| Forms | React Hook Form + Zod | Existing familiarity, performant, typed validation |
| Testing | Vitest + React Testing Library | Component + unit tests |
| E2E | Playwright | Critical user flows |
| Accessibility | axe-core (vitest-axe) + Lighthouse CI | Automated a11y checks in CI |
| Hosting | Cloudflare Pages via `@cloudflare/next-on-pages` | Free, global CDN, no Vercel lock-in |

---

## Why App Router over Pages Router

App Router (Next.js 13+) is the current direction of the framework. React Server Components allow data fetching directly in the component tree without client-side waterfalls — particularly useful for the dashboard (loading today's updates) and history pages. Client components opt in with `'use client'` where interactivity is needed (forms, voice recorder, WebSocket-driven updates). This is the pattern hiring managers expect to see in 2025.

---

## Cloudflare Pages compatibility

Next.js on Cloudflare Pages requires `@cloudflare/next-on-pages` and the Edge Runtime. Key constraints:

- Pages and routes that use Node.js-only APIs must be marked `export const runtime = 'edge'`
- No `fs`, `child_process`, or Node built-ins in server components
- `next/image` uses Cloudflare's image resizing — no additional config needed

This is a deliberate trade-off: infra freedom and zero hosting cost in exchange for being slightly more careful about which Node APIs we use. Since all API work lives in FastAPI, the Next.js app is mostly UI and data-fetching — the Edge Runtime constraint rarely bites in practice.

---

## Project structure

```
apps/web/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout (fonts, providers)
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── signup/
│   │   │       └── page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx          # App shell (auth guard, nav, WS init)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx        # Today's updates (Server Component)
│   │   │   ├── submit/
│   │   │   │   └── page.tsx        # Update submission
│   │   │   ├── history/
│   │   │   │   ├── page.tsx        # Paginated past updates
│   │   │   │   └── digests/
│   │   │   │       └── [id]/
│   │   │   │           └── page.tsx
│   │   │   ├── settings/
│   │   │   │   ├── profile/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── workspace/
│   │   │   │       ├── page.tsx
│   │   │   │       └── members/
│   │   │   │           └── page.tsx
│   │   │   └── invite/
│   │   │       └── [token]/
│   │   │           └── page.tsx
│   │   ├── error.tsx               # Global error boundary
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/                     # Primitive components (Button, Input, Modal, etc.)
│   │   └── domain/                 # Feature-specific (UpdateCard, DigestView, VoiceRecorder, etc.)
│   ├── hooks/
│   │   ├── useAuth.ts              # Current user + session
│   │   ├── useWorkspace.ts         # Active workspace state
│   │   ├── useWebSocket.ts         # WS connection + message subscription
│   │   └── useAudioRecorder.ts     # MediaRecorder wrapper
│   ├── stores/
│   │   ├── auth.ts                 # Zustand: session, user profile
│   │   ├── workspace.ts            # Zustand: active workspace, members
│   │   └── socket.ts               # Zustand: WS connection, message bus
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts           # Base fetch wrapper (auth headers, error envelope)
│   │   │   ├── updates.ts          # Update CRUD
│   │   │   ├── workspaces.ts       # Workspace + member operations
│   │   │   └── digests.ts          # Digest operations
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser Supabase client
│   │   │   └── server.ts           # Server Supabase client (RSC + Server Actions)
│   │   └── utils/
│   │       ├── date.ts             # Date formatting, timezone handling
│   │       ├── audio.ts            # Browser audio recording utilities
│   │       └── cn.ts               # Tailwind class merging (clsx + tailwind-merge)
│   └── types/
│       ├── database.ts             # Auto-generated from Supabase schema (do not edit)
│       └── api.ts                  # API request/response types
├── tests/
│   ├── unit/                       # Vitest component + hook tests
│   └── e2e/                        # Playwright tests
├── .storybook/
├── stories/
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .eslintrc.cjs
├── .prettierrc
├── vitest.config.ts
└── playwright.config.ts
```

---

## Routing and page map

| Route | Component type | Description | Auth required |
|-------|---------------|-------------|---------------|
| `/login` | Client | Email/password + OAuth login | No |
| `/signup` | Client | Account creation | No |
| `/onboarding` | Client | First-time profile + workspace setup | Yes |
| `/dashboard` | Server + Client | Today's team updates, submit CTA | Yes |
| `/submit` | Client | Update submission (voice or text) | Yes |
| `/history` | Server + Client | Paginated past updates + digests | Yes |
| `/history/digests/[id]` | Server | Single digest view | Yes |
| `/settings/profile` | Client | User profile, timezone, preferences | Yes |
| `/settings/workspace` | Client | Workspace name, digest schedule | Yes (admin) |
| `/settings/workspace/members` | Client | Member list, invite, remove | Yes (admin) |
| `/invite/[token]` | Client | Accept workspace invite | Yes |

Pages marked "Server + Client" use a Server Component for initial data fetch and a Client Component child for interactive/real-time elements.

---

## Authentication flow

1. User arrives at any `(app)` route → `(app)/layout.tsx` checks the Supabase session server-side.
2. No session → redirect to `/login` via `redirect()` from `next/navigation`.
3. On login → Supabase Auth handles the token, stores in cookies (SSR-compatible via `@supabase/ssr`).
4. JWT is attached to all API calls by `lib/api/client.ts`.
5. First login (no `user_profile`) → redirect to `/onboarding`.
6. After onboarding → redirect to `/dashboard`.

Supabase Auth in Next.js App Router uses `@supabase/ssr` — this provides both a browser client and a server client that reads cookies, critical for Server Components to access the session without prop-drilling.

---

## Server vs Client component decision rule

**Default to Server Components.** Add `'use client'` only when the component needs:
- `useState`, `useEffect`, `useReducer`, or other React hooks
- Browser APIs (`window`, `MediaRecorder`, `WebSocket`)
- Event listeners
- Real-time WebSocket-driven updates

**Examples:**
- `DashboardPage` → Server Component (fetches today's updates on the server)
- `UpdateCard` → Server Component (pure display)
- `UpdateForm` → Client Component (form state, validation, submission)
- `VoiceRecorder` → Client Component (MediaRecorder API)
- `LiveUpdateFeed` → Client Component (WebSocket-driven real-time updates)
- `DigestView` → Server Component (read-only display)

---

## State management approach

**Server state (API data):** TanStack Query manages all client-side data fetching, caching, and invalidation. Server Components fetch directly without TanStack Query.

```typescript
// Client component example
const { data: updates, isLoading } = useQuery({
  queryKey: ['updates', workspaceId, date],
  queryFn: () => api.updates.list(workspaceId, { date }),
});
```

**Auth + workspace state:** Zustand stores hold the current session, user profile, and active workspace. Initialised from the Supabase session on app load.

**WebSocket message bus:** Zustand `socket` store wraps the native WebSocket. Components subscribe to specific message types via `useWebSocket`:

```typescript
useEffect(() => {
  return subscribe('update.status_changed', (payload) => {
    queryClient.invalidateQueries({ queryKey: ['updates', payload.workspace_id] });
  });
}, [subscribe, queryClient]);
```

**Form state:** React Hook Form handles all form state locally. Zod schemas validate on submit and on blur.

---

## TypeScript configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "plugins": [{ "name": "next" }]
  }
}
```

---

## Component architecture

### Primitive components (`components/ui/`)
Building blocks with a Storybook story and Vitest tests for rendering, props, and accessibility.

Examples: `Button`, `Input`, `Textarea`, `Modal`, `Badge`, `Avatar`, `Spinner`, `Toast`, `Dropdown`, `Select`

The UI library choice (post-Stitch frames) will either wrap or replace these primitives — the abstraction layer means the decision is self-contained and reversible.

### Domain components (`components/domain/`)
Composed from primitives, tied to application data shapes.

Examples: `UpdateCard`, `UpdateForm`, `VoiceRecorder`, `DigestView`, `MemberRow`, `WorkspaceSwitcher`, `LiveUpdateFeed`

### Layouts
`(app)/layout.tsx` renders the app shell — navigation, workspace switcher, notification area — and initialises the WebSocket connection and Zustand stores on the client side.

---

## Audio recording

`hooks/useAudioRecorder.ts` wraps the browser `MediaRecorder` API:

- Checks for `MediaRecorder` support and requests microphone permission.
- Records in `audio/webm` (Chrome/Firefox) or `audio/mp4` (Safari) via MIME type detection.
- Returns a `Blob` with duration metadata on stop.
- `VoiceRecorder` component manages the UI state machine: `idle → recording → stopped → uploading`.

Upload flow:
1. `VoiceRecorder` calls `POST /api/v1/workspaces/:id/audio/upload-url`.
2. `PUT` the `Blob` directly to the pre-signed R2 URL.
3. On success, calls `POST /api/v1/workspaces/:id/updates` with the `r2_key`.
4. TanStack Query invalidates the updates query, dashboard reflects the new pending update.

---

## Accessibility requirements

- All interactive elements keyboard-navigable.
- All form inputs have associated labels (React Hook Form's `register` paired with explicit `<label htmlFor>`).
- All images have `alt` text.
- Colour contrast meets WCAG 2.1 AA.
- `VoiceRecorder` uses `aria-live` regions to announce recording state changes to screen readers.
- `vitest-axe` runs `toHaveNoViolations()` in every component test.
- Lighthouse CI runs on the staging deploy and fails the pipeline if accessibility score drops below 90.

---

## Environment variables

Next.js public variables prefixed with `NEXT_PUBLIC_`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_BASE_URL=https://api.standupbuddy.dev/api/v1
NEXT_PUBLIC_WS_URL=wss://api.standupbuddy.dev/api/v1/ws
```

Server-only variables (used in Server Components and Server Actions, never exposed to the client):

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## Error handling

`lib/api/client.ts` is the single entry point for all API calls. It:
- Attaches the auth header from the Supabase session.
- Parses the error envelope `{ error: { code, message } }` from the API.
- Throws a typed `ApiError` with `code`, `message`, and HTTP status.
- Reports 5xx errors to Sentry.

TanStack Query's `onError` callbacks handle errors at the query/mutation level. A global toast store surfaces transient error messages. Route-level errors fall through to `error.tsx`.
