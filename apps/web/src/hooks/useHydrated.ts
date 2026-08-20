import { useSyncExternalStore } from 'react';
import { useAuthStore } from '@/hooks/useAuth';

function subscribe(callback: () => void) {
  return useAuthStore.persist.onFinishHydration(callback);
}

function getSnapshot() {
  return useAuthStore.persist.hasHydrated();
}

// Server always renders as "not yet hydrated" — matches the client's
// pre-hydration state on first paint, so SSR output and the client's
// initial render agree and React doesn't flag a hydration mismatch.
function getServerSnapshot() {
  return false;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
