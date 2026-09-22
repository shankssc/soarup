# SoarUp — Architecture

This is the current source of truth for how SoarUp is built and deployed.
It supersedes `specs/Scaffolding/01-architecture.md` and
`specs/architecture/milestone-3-flows.md`, both of which describe the
system as originally scoped rather than as it now runs in production —
most notably, the real-time layer has since moved from Redis pub/sub to
Redis Streams, and several reliability fixes have landed on top of that.

All diagrams below are Mermaid and render natively on GitHub — no image
export needed.

---

## 1. System & Deployment Topology

```mermaid
flowchart TB
    subgraph Client
        U((Browser))
    end

    subgraph Edge["Cloudflare"]
        FE[Next.js<br/>Cloudflare Workers<br/>via OpenNext]
        R2[(R2 Object Storage<br/>avatars · voice audio)]
    end

    subgraph VM["Self-managed VM (Docker)"]
        CADDY[Caddy<br/>reverse proxy · auto HTTPS]
        API[FastAPI<br/>REST + WebSocket]
        WORKER[Celery Worker<br/>transcription · summarization · email · Slack]
        BEAT[Celery Beat<br/>digest scheduler, 5-min tick]
        REDIS[(Redis<br/>task queue · event streams · rate limits)]
    end

    subgraph Managed["Managed Services"]
        SB[(Supabase<br/>Postgres + Auth)]
        ANTHROPIC[Anthropic Claude]
        RESEND[Resend<br/>transactional email]
        SLACK[Slack<br/>incoming webhooks]
        SENTRY[Sentry<br/>error tracking]
    end

    U --> FE
    FE -- HTTPS / WSS --> CADDY
    CADDY --> API
    API --> SB
    API --> REDIS
    API --> R2
    WORKER --> REDIS
    WORKER --> SB
    WORKER --> R2
    WORKER --> ANTHROPIC
    WORKER --> RESEND
    WORKER --> SLACK
    BEAT --> REDIS
    API -.errors.-> SENTRY
    FE -.errors.-> SENTRY

    style VM fill:#1a1a2e,color:#fff
    style Edge fill:#0f2942,color:#fff
    style Managed fill:#1f2d1f,color:#fff
```

**Why this shape, not a fully serverless one:** the backend runs three
coordinated long-lived processes (API, worker, beat) that all need to
stay up continuously and share state via Redis — a scale-to-zero edge
runtime can't host a persistent scheduler (`beat`'s 5-minute digest tick
needs a process that never goes cold). The frontend has no such
constraint, so it runs on Cloudflare's edge for latency and cost.
Everything stateful (Postgres, object storage, email, AI) is a managed
service — only compute for the three coordinated processes is
self-hosted.

**Environments:** `feature/*` branches deploy nowhere (local only).
`develop` auto-deploys to staging. `main` is the production target,
promoted manually from `develop` once staging is verified. Each
environment has its own Supabase project, Redis instance, R2 bucket, and
Sentry project — no shared state between staging and production.

---

## 2. Update Processing Pipeline

Every submitted update — text or voice — moves through the same state
machine. The Celery worker owns every transition after the initial
`pending` state.

```mermaid
stateDiagram-v2
    direction LR

    [*] --> pending : POST /updates<br/>UpdateService.submit_update()<br/>(server-side date + timezone validated)

    pending --> processing : Worker picks up task<br/>publish update.status_changed

    processing --> processed : Claude returns summary<br/>publish update.status_changed

    processing --> processing : Exception, retries < max<br/>escalate Haiku → Sonnet on retry 1

    processing --> failed : Exception, retries exhausted<br/>publish update.status_changed

    processed --> [*]
    failed --> [*]

    note right of processing
        Voice updates add one prior step:
        R2 download → faster-whisper transcription
        → transcript feeds the same Claude summarization call
        Attempt 0: claude-haiku (cheap, fast)
        Attempt 1+: claude-sonnet (fallback on retry)
        max_retries=3, exponential backoff with jitter
    end note
```

Both the submission endpoint and the Celery task are rate-limited /
resilient independently: submission is protected by GCRA rate limiting
(per authenticated user, not per IP — this is a team tool, and IP-based
limits would let one teammate's burst throttle a shared office
connection); the Celery task uses `NullPool` on its database engine
specifically because each task invocation runs under a fresh `asyncio`
event loop (`asyncio.run()`), and a normal connection pool's cached
connections don't survive across event loop boundaries.

---

## 3. Real-Time Event Delivery (Redis Streams, not pub/sub)

This is the layer that pushes "Processing…" → "Summarised" status
changes into the browser without a page refresh. It's built on **Redis
Streams**, not plain pub/sub — the distinction matters: pub/sub is
fire-and-forget (a message published while nobody is subscribed is gone
forever), while a Stream is a durable, replayable log. A client that
reconnects after a network blip can ask "give me everything since event
ID X" and receive exactly what it missed.

