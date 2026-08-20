// apps/web/src/hooks/useWebSocket.ts
// Manages the WebSocket connection lifecycle.
// Reconnects with exponential backoff + jitter on dropout.
// Integrates with React Query to invalidate stale data on reconnect
// to catch any events missed while disconnected.

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

import { updateKeys } from '@/hooks/useUpdates';
import { dispatch } from '@/lib/websocket/registry';
import { useWebSocketStore } from '@/stores/websocket-store';
import React from 'react';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/api/v1/ws';

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/**
 * Exponential backoff with full jitter.
 * Returns a random value between 50% and 100% of the exponential cap
 * to avoid thundering herd on mass reconnect.
 */
function getReconnectDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  return exponential * (0.5 + Math.random() * 0.5);
}

interface UseWebSocketOptions {
  workspaceId: string | undefined;
  accessToken: string | undefined;
  enabled?: boolean;
}

export function useWebSocket({
  workspaceId,
  accessToken,
  enabled = true,
}: UseWebSocketOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const {
    setStatus,
    setLastEventId,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reconnectAttempts,
    lastEventId,
  } = useWebSocketStore();

  // ── Refs mirroring frequently-changing state ─────────────────────────────
  // connect() reads these instead of closing over reconnectAttempts/
  // lastEventId directly. This is the fix for a runaway reconnect loop:
  // reconnectAttempts changes on every reconnect, lastEventId changes on
  // every incoming message. If either were in connect's dependency array,
  // connect gets a new identity on every reconnect AND every message — and
  // the mount effect below depends on connect, so it would re-run each
  // time, tearing down and reopening the socket in a tight loop layered on
  // top of the onclose handler's own scheduled retry. Two independent
  // reconnect triggers compounding with no real backoff produced exactly
  // what was observed: tens of thousands of rapid connection attempts and
  // Chrome's "Insufficient resources" throttling error. Refs let connect's
  // identity stay stable across the connection's lifetime — ws.onclose's
  // setTimeout becomes the ONLY reconnect trigger, so backoff actually
  // governs retry pacing the way it's meant to.
  const reconnectAttemptsRef = useRef(reconnectAttempts);
  const lastEventIdRef = useRef(lastEventId);

  useEffect(() => {
    reconnectAttemptsRef.current = reconnectAttempts;
  }, [reconnectAttempts]);

  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  const connectRef = React.useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!workspaceId || !accessToken || !enabled) return;

    const params = new URLSearchParams({ token: accessToken });

    const stored = sessionStorage.getItem('soarup_ws_last_event_id');
    // A client with NO stored cursor is connecting for the very first time.
    // Passing no last_event_id defaults the backend to "$" (Redis semantics:
    // only entries appended AFTER this exact XREAD call registers) — but
    // JWT validation on connect is a real network round-trip, not instant.
    // If the backend's process_update task completes and calls
    // append_event before this connection's first xread actually begins,
    // those events land in the stream at a position "$" no longer
    // considers new — they're missed permanently, with no replay, since
    // there was never a cursor to resume from. Requesting "0" (full
    // history) on a genuinely fresh session eliminates that race: for a
    // brand-new workspace this history is tiny, and STREAM_MAXLEN already
    // bounds the worst case. Reconnecting clients that already have a
    // lastEventId behave exactly as before — this only changes the
    // first-ever connection.
    const cursor = lastEventIdRef.current ?? stored ?? '0';
    params.set('last_event_id', cursor);

    const url = `${WS_BASE}/workspaces/${workspaceId}?${params.toString()}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('connected');
      resetReconnectAttempts();

      // substituting invalidateQueries with refetchQueries to prevent stale data fetching.
      queryClient.refetchQueries({
        queryKey: updateKeys.byDate(workspaceId, format(new Date(), 'yyyy-MM-dd')),
      });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        if (message.event_id) setLastEventId(message.event_id);
        dispatch(message);
      } catch (e) {
        console.warn('WebSocket message parse error', e);
      }
    };

    ws.onclose = (event) => {
      // 4001 = unauthorized — token invalid or expired, do not reconnect.
      // The user will need to re-authenticate.
      if (event.code === 4001) {
        setStatus('error');
        return;
      }

      const attempts = reconnectAttemptsRef.current;

      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('disconnected');
        return;
      }

      setStatus('reconnecting');

      const delay = getReconnectDelay(attempts);
      incrementReconnectAttempts();

      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — let onclose handle reconnect logic.
      ws.close();
    };
    // Stable across the connection's lifetime — see comment on the refs
    // above for why reconnectAttempts/lastEventId are deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, accessToken, enabled]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
      setStatus('idle');
      resetReconnectAttempts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);
}
