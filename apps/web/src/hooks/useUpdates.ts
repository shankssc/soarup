// apps/web/src/hooks/useUpdates.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

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
*/
export function useSubmitUpdate(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      content: string;
      update_date: string;
      mode?: string;
      audio_key?: string;
      audio_duration_seconds?: number;
    }) =>
      apiClient.post<UpdateResponse>(
        `/workspaces/${workspaceId}/updates`,
        { mode: 'text', ...data },
        tokens?.access_token,
      ),
    onSuccess: (newUpdate) => {
      queryClient.setQueryData<UpdateListResponse>(
        updateKeys.byDate(workspaceId, newUpdate.update_date),
        (old) => ({
          updates: [...(old?.updates ?? []), newUpdate],
          total: (old?.total ?? 0) + 1,
        }),
      );
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