```mermaid
sequenceDiagram
    autonumber
    participant W as Celery Worker
    participant DB as Postgres
    participant R as Redis Stream<br/>(per workspace)
    participant API as FastAPI<br/>(WS endpoint)
    participant FE as Browser

    Note over W: _process_update_async()

    W->>DB: update_status("processing")
    W->>R: XADD workspace:{id} {status: processing}
    R-->>API: XREAD (blocking, from last_event_id)
    API-->>FE: ws.send_json({status: "processing"})
    FE->>FE: useDashboardUpdates patches React Query cache
    Note over FE: Badge → "Processing…"

    W->>W: transcribe (voice only) + summarise via Claude

    W->>DB: update_status("processed", summary)
    W->>R: XADD workspace:{id} {status: processed, summary}
    R-->>API: XREAD picks up new entry
    API-->>FE: ws.send_json({status: "processed", summary})
    FE->>FE: cache patched — summary renders
    Note over FE: Badge → "Summarised"
```

### Connection lifecycle (browser side)

```mermaid
flowchart TD
    A([Hook mounts]) --> B{workspaceId +<br/>accessToken present?}
    B -- No --> C([Idle])
    B -- Yes --> D[Open WebSocket<br/>cursor = last_event_id ?? '0']
    D --> E[connecting]
    E --> F{Result}

    F -- onopen --> G[connected<br/>reconnectAttempts → 0<br/>refetchQueries — forces fresh data,<br/>not just invalidate]
    G --> H[Listen]
    H --> I[onmessage: parse, store<br/>last_event_id, dispatch]
    I --> H

    F -- onerror --> K[close]
    K --> L{close code}
    H --> L

    L -- 4001 Unauthorized --> M([Terminal — re-auth required])
    L -- other --> O{attempts < 10?}
    O -- No --> P([Terminal — manual reload])
    O -- Yes --> R[reconnecting<br/>exponential backoff + jitter]
    R --> S[setTimeout → reconnect]
    S --> D

    T([Unmount]) --> U[clear timers, close socket]

    style M fill:#ff4444,color:#fff
    style P fill:#ff4444,color:#fff
    style C fill:#888,color:#fff
```

**Two reliability fixes worth calling out**, since they were real bugs
found during hardening, not part of the original design:

- **Cursor defaults to `'0'` (full history), not `'$'` (new entries
  only).** A first-time connection using `'$'` could miss an event
  published in the gap between JWT validation completing and the
  `XREAD` actually starting — a real, observed race, not a theoretical
  one.
- **Reconnect uses `refetchQueries`, not `invalidateQueries`.**
  `invalidateQueries` only marks data stale; if nothing is actively
  re-rendering at that instant, the fetch doesn't fire until something
  else triggers it. `refetchQueries` forces the fetch immediately on
  reconnect, closing that gap.

---

## 4. Digest Scheduling Pipeline

A separate async pipeline from the per-update processing above — this
one runs on a schedule rather than in response to a user action, and
fans out to two delivery channels.

```mermaid
sequenceDiagram
    autonumber
    participant B as Celery Beat
    participant W as Celery Worker
    participant DB as Postgres
    participant AI as Claude
    participant R as Resend
    participant S as Slack

    loop every 5 minutes
        B->>W: check_and_send_digests()
    end
    W->>DB: find workspaces due<br/>(configured send time + timezone + digest days)
    W->>DB: fetch today's processed updates for each due workspace
    W->>AI: summarise across all updates → team-level digest
    AI-->>W: digest summary
    W->>DB: create Digest + DigestItem rows

    loop per opted-in member (WorkspaceMember.email_notifications)
        W->>W: generate signed HMAC unsubscribe token (per-recipient)
        W->>R: send digest email (unique unsubscribe link per recipient)
    end

    alt Slack integration enabled for workspace
        W->>S: post digest as Block Kit message<br/>(decrypted webhook URL, Fernet)
    end

    W->>DB: mark digest delivered
```

Recipient filtering is **per-workspace**, not a single global opt-out —
a user can unsubscribe from one team's digests without affecting others
they belong to. The unsubscribe token is HMAC-signed (tamper-evident,
not reversible — deliberately a different primitive from the Fernet
encryption used for Slack webhook URLs, which _do_ need to be
decrypted back to a usable URL).

---

## 5. OAuth Authentication Flow (PKCE)

Google and GitHub sign-in run alongside the original email/password
flow — same `profiles` table, same onboarding step, same
`LoginResponse` shape returned to the frontend. Supabase's GoTrue
handles the actual provider handshake; the app's job is limited to
completing the PKCE code exchange client-side and syncing the
resulting session into the app's Zustand store and the app's own
profile row.

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser
    participant P as Google / GitHub
    participant SB as Supabase (GoTrue)
    participant FE as Next.js /callback
    participant API as FastAPI

    U->>FE: Click "Continue with Google/GitHub"
    FE->>SB: signInWithOAuth()<br/>(PKCE verifier stored in a cookie)
    SB->>P: redirect to provider consent screen
    P-->>U: consent screen
    U->>P: grant access
    P-->>SB: redirect with authorization code
    SB-->>FE: redirect to /callback?code=...
    FE->>SB: exchangeCodeForSession(code)<br/>(verifier read back from the cookie)
    SB-->>FE: access_token + refresh_token + user
    FE->>API: POST /auth/session
    API->>API: get-or-create profile row<br/>(first OAuth login only)
    API-->>FE: LoginResponse — same shape as password login
    FE->>FE: hydrateSession() → Zustand store
    FE-->>U: redirect to /onboarding or /dashboard
