// apps/web/src/hooks/useGitHubIntegration.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

export interface GitHubInstallation {
  id: string;
  account_login: string;
  account_type: string;
  status: string;
}

interface GitHubConnectionStatusResponse {
  installations: GitHubInstallation[];
  connected: boolean;
}

interface GitHubPrefillResponse {
  draft_text: string;
  raw_activity: unknown;
}

export const githubKeys = {
  status: () => ['github', 'status'] as const,
};

/*
Fetches connection status and the list of active installations.
*/
export function useGitHubConnectionStatus() {
  const { tokens } = useAuth();

  return useQuery({
    queryKey: githubKeys.status(),
    queryFn: () =>
      apiClient.get<GitHubConnectionStatusResponse>(
        '/integrations/github/status',
        tokens?.access_token,
      ),
    enabled: !!tokens?.access_token,
    staleTime: 60 * 1000,
  });
}

/*
Fetches the install URL and immediately redirects to GitHub's
App installation flow. Mutation-style because it is user-triggered
and causes a navigation side-effect.
*/
export function useStartGitHubConnect() {
  const { tokens } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const data = await apiClient.get<{ install_url: string }>(
        '/integrations/github/connect',
        tokens?.access_token,
      );
      window.location.href = data.install_url;
    },
  });
}

/*
Hard-deletes a single installation row and refreshes the status query.
The installation_row_id is passed at call-time, matching the
useDeleteUpdate / useRetryUpdate pattern.
*/
export function useDisconnectGitHub() {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (installationRowId: string) =>
      apiClient.delete(
        `/integrations/github/${installationRowId}`,
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubKeys.status() });
    },
  });
}

/*
Fetches a suggested draft built from today's GitHub activity.
Mutation-style because it is triggered by an explicit user action,
not on mount.
*/
export function useGitHubPrefill() {
  const { tokens } = useAuth();

  return useMutation({
    mutationFn: () =>
      apiClient.get<GitHubPrefillResponse>(
        '/integrations/github/prefill',
        tokens?.access_token,
      ),
  });
}
