// apps/web/src/lib/websocket/registry.ts
// Module-level singleton — lives outside React and Zustand.
//
// Handlers are React lifecycle-dependent so they cannot live in Zustand.
// The registry is the bridge between the raw WebSocket connection
// (managed by useWebSocket) and React hooks (e.g. useDashboardUpdates).
//
// Usage:
//   subscribe('update.status_changed', handler) → returns unsubscribe fn
//   dispatch(message) → called by useWebSocket on every incoming message

type Handler<T = unknown> = (payload: T) => void;

const handlers = new Map<string, Set<Handler>>();

/**
 * Register a handler for a specific event type.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 *
 * @example
 * useEffect(() => {
 *   return subscribe('update.status_changed', (payload) => { ... });
 * }, []);
 */
export function subscribe<T = unknown>(type: string, handler: Handler<T>): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler as Handler);
  return () => {
    handlers.get(type)?.delete(handler as Handler);
  };
}

/**
 * Dispatch an incoming WebSocket message to all registered handlers.
 * Called by useWebSocket on every ws.onmessage event.
 */
export function dispatch(message: { type: string; payload: unknown }): void {
  handlers.get(message.type)?.forEach((h) => h(message.payload));
}

/**
 * Clear all registered handlers.
 * Used in tests to reset state between test cases.
 */
export function clearAllHandlers(): void {
  handlers.clear();
}