```

**One reliability fix worth calling out**, found during staging QA
rather than part of the original design:

- **A duplicate `/callback?code=...` navigation can consume the PKCE
  code twice.** A second navigation to the same callback URL —
  observed in practice with Chrome's speculative prerendering —
  re-attempts an already-redeemed code, and GoTrue correctly rejects it
  (`AuthPKCECodeVerifierMissingError` — the verifier cookie is deleted
  after its first successful use). Rather than surface that as a hard
  failure, the callback page checks for an already-established session
  via `supabase.auth.getSession()` before giving up: if an earlier,
  successful exchange already produced a session, the second call
  falls back to it instead of showing the user a spurious error.

---

## 6. Data Model

Core entities and their relationships. Field lists are illustrative, not
exhaustive — see `apps/api/app/models/` for the full SQLAlchemy models.

```mermaid
erDiagram
    PROFILE ||--o{ WORKSPACE_MEMBER : "belongs to many"
    WORKSPACE ||--o{ WORKSPACE_MEMBER : "has many"
    WORKSPACE ||--o{ WORKSPACE_INVITE : "has many"
    WORKSPACE ||--o{ UPDATE : "has many"
    WORKSPACE ||--o{ DIGEST : "has many"
    DIGEST ||--o{ DIGEST_ITEM : "has many"
    UPDATE ||--o| DIGEST_ITEM : "referenced by"
    PROFILE ||--o{ UPDATE : "submits many"

    PROFILE {
        uuid id PK
        string username UK "nullable, public profile handle"
        string full_name
        string avatar_url
        string bio
        string tagline
        bool profile_public
        string timezone
    }

    WORKSPACE {
        uuid id PK
        string name
        string digest_send_time
        string digest_days "e.g. Mon-Fri"
        string digest_timezone
        string slack_webhook_url_encrypted "Fernet"
        bool slack_digest_enabled
        bool slack_updates_enabled
    }

    WORKSPACE_MEMBER {
        uuid workspace_id FK
        uuid user_id FK
        string role "owner|admin|member"
        bool email_notifications "per-workspace opt-out"
    }

    WORKSPACE_INVITE {
        uuid id PK
        uuid workspace_id FK
        string email
        string token UK
        datetime expires_at
        bool used
    }

    UPDATE {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        string mode "text|voice"
        string content
        string transcript "voice only"
        string summary
        string status "pending|processing|processed|failed"
        date update_date
    }

    DIGEST {
        uuid id PK
        uuid workspace_id FK
        date digest_date
        string team_summary
        bool delivered
    }

    DIGEST_ITEM {
        uuid id PK
        uuid digest_id FK
        uuid update_id FK
    }
```

Notable constraints: one `Update` per `(workspace_id, user_id,
update_date)` — enforced at the database level, not just in application
logic. `username` is unique but nullable — most users never set one
unless they opt into a public profile. `Profile` rows are created in
two ways: a provisional row on any first-time sign-in (password, OAuth,
or invite), fully populated once onboarding completes.

---

## 7. Security & Reliability Notes

A few decisions worth documenting explicitly rather than leaving
implicit in code:

- **Rate limiting (GCRA)** is keyed per authenticated user rather than
  per IP, because SoarUp is a team tool and teammates legitimately share
  office/VPN IPs — IP-keying would let one person's activity throttle
  an entire team.
- **Slack webhook URLs are encrypted at rest** (Fernet, dedicated
  encryption key, separate from other application secrets) since a
  leaked webhook URL would let an attacker post into a customer's Slack
  channel.
- **Unsubscribe tokens are HMAC-signed, not encrypted** — the token only
  needs to be tamper-evident (can't be forged), not reversible, so a
  simpler and more appropriate primitive is used than for the Slack
  case above.
- **JWT issuer validation** checks Supabase's actual `iss` claim
  (`{supabase_url}/auth/v1`), not just the bare project URL — a subtle
  mismatch that silently breaks auth if missed.
- **OAuth `user_metadata` shape differs by provider** — Google exposes
  the display name as `full_name`, GitHub exposes it as `name`. Profile
  sync checks both, so a provider-specific quirk doesn't silently drop
  the user's display name on first login.
- **PII collection is explicitly disabled in Sentry** on both frontend
  and backend — error tracking without incidentally warehousing user
  data.

---

## Known limitations / active tradeoffs

Tracked as labeled GitHub issues rather than left implicit:
`tech-debt` for deferred engineering work, `security` for anything with
a security dimension, `post-m9` for backlog items scoped after the
initial nine-milestone feature set. See the
[issues page](https://github.com/shankssc/soarup/issues) for the current,
authoritative list — it changes more often than this document should.

Scaling considerations specific to the OAuth milestone are tracked
separately in
[`docs/scaling/oauth-milestone-scaling-challenges.md`](./scaling/oauth-milestone-scaling-challenges.md).
