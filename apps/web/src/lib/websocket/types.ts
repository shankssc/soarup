// apps/web/src/lib/websocket/types.ts
// Typed envelope and payload definitions for all WebSocket events.
// Add new payload types here as milestones introduce new event types —
// the EVENT_TYPES registry in events.py is the backend source of truth.

// The envelope every server message conforms to
export interface WebSocketMessage<T = unknown> {
  type: string;
  workspace_id: string;
  event_id: string;
  timestamp: string;
  payload: T;
}

// ── Milestone 3 ───────────────────────────────────────────────────────────────

export interface UpdateStatusChangedPayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  summary: string | null;
}

// ── Milestone 4 (reserved — define payload when building) ─────────────────────

export interface AudioTranscriptionStartedPayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
}

export interface AudioTranscriptionCompletePayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
  transcript: string;
}

export interface AudioTranscriptionFailedPayload {
  update_id: string;
  workspace_id: string;
  update_date: string;
}

// ── Milestone 5 (reserved) ────────────────────────────────────────────────────

export interface MemberUpdateSubmittedPayload {
  update_id: string;
  workspace_id: string;
  user_id: string;
  update_date: string;
}
