// apps/web/src/hooks/useInviteMembers.ts
// React Query hooks for workspace invite management.
// Covers: create invite, revoke invite, list pending invites, accept invite.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InviteResponse {
  id: string;
  workspace_id: string;
  email: string;
  code: string;
  expires_at: string;
  is_used: boolean;
  created_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  expires_at: string;
  created_at: string;
}

export interface InviteDetails {
  workspace_name: string;
  workspace_slug: string;
  invited_by_name: string | null;
  email: string;
  expires_at: string;
  is_valid: boolean;
}

interface PendingInviteListResponse {
  invites: PendingInvite[];
  total: number;
}

// ─── Query key factory ────────────────────────────────────────────────────────

export const inviteKeys = {
  pending: (workspaceId: string) => ['invites', workspaceId, 'pending'] as const,
  details: (code: string) => ['invites', 'details', code] as const,
};

// ─── List pending invites (admin+) ────────────────────────────────────────────

export function usePendingInvites(workspaceId: string | undefined) {
  const { tokens } = useAuth();

  return useQuery({
    queryKey: inviteKeys.pending(workspaceId ?? ''),
    queryFn: () =>
      apiClient.get<PendingInviteListResponse>(
        `/workspaces/${workspaceId}/invites`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 30 * 1000,
  });
}

// ─── Create invite ────────────────────────────────────────────────────────────

export function useCreateInvite(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) =>
      apiClient.post<InviteResponse>(
        `/workspaces/${workspaceId}/invites`,
        { email },
        tokens?.access_token,
      ),
    onSuccess: (newInvite) => {
      // Append to the pending invites list cache
      queryClient.setQueryData<PendingInviteListResponse>(
        inviteKeys.pending(workspaceId),
        (old) => ({
          invites: [
            ...(old?.invites ?? []),
            {
              id: newInvite.id,
              email: newInvite.email,
              expires_at: newInvite.expires_at,
              created_at: newInvite.created_at,
            },
          ],
          total: (old?.total ?? 0) + 1,
        }),
      );
    },
  });
}

// ─── Revoke invite (admin+) ───────────────────────────────────────────────────

export function useRevokeInvite(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteId: string) =>
      apiClient.delete(
        `/workspaces/${workspaceId}/invites/${inviteId}`,
        tokens?.access_token,
      ),
    onSuccess: (_data, inviteId) => {
      queryClient.setQueryData<PendingInviteListResponse>(
        inviteKeys.pending(workspaceId),
        (old) => {
          if (!old) return old;
          return {
            invites: old.invites.filter((i) => i.id !== inviteId),
            total: Math.max(old.total - 1, 0),
          };
        },
      );
    },
  });
}

// ─── Get invite details (public — no auth required) ───────────────────────────

export function useInviteDetails(code: string | undefined) {
  return useQuery({
    queryKey: inviteKeys.details(code ?? ''),
    queryFn: () => apiClient.get<InviteDetails>(`/invites/${code}`),
    enabled: !!code,
    staleTime: 30 * 1000,
    retry: false, // Don't retry on 404 — invalid code should fail fast
  });
}

// ─── Accept invite (authenticated) ───────────────────────────────────────────

export function useAcceptInvite() {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) =>
      apiClient.post<{ workspace_id: string }>(
        `/invites/${code}/accept`,
        {},
        tokens?.access_token,
      ),
    onSuccess: () => {
      // Invalidate workspace cache so the new workspace appears immediately
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      // Invalidate member list in case the user was already cached somewhere
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
}
