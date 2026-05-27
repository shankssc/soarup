// apps/web/src/hooks/useDashboardUpdates.ts
// Registers a WebSocket handler that surgically patches the React Query
// cache when update.status_changed events arrive — no network refetch needed.
// Import this hook in the dashboard page — it self-registers on mount.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { updateKeys, type UpdateResponse } from '@/hooks/useUpdates';
import { subscribe } from '@/lib/websocket/registry';
import type {
  AudioTranscriptionCompletePayload,
  UpdateStatusChangedPayload,
} from '@/lib/websocket/types';

interface UpdateListCache {
  updates: UpdateResponse[];
  total: number;
}

export function useDashboardUpdates(workspaceId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    // M3 — patch status + summary when AI processing completes
    const unsubStatusChanged = subscribe<UpdateStatusChangedPayload>(
      'update.status_changed',
      (payload) => {
        if (payload.workspace_id !== workspaceId) return;

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
      },
    );

    // M4 — patch transcript into cache when transcription completes
    // audio.transcription_started and audio.transcription_failed don't
    // carry new data to cache — status transitions are handled by
    // update.status_changed which fires after summarisation anyway.
    const unsubTranscriptComplete = subscribe<AudioTranscriptionCompletePayload>(
      'audio.transcription_complete',
      (payload) => {
        if (payload.workspace_id !== workspaceId) return;

        queryClient.setQueryData<UpdateListCache>(
          updateKeys.byDate(workspaceId, payload.update_date),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              updates: old.updates.map((u) =>
                u.id === payload.update_id
                  ? { ...u, transcript: payload.transcript }
                  : u,
              ),
            };
          },
        );
      },
    );

    return () => {
      unsubStatusChanged();
      unsubTranscriptComplete();
    };
  }, [workspaceId, queryClient]);
}
