// apps/web/tests/unit/useAnalytics.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  usePersonalAnalytics,
  useTeamAnalytics,
  analyticsKeys,
} from '@/hooks/useAnalytics';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const MOCK_PERSONAL_ANALYTICS = {
  streak: {
    current_streak: 14,
    best_streak: 21,
    total_submissions: 87,
    last_submission_date: '2026-06-23',
  },
  heatmap: [
    { date: '2026-06-23', count: 1, intensity: 3 },
    { date: '2026-06-22', count: 0, intensity: 0 },
  ],
  heatmap_weeks: 52,
};

const MOCK_TEAM_ANALYTICS = {
  participation_rate_30d: 0.82,
  avg_updates_per_day_30d: 4.2,
  active_member_count: 12,
  members: [
    {
      user_id: 'user-1',
      full_name: 'Jane Doe',
      avatar_url: null,
      current_streak: 14,
      participation_rate_30d: 0.95,
      submissions_30d: 28,
      sparkline: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    },
  ],
  workspace_heatmap: [{ date: '2026-06-23', count: 5, intensity: 2 }],
  workspace_heatmap_weeks: 12,
};

// ─── Wrapper factory ──────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: MOCK_USER,
    tokens: MOCK_TOKENS,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
});

// ─── usePersonalAnalytics ─────────────────────────────────────────────────────

describe('usePersonalAnalytics', () => {
  it('calls the correct endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_PERSONAL_ANALYTICS);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePersonalAnalytics(WORKSPACE_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/analytics/personal`,
      'mock-access-token',
    );
  });

  it('returns streak and heatmap data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_PERSONAL_ANALYTICS);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePersonalAnalytics(WORKSPACE_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.streak.current_streak).toBe(14);
    expect(result.current.data?.streak.best_streak).toBe(21);
    expect(result.current.data?.heatmap).toHaveLength(2);
  });

  it('does not fetch without workspaceId', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePersonalAnalytics(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch without token', () => {
    useAuthStore.setState({ tokens: null });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePersonalAnalytics(WORKSPACE_ID), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('uses correct query key', () => {
    const key = analyticsKeys.personal(WORKSPACE_ID);
    expect(key).toEqual(['analytics', WORKSPACE_ID, 'personal']);
  });
});

// ─── useTeamAnalytics ─────────────────────────────────────────────────────────

describe('useTeamAnalytics', () => {
  it('calls the correct endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_TEAM_ANALYTICS);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTeamAnalytics(WORKSPACE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/analytics/team`,
      'mock-access-token',
    );
  });

  it('returns participation rate and members', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_TEAM_ANALYTICS);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTeamAnalytics(WORKSPACE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.participation_rate_30d).toBe(0.82);
    expect(result.current.data?.members).toHaveLength(1);
    expect(result.current.data?.members[0].full_name).toBe('Jane Doe');
  });

  it('does not fetch without workspaceId', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTeamAnalytics(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch without token', () => {
    useAuthStore.setState({ tokens: null });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useTeamAnalytics(WORKSPACE_ID), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('uses correct query key', () => {
    const key = analyticsKeys.team(WORKSPACE_ID);
    expect(key).toEqual(['analytics', WORKSPACE_ID, 'team']);
  });
});
