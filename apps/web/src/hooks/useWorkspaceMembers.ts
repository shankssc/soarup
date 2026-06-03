// apps/web/src/hooks/useWorkspaceMembers.ts
// React Query hooks for workspace member management.
// Covers: member list, role change (owner only), remove member (admin+).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceMember {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface MemberListResponse {
  members: WorkspaceMember[];
  total: number;
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const memberKeys = {
  all: (workspaceId: string) => ['members', workspaceId] as const,
  list: (workspaceId: string) => ['members', workspaceId, 'list'] as const,
};

// ─── Fetch members ────────────────────────────────────────────────────────────

export function useWorkspaceMembers(workspaceId: string | undefined) {
  const { tokens } = useAuth();

  return useQuery({
    queryKey: memberKeys.list(workspaceId ?? ''),
    queryFn: () =>
      apiClient.get<MemberListResponse>(
        `/workspaces/${workspaceId}/members`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 60 * 1000, // 1 min — members change infrequently
  });
}

// ─── Update member role (owner only) ─────────────────────────────────────────

export function useUpdateMemberRole(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'member' }) =>
      apiClient.patch<WorkspaceMember>(
        `/workspaces/${workspaceId}/members/${userId}/role`,
        { role },
        tokens?.access_token,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<MemberListResponse>(
        memberKeys.list(workspaceId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            members: old.members.map((m) =>
              m.user_id === updated.user_id ? { ...m, role: updated.role } : m,
            ),
          };
        },
      );
    },
  });
}

// ─── Remove member (admin+) ───────────────────────────────────────────────────

export function useRemoveMember(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(
        `/workspaces/${workspaceId}/members/${userId}`,
        tokens?.access_token,
      ),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<MemberListResponse>(
        memberKeys.list(workspaceId),
        (old) => {
          if (!old) return old;
          return {
            members: old.members.filter((m) => m.user_id !== userId),
            total: old.total - 1,
          };
        },
      );
    },
  });
}
