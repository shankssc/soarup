// apps/web/tests/unit/useUpdateHistory.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useUpdateHistory } from '@/hooks/useUpdateHistory';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// Pin date-fns so from_date / to_date are deterministic
vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>();
  return {
    ...actual,
    format: (date: unknown, fmt: string) => {
      if (fmt === 'yyyy-MM-dd') return '2026-06-23';
      return actual.format(date as Date, fmt);
    },
    subDays: (_date: unknown, days: number) => {
      // Return a fixed date offset by days from our pinned today
      const base = new Date('2026-06-23');
      base.setDate(base.getDate() - days);
      return base;
    },
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const MOCK_UPDATE = {
  id: 'update-abc',
  workspace_id: WORKSPACE_ID,
  user_id: 'user-123',
  content: 'Finished the history page.',
  mode: 'text',
  status: 'processed',
  summary: 'They finished the history page.',
  transcript: null,
  audio_duration_seconds: null,
  update_date: '2026-06-23',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const MOCK_PAGE_1 = {
  updates: [MOCK_UPDATE],
  next_cursor: 'cursor-page-2',
  total_in_range: 1,
};

const MOCK_EMPTY_PAGE = {
  updates: [],
  next_cursor: null,
  total_in_range: 0,
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

// ─── useUpdateHistory ─────────────────────────────────────────────────────────

describe('useUpdateHistory', () => {
  it('calls the correct endpoint with date params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_PAGE_1);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistory(WORKSPACE_ID, '30d'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/updates/history`,
      'mock-access-token',
      expect.objectContaining({
        limit: '20',
        from_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        to_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('returns updates from first page', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_PAGE_1);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistory(WORKSPACE_ID, '30d'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const allUpdates = result.current.data?.pages.flatMap((p) => p.updates) ?? [];
    expect(allUpdates).toHaveLength(1);
    expect(allUpdates[0].id).toBe('update-abc');
  });

  it('hasNextPage is true when next_cursor is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_PAGE_1);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistory(WORKSPACE_ID, '30d'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('hasNextPage is false when next_cursor is null', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_EMPTY_PAGE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistory(WORKSPACE_ID, '30d'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('does not fetch without workspaceId', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistory(undefined, '30d'), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch without token', () => {
    useAuthStore.setState({ tokens: null });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistory(WORKSPACE_ID, '30d'), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
