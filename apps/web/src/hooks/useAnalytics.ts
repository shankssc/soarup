// apps/web/src/hooks/useAnalytics.ts

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const analyticsKeys = {
  personal: (workspaceId: string) => ['analytics', workspaceId, 'personal'] as const,
  team: (workspaceId: string) => ['analytics', workspaceId, 'team'] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeatmapDay {
  date: string;
  count: number;
  intensity: 0 | 1 | 2 | 3;
}

export interface StreakData {
  current_streak: number;
  best_streak: number;
  total_submissions: number;
  last_submission_date: string | null;
}

export interface PersonalAnalytics {
  streak: StreakData;
  heatmap: HeatmapDay[];
  heatmap_weeks: number;
}

export interface MemberParticipationRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  current_streak: number;
  participation_rate_30d: number;
  submissions_30d: number;
  sparkline: number[];
}

export interface TeamAnalytics {
  participation_rate_30d: number;
  avg_updates_per_day_30d: number;
  active_member_count: number;
  members: MemberParticipationRow[];
  workspace_heatmap: HeatmapDay[];
  workspace_heatmap_weeks: number;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePersonalAnalytics(workspaceId: string | undefined) {
  const { tokens } = useAuth();
  return useQuery({
    queryKey: analyticsKeys.personal(workspaceId ?? ''),
    queryFn: () =>
      apiClient.get<PersonalAnalytics>(
        `/workspaces/${workspaceId}/analytics/personal`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    // Analytics don't change in real-time — 5 min stale time is acceptable.
    // A user who submits an update and immediately views analytics will see
    // stale data for up to 5 minutes (documented tradeoff in spec).
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeamAnalytics(workspaceId: string | undefined) {
  const { tokens } = useAuth();
  return useQuery({
    queryKey: analyticsKeys.team(workspaceId ?? ''),
    queryFn: () =>
      apiClient.get<TeamAnalytics>(
        `/workspaces/${workspaceId}/analytics/team`,
        tokens?.access_token,
      ),
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 5 * 60 * 1000,
  });
}
