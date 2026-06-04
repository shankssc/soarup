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

  const connect = useCallback(() => {
    if (!workspaceId || !accessToken || !enabled) return;

    const params = new URLSearchParams({ token: accessToken });
    if (lastEventId) params.set('last_event_id', lastEventId);
    const url = `${WS_BASE}/workspaces/${workspaceId}?${params.toString()}`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('connected');
      resetReconnectAttempts();

      // Belt-and-suspenders alongside last_event_id stream replay.
      queryClient.invalidateQueries({
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

      setStatus(
        reconnectAttempts < MAX_RECONNECT_ATTEMPTS ? 'reconnecting' : 'disconnected',
      );

      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('disconnected');
        return;
      }

      const delay = getReconnectDelay(reconnectAttempts);
      incrementReconnectAttempts();

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose — let onclose handle reconnect logic.
      ws.close();
    };
  }, [workspaceId, accessToken, enabled, reconnectAttempts, lastEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
      setStatus('idle');
      resetReconnectAttempts();
    };
  }, [connect]); // eslint-disable-line react-hooks/exhaustive-deps
}
