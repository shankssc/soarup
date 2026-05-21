// apps/web/src/stores/websocket-store.ts
// Connection state only — subscription handlers live in the registry.
// Drives the ConnectionIndicator in the Sidebar and reconnect logic
// in useWebSocket.

import { create } from 'zustand';

export type WsStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

interface WebSocketState {
  status: WsStatus;
  lastEventId: string | null;
  reconnectAttempts: number;
  setStatus: (status: WsStatus) => void;
  setLastEventId: (id: string) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

export const useWebSocketStore = create<WebSocketState>()((set) => ({
  status: 'idle',
  lastEventId: null,
  reconnectAttempts: 0,
  setStatus: (status) => set({ status }),
  setLastEventId: (id) => set({ lastEventId: id }),
  incrementReconnectAttempts: () =>
    set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),
}));
