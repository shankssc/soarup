# SoarUp — Milestone 3: Architecture Flow Diagrams

# Path: specs/architecture/milestone-3-flows.md

# Last updated: Milestone 3

---

## Diagram 1: Celery Pipeline State Machine

The update processing pipeline transitions an `Update` row through four
statuses. The Celery task owns all transitions after the initial `pending`
state set by `UpdateService.submit_update()`. Each transition writes to the
DB and publishes a WebSocket event. Retries escalate from Haiku to Sonnet
on the first retry, then continue with Sonnet until max retries are exhausted.

```mermaid
stateDiagram-v2
    direction LR

    [*] --> pending : POST /updates\nUpdateService.submit_update()

    pending --> processing : Celery worker picks up task\nupdate_repo.update_status()\npublish_event(status=processing)

    processing --> processed : Claude API returns summary\nupdate_repo.update_status(summary=...)\npublish_event(status=processed)

    processing --> processing : Exception raised\nretries < max_retries\nautoretry_for fires\n[retry 1: Haiku→Sonnet]

    processing --> failed : Exception raised\nretries >= max_retries\nupdate_repo.update_status()\npublish_event(status=failed)

    processed --> [*]
    failed --> [*]

    note right of processing
        attempt 0: claude-haiku (use_fallback=False)
        attempt 1+: claude-sonnet (use_fallback=True)
        max_retries=3, backoff=30s→60s→120s+jitter
    end note
```

---

## Diagram 2: WebSocket Pub/Sub Data Flow

This sequence diagram traces the full path of a single `update.status_changed`
event from the Celery worker publishing it to the `UpdateCard` rerendering
in the browser. Three separate processes are involved: the Celery worker
(separate process), the FastAPI API server (handles both HTTP and WebSocket),
and the Next.js frontend (browser tab).

The critical design point is that the Celery worker never talks to the
frontend directly — Redis pub/sub is the decoupling layer. The API server
subscribes to the Redis channel via `broadcaster` and forwards events to
all connected WebSocket clients in that workspace. The frontend's
`useDashboardUpdates` hook patches the React Query cache surgically, so
only the affected `UpdateCard` rerenders.

```mermaid
sequenceDiagram
    autonumber

    participant W as Celery Worker
    participant DB as PostgreSQL
    participant R as Redis<br/>(pub/sub)
    participant API as FastAPI<br/>(WS endpoint)
    participant FE as Browser<br/>(React)

    Note over W: Task: _process_update_async()

    W->>DB: update_repo.update_status("processing")
    W->>R: redis.publish("workspace:{id}", {status: "processing"})
    R-->>API: broadcast.subscribe receives event
    API-->>FE: ws.send_json({type: "update.status_changed", status: "processing"})
    FE->>FE: useWebSocket.onmessage → dispatch(message)
    FE->>FE: useDashboardUpdates handler fires
    FE->>FE: queryClient.setQueryData → UpdateCard rerenders
    Note over FE: Badge shows "Processing..." + skeleton

    W->>API: await summarise(prompt, use_fallback=False)
    API-->>W: summary text returned

    W->>DB: update_repo.update_status("processed", summary=summary)
    W->>R: redis.publish("workspace:{id}", {status: "processed", summary: "..."})
    R-->>API: broadcast.subscribe receives event
    API-->>FE: ws.send_json({type: "update.status_changed", status: "processed"})
    FE->>FE: dispatch(message) → useDashboardUpdates
    FE->>FE: queryClient.setQueryData patches status + summary
    Note over FE: Badge → "Summarised"\nSummary text appears
```

---

## Diagram 3: Frontend WebSocket Connection Lifecycle

This flowchart shows the complete lifecycle of the `useWebSocket` hook from
mount to unmount. The two terminal states are `error` (4001 — unauthorized,
no recovery) and `disconnected` (max retries exhausted — requires manual
reload). All other close events trigger exponential backoff reconnection.

The `onopen` handler is the only place where React Query cache invalidation
fires — this catches any `update.status_changed` events that were published
while the connection was down, since Redis pub/sub has no persistence.

```mermaid
flowchart TD
    A([Hook mounts]) --> B{workspaceId\naccessToken\nenabled?}
    B -- No --> C([Stay idle])
    B -- Yes --> D[new WebSocket\nwss://...workspaceId?token=...]
    D --> E[status → connecting]

    E --> F{Connection\nresult}

    F -- onopen --> G[status → connected\nreconnectAttempts → 0\nqueryClient.invalidateQueries]
    G --> H[Listen for messages]
    H --> I[onmessage]
    I --> J[JSON.parse\nsetLastEventId\ndispatch to registry]
    J --> H

    F -- onerror --> K[ws.close]
    K --> L{onclose\ncode?}

    H --> L

    L -- 4001 Unauthorized --> M[status → error]
    M --> N([Terminal — no reconnect\nUser must re-authenticate])

    L -- Other code --> O{reconnectAttempts\n< MAX_10?}

    O -- No --> P[status → disconnected]
    P --> Q([Terminal — manual reload\nConnectionIndicator shows button])

    O -- Yes --> R[status → reconnecting\nincrementReconnectAttempts\ngetReconnectDelay with jitter]
    R --> S[setTimeout → connect]
    S --> D

    T([Hook unmounts]) --> U[clearTimeout\nws.close\nstatus → idle\nreconnectAttempts → 0]

    style M fill:#ff4444,color:#fff
    style P fill:#ff4444,color:#fff
    style C fill:#888,color:#fff
    style N fill:#ff4444,color:#fff
    style Q fill:#ff4444,color:#fff
```

---

## Reading These Diagrams Together

The three diagrams represent three different levels of the same system:

**Diagram 1** — what happens to data (Update row status transitions in the DB).

**Diagram 2** — how that data change propagates across processes (Worker → Redis → API → Browser).

**Diagram 3** — how the browser maintains the connection that makes Diagram 2 possible.

A useful mental model: Diagram 1 is the **what**, Diagram 2 is the **how across processes**, and Diagram 3 is the **how within the browser**.

---

## Retry Timing Reference

The exponential backoff in `useWebSocket` uses full jitter. Approximate
delays per attempt (vary due to jitter):

| Attempt | Base delay | With jitter (50–100%) |
| ------- | ---------- | --------------------- |
| 1       | 1s         | 0.5–1s                |
| 2       | 2s         | 1–2s                  |
| 3       | 4s         | 2–4s                  |
| 4       | 8s         | 4–8s                  |
| 5       | 16s        | 8–16s                 |
| 6+      | 30s (cap)  | 15–30s                |

Max 10 attempts. Total wall time to exhaustion: approximately 2–4 minutes
depending on jitter. After exhaustion, `ConnectionIndicator` shows the
manual reconnect button which triggers `window.location.reload()`.

The Celery task uses a different backoff — server-side, fixed base of 30s
with Celery's built-in doubling: 30s → 60s → 120s (capped). Max 3 retries.
