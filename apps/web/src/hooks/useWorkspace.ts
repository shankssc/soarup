// apps/web/src/hooks/useWorkspace.ts

// Fetches the current user's workspace and keeps it cached for 5 minutes

/*
useAuth() — pulls the access token from your Zustand store.
The hook needs this to attach the Authorization header on the API
call.

queryKey: workspaceKeys.mine() — evaluates to ['workspace', 'mine'].
This is the cache key. Any component anywhere in the app that
calls useWorkspace() gets the same cached result —
React Query deduplicates the fetch automatically.
If AppShell and Sidebar both call useWorkspace(), only
one HTTP request fires.

queryFn — calls GET /workspaces/me which returns an array of
workspaces the user belongs to. Since SoarUp is single-workspace
for now, .then((workspaces) => workspaces[0] ?? null) just takes
the first one. This means consumers get a single
WorkspaceResponse | null instead of an array, which is
cleaner to work with.

enabled: !!tokens?.access_token — tells React Query not to run
the query until a token exists. Without this, it would fire
immediately on mount, fail with 401 because no token is attached
yet, and then fire again after the token loads. The double-bang
coerces the token string to a boolean.

staleTime: 5 * 60 * 1000 — workspace data rarely changes,
so cache it for 5 minutes. React Query won't refetch on
every component mount during that window. Compare this to
useUpdates which uses 30 seconds because updates are much
more dynamic.
*/

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

export interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  plan: string;
  created_at: string;
  digest_enabled: boolean;
  digest_send_time: string;
  digest_timezone: string | null;
  digest_days: string;
}

export const workspaceKeys = {
  all: ['workspace'] as const,
  mine: () => [...workspaceKeys.all, 'mine'] as const,
};

export function useWorkspace() {
  const { tokens } = useAuth();

  return useQuery({
    queryKey: workspaceKeys.mine(),
    queryFn: () =>
      apiClient
        .get<{ data: WorkspaceResponse[] }>('/workspaces/', tokens?.access_token)
        .then((res) => res.data[0] ?? null),
    enabled: !!tokens?.access_token,
    staleTime: 5 * 60 * 1000,
  });
}
