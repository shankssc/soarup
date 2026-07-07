// apps/web/src/hooks/usePublicProfile.ts

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { HeatmapDay, StreakData } from '@/hooks/useAnalytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublicProfile {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  tagline: string | null;
  streak: StreakData;
  heatmap: HeatmapDay[];
  heatmap_weeks: number;
}

export interface UsernameAvailabilityResponse {
  username: string;
  available: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const publicProfileKeys = {
  profile: (username: string) => ['public-profile', username] as const,
  availability: (username: string) => ['username-availability', username] as const,
};

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: publicProfileKeys.profile(username),
    queryFn: () => apiClient.getPublic<PublicProfile>(`/profiles/${username}`),
    staleTime: 5 * 60 * 1000,
    retry: false, // 404 should not retry
  });
}

export function useUsernameAvailability(
  username: string,
  currentUserId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: publicProfileKeys.availability(username),
    queryFn: () =>
      apiClient.getPublic<UsernameAvailabilityResponse>(
        `/auth/check-username?username=${encodeURIComponent(username)}` +
          (currentUserId ? `&current_user_id=${currentUserId}` : ''),
      ),
    enabled: enabled && username.length >= 3,
    staleTime: 30 * 1000,
  });
}
