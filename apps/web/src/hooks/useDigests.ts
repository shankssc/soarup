// apps/web/src/hooks/useDigests.ts
// Digest query hooks — list (infinite), detail, settings update, preview.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { workspaceKeys } from '@/hooks/useWorkspace';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigestItem {
  id: string;
  update_id: string;
  author_name: string | null;
  summary_snapshot: string | null;
}

export interface Digest {
  id: string;
  workspace_id: string;
  digest_date: string;
  summary: string | null;
  status: string;
  update_count: number;
  email_sent_at: string | null;
  created_at: string;
  items: DigestItem[];
}

export interface DigestListResponse {
  digests: Digest[];
  next_cursor: string | null;
  total: number;
}

export interface DigestPreviewResponse {
  html: string;
  digest_date: string;
  update_count: number;
  would_send_to: string[];
}

export interface UpdateDigestSettingsPayload {
  digest_enabled?: boolean;
  digest_send_time?: string;
  digest_timezone?: string | null;
  digest_days?: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const digestKeys = {
  all: (workspaceId: string) => ['digests', workspaceId] as const,
  list: (workspaceId: string) => ['digests', workspaceId, 'list'] as const,
  detail: (workspaceId: string, digestId: string) =>
    ['digests', workspaceId, digestId] as const,
  settings: (workspaceId: string) => ['digests', workspaceId, 'settings'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Infinite-scroll paginated list of digests for a workspace.
 * Each page fetches up to `limit` digests using cursor-based pagination.
 */
export function useDigests(workspaceId: string | undefined, limit = 20) {
  const { tokens } = useAuth();

  return useInfiniteQuery({
    queryKey: digestKeys.list(workspaceId ?? ''),
    queryFn: ({ pageParam }) => {
      const params: Record<string, string> = {
        limit: String(limit),
      };
      if (pageParam) params.cursor = pageParam as string;
      return apiClient.get<DigestListResponse>(
        `/workspaces/${workspaceId}/digests`,
        tokens?.access_token,
        params,
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? null,
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 60 * 1000, // digests are stable — 1 min stale time
  });
}

/**
 * Single digest with DigestItems expanded.
 */
export function useDigest(
  workspaceId: string | undefined,
  digestId: string | undefined,
) {
  const { tokens } = useAuth();

  return useQuery({
    queryKey: digestKeys.detail(workspaceId ?? '', digestId ?? ''),
    queryFn: () =>
      apiClient.get<Digest>(
        `/workspaces/${workspaceId}/digests/${digestId}`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!digestId && !!tokens?.access_token,
    staleTime: 60 * 1000,
  });
}

/**
 * Update digest settings — enable/disable, send time, timezone, days.
 * Invalidates the digest list on success.
 */
export function useUpdateDigestSettings(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateDigestSettingsPayload) =>
      apiClient.patch<Digest>(
        `/workspaces/${workspaceId}/digest-settings`,
        payload,
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: digestKeys.settings(workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.mine(),
      });
    },
  });
}

/**
 * Preview the digest email HTML for today without sending.
 * Not cached — always fetches fresh on call.
 */
export function useDigestPreview(workspaceId: string) {
  const { tokens } = useAuth();

  return useMutation({
    mutationFn: () =>
      apiClient.post<DigestPreviewResponse>(
        `/workspaces/${workspaceId}/digests/preview`,
        {},
        tokens?.access_token,
      ),
  });
}
