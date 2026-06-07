// apps/web/tests/unit/useUpdates.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useUpdates,
  useSubmitUpdate,
  useEditUpdate,
  useDeleteUpdate,
  updateKeys,
} from '@/hooks/useUpdates';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// Pin date-fns format so default date is deterministic
vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>();
  return {
    ...actual,
    format: (date: unknown, fmt: string) => {
      if (fmt === 'yyyy-MM-dd') return '2026-05-18';
      return actual.format(date as Date, fmt);
    },
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_UPDATE = {
  id: 'update-abc',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content: 'Finished the API integration and started on dashboard layout.',
  mode: 'text',
  status: 'pending',
  summary: null,
  update_date: '2026-05-18',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const TODAY = '2026-05-18';
const WORKSPACE_ID = 'workspace-123';

// ─── Wrapper factory ──────────────────────────────────────────────────────────

// Returns both the wrapper and the queryClient so tests can pre-populate cache
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

// ─── useUpdates ───────────────────────────────────────────────────────────────

describe('useUpdates', () => {
  it('fetches updates for today by default', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      updates: [MOCK_UPDATE],
      total: 1,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdates(WORKSPACE_ID), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.updates).toHaveLength(1);
    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/updates`,
      'mock-access-token',
      { update_date: TODAY },
    );
  });

  it('does not fetch without workspaceId', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdates(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch without token', () => {
    useAuthStore.setState({ tokens: null });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdates(WORKSPACE_ID), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('accepts explicit date param', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ updates: [], total: 0 });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdates(WORKSPACE_ID, '2026-05-01'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/updates`,
      'mock-access-token',
      { update_date: '2026-05-01' },
    );
  });
});

// ─── useSubmitUpdate ──────────────────────────────────────────────────────────

describe('useSubmitUpdate', () => {
  it('calls POST endpoint with correct payload', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(MOCK_UPDATE);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSubmitUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        content: 'My update',
        update_date: TODAY,
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/updates`,
      { mode: 'text', content: 'My update', update_date: TODAY },
      'mock-access-token',
    );
  });

  it('optimistically adds new update to cache', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(MOCK_UPDATE);
    const { wrapper, queryClient } = createWrapper();

    // Pre-populate cache with empty list
    queryClient.setQueryData(updateKeys.byDate(WORKSPACE_ID, TODAY), {
      updates: [],
      total: 0,
    });

    const { result } = renderHook(() => useSubmitUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        content: 'My update',
        update_date: TODAY,
      });
    });

    const cached = queryClient.getQueryData<{
      updates: (typeof MOCK_UPDATE)[];
      total: number;
    }>(updateKeys.byDate(WORKSPACE_ID, TODAY));
    expect(cached?.updates).toHaveLength(1);
    expect(cached?.updates[0]).toEqual(MOCK_UPDATE);
    expect(cached?.total).toBe(1);
  });
});

// ─── useEditUpdate ────────────────────────────────────────────────────────────

describe('useEditUpdate', () => {
  const editedUpdate = { ...MOCK_UPDATE, content: 'Edited content' };

  it('calls PATCH endpoint with correct payload', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(editedUpdate);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useEditUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        updateId: 'update-abc',
        content: 'Edited content',
      });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/updates/update-abc`,
      { content: 'Edited content' },
      'mock-access-token',
    );
  });

  it('optimistically updates cache entry in place', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(editedUpdate);
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(updateKeys.byDate(WORKSPACE_ID, TODAY), {
      updates: [MOCK_UPDATE],
      total: 1,
    });

    const { result } = renderHook(() => useEditUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        updateId: 'update-abc',
        content: 'Edited content',
      });
    });

    const cached = queryClient.getQueryData<{
      updates: (typeof MOCK_UPDATE)[];
      total: number;
    }>(updateKeys.byDate(WORKSPACE_ID, TODAY));
    expect(cached?.updates).toHaveLength(1);
    expect(cached?.updates[0].content).toBe('Edited content');
    expect(cached?.total).toBe(1);
  });
});

// ─── useDeleteUpdate ──────────────────────────────────────────────────────────

describe('useDeleteUpdate', () => {
  it('calls DELETE endpoint with correct args', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        updateId: 'update-abc',
        updateDate: TODAY,
      });
    });

    expect(apiClient.delete).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/updates/update-abc`,
      'mock-access-token',
    );
  });

  it('optimistically removes update from cache', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(updateKeys.byDate(WORKSPACE_ID, TODAY), {
      updates: [MOCK_UPDATE],
      total: 1,
    });

    const { result } = renderHook(() => useDeleteUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        updateId: 'update-abc',
        updateDate: TODAY,
      });
    });

    const cached = queryClient.getQueryData<{ updates: unknown[]; total: number }>(
      updateKeys.byDate(WORKSPACE_ID, TODAY),
    );
    expect(cached?.updates).toHaveLength(0);
    expect(cached?.total).toBe(0);
  });

  it('total does not go below zero', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();

    // Edge case: total is already 0
    queryClient.setQueryData(updateKeys.byDate(WORKSPACE_ID, TODAY), {
      updates: [MOCK_UPDATE],
      total: 0,
    });

    const { result } = renderHook(() => useDeleteUpdate(WORKSPACE_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        updateId: 'update-abc',
        updateDate: TODAY,
      });
    });

    const cached = queryClient.getQueryData<{ updates: unknown[]; total: number }>(
      updateKeys.byDate(WORKSPACE_ID, TODAY),
    );
    expect(cached?.total).toBe(0); // Math.max(0 - 1, 0) = 0
  });
});
