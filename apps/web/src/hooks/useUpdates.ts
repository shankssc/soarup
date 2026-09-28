// apps/web/src/hooks/useUpdates.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { apiClient, ApiRequestError } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { analyticsKeys } from '@/hooks/useAnalytics';

export interface UpdateResponse {
  id: string;
  workspace_id: string;
  user_id: string;
  content: string;
  mode: string;
  status: string;
  summary: string | null;
  transcript: string | null;
  audio_duration_seconds: number | null;
  update_date: string;
  created_at: string;
  updated_at: string;
  author_name: string | null;
  author_avatar_url: string | null;
}

interface UpdateListResponse {
  updates: UpdateResponse[];
  total: number;
}

/*
Cached key factory
*/
export const updateKeys = {
  all: (workspaceId: string) => ['updates', workspaceId] as const,
  byDate: (workspaceId: string, date: string) =>
    ['updates', workspaceId, date] as const,
};

/*
Fetches updates for a given date
*/
export function useUpdates(workspaceId: string | undefined, date?: string) {
  const { tokens } = useAuth();
  const updateDate = date ?? format(new Date(), 'yyyy-MM-dd');

  return useQuery({
    queryKey: updateKeys.byDate(workspaceId ?? '', updateDate),
    queryFn: () =>
      apiClient.get<UpdateListResponse>(
        `/workspaces/${workspaceId}/updates`,
        tokens?.access_token,
        { update_date: updateDate },
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 30 * 1000,
  });
}

/*
Creates a new update

If the network drops after the server saved the update but before the 202
arrives, the retry gets a 409 (update_already_exists). When the existing
update has the same content we just tried to submit, that retry is really a
success, so we return the existing row instead of surfacing an error.
A 409 with different content is a genuine conflict and is rethrown.
*/
export function useSubmitUpdate(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      content: string;
      update_date: string;
      mode?: string;
      audio_key?: string;
      audio_duration_seconds?: number;
    }) => {
      const path = `/workspaces/${workspaceId}/updates`;

      try {
        return await apiClient.post<UpdateResponse>(
          path,
          { mode: 'text', ...data },
          tokens?.access_token,
        );
      } catch (error) {
        if (
          !(error instanceof ApiRequestError) ||
          error.code !== 'update_already_exists'
        ) {
          throw error;
        }

        const existingId = error.details?.existing_id;
        if (typeof existingId !== 'string') throw error;

        try {
          const list = await apiClient.get<UpdateListResponse>(
            path,
            tokens?.access_token,
            { update_date: data.update_date },
          );
          const existing = list.updates.find((u) => u.id === existingId);
          if (existing && existing.content.trim() === data.content.trim()) {
            return existing;
          }
        } catch {
          // Follow-up fetch failed; fall through and surface the original 409.
        }

        throw error;
      }
    },
    onSuccess: (newUpdate) => {
      queryClient.setQueryData<UpdateListResponse>(
        updateKeys.byDate(workspaceId, newUpdate.update_date),
        (old) => {
          const current = old?.updates ?? [];
          // The recovered-409 path can return an update that's already cached.
          if (current.some((u) => u.id === newUpdate.id)) {
            return { updates: current, total: old?.total ?? current.length };
          }
          return { updates: [...current, newUpdate], total: (old?.total ?? 0) + 1 };
        },
      );
      queryClient.invalidateQueries({
        queryKey: analyticsKeys.personal(workspaceId),
      });
    },
  });
}

/*
Edits an existing update
*/
export function useEditUpdate(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ updateId, content }: { updateId: string; content: string }) =>
      apiClient.patch<UpdateResponse>(
        `/workspaces/${workspaceId}/updates/${updateId}`,
        { content },
        tokens?.access_token,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<UpdateListResponse>(
        updateKeys.byDate(workspaceId, updated.update_date),
        (old) => ({
          updates: (old?.updates ?? []).map((u) => (u.id === updated.id ? updated : u)),
          total: old?.total ?? 0,
        }),
      );
    },
  });
}

/*
Soft deletes an update
*/
export function useDeleteUpdate(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ updateId, updateDate }: { updateId: string; updateDate: string }) =>
      apiClient
        .delete(`/workspaces/${workspaceId}/updates/${updateId}`, tokens?.access_token)
        .then(() => ({ updateId, updateDate })),
    onSuccess: ({ updateId, updateDate }) => {
      queryClient.setQueryData<UpdateListResponse>(
        updateKeys.byDate(workspaceId, updateDate),
        (old) => ({
          updates: (old?.updates ?? []).filter((u) => u.id !== updateId),
          total: Math.max((old?.total ?? 1) - 1, 0),
        }),
      );
    },
  });
}
