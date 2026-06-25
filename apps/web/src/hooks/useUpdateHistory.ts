// apps/web/src/hooks/useUpdateHistory.ts

import { useInfiniteQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import type { UpdateResponse } from '@/hooks/useUpdates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DateRangePreset = '7d' | '30d' | '90d';

export interface UpdateHistoryResponse {
  updates: UpdateResponse[];
  next_cursor: string | null;
  /** Approximate — equals items in the current page, not total across all pages */
  total_in_range: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const updateHistoryKeys = {
  list: (workspaceId: string, params: Record<string, string>) =>
    ['update-history', workspaceId, params] as const,
};

const DAYS_MAP: Record<DateRangePreset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUpdateHistory(
  workspaceId: string | undefined,
  preset: DateRangePreset = '30d',
) {
  const { tokens } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const fromDate = format(subDays(new Date(), DAYS_MAP[preset]), 'yyyy-MM-dd');

  return useInfiniteQuery({
    queryKey: updateHistoryKeys.list(workspaceId ?? '', { fromDate, toDate: today }),
    queryFn: ({ pageParam }) =>
      apiClient.get<UpdateHistoryResponse>(
        `/workspaces/${workspaceId}/updates/history`,
        tokens?.access_token,
        {
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: '20',
          from_date: fromDate,
          to_date: today,
        },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!workspaceId && !!tokens?.access_token,
    staleTime: 2 * 60 * 1000,
  });
}
