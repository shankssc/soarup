// apps/web/src/hooks/useSlack.ts
// Slack integration query and mutation hooks.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { workspaceKeys } from '@/hooks/useWorkspace';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlackSettings {
  slack_configured: boolean;
  slack_digest_enabled: boolean;
  slack_updates_enabled: boolean;
  webhook_url_hint: string | null;
}

export interface UpdateSlackSettingsPayload {
  webhook_url?: string | null;
  slack_digest_enabled?: boolean;
  slack_updates_enabled?: boolean;
}

export interface SlackTestResponse {
  success: boolean;
  message: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const slackKeys = {
  settings: (workspaceId: string) => ['slack', workspaceId, 'settings'] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Fetch Slack integration settings for a workspace.
 * Webhook URL is never returned raw — hint shows last 8 chars only.
 */
export function useSlackSettings(workspaceId: string | undefined) {
  const { tokens } = useAuth();

  return useQuery({
    queryKey: slackKeys.settings(workspaceId ?? ''),
    queryFn: () =>
      apiClient.get<SlackSettings>(
        `/workspaces/${workspaceId}/slack/settings`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 60 * 1000,
  });
}

/**
 * Update Slack webhook URL and notification toggles.
 * Invalidates Slack settings and workspace cache on success.
 */
export function useUpdateSlackSettings(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateSlackSettingsPayload) =>
      apiClient.patch<SlackSettings>(
        `/workspaces/${workspaceId}/slack/settings`,
        payload,
        tokens?.access_token,
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(slackKeys.settings(workspaceId), updated);
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
    },
  });
}

/**
 * Send a test Block Kit message to the configured Slack channel.
 * Use to verify the webhook URL is correct after saving.
 */
export function useSendSlackTest(workspaceId: string) {
  const { tokens } = useAuth();

  return useMutation({
    mutationFn: () =>
      apiClient.post<SlackTestResponse>(
        `/workspaces/${workspaceId}/slack/test`,
        {},
        tokens?.access_token,
      ),
  });
}

/**
 * Remove Slack integration — clears webhook URL and disables all toggles.
 * Invalidates Slack settings and workspace cache on success.
 */
export function useRemoveSlackIntegration(workspaceId: string) {
  const { tokens } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.delete(
        `/workspaces/${workspaceId}/slack/settings`,
        tokens?.access_token,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: slackKeys.settings(workspaceId),
      });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
    },
  });
}
