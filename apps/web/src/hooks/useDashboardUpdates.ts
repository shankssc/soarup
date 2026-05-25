// apps/web/src/hooks/useDashboardUpdates.ts
// Registers a WebSocket handler that surgically patches the React Query
// cache when update.status_changed events arrive — no network refetch needed.
// Import this hook in the dashboard page — it self-registers on mount.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { updateKeys, type UpdateResponse } from '@/hooks/useUpdates';
import { subscribe } from '@/lib/websocket/registry';
import type { UpdateStatusChangedPayload } from '@/lib/websocket/types';

interface UpdateListCache {
  updates: UpdateResponse[];
  total: number;
}

export function useDashboardUpdates(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    // subscribe() returns the unsubscribe fn — returned directly as
    // the useEffect cleanup so the handler is removed on unmount.
    return subscribe<UpdateStatusChangedPayload>('update.status_changed', (payload) => {
      // Guard against events from other workspaces — the WS channel
      // is workspace-scoped but this is defensive.
      if (payload.workspace_id !== workspaceId) return;

      // Surgical cache patch — find the update by ID and update
      // status + summary in place without invalidating the full query.
      queryClient.setQueryData<UpdateListCache>(
        updateKeys.byDate(workspaceId, payload.update_date),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            updates: old.updates.map((u) =>
              u.id === payload.update_id
                ? { ...u, status: payload.status, summary: payload.summary }
                : u,
            ),
          };
        },
      );
    });
  }, [workspaceId, queryClient]);
}
