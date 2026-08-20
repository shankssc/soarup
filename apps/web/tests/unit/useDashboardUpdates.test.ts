// apps/web/tests/unit/useDashboardUpdates.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useDashboardUpdates } from '@/hooks/useDashboardUpdates';
import { dispatch, clearAllHandlers } from '@/lib/websocket/registry';
import { updateKeys } from '@/hooks/useUpdates';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'workspace-123';
const MOCK_UPDATE_ID = 'update-abc';
const MOCK_UPDATE_DATE = '2026-05-21';

const MOCK_UPDATE = {
  id: MOCK_UPDATE_ID,
  workspace_id: MOCK_WORKSPACE_ID,
  user_id: 'user-123',
  content: 'Finished the API integration.',
  mode: 'text',
  status: 'pending' as const,
  summary: null,
  update_date: MOCK_UPDATE_DATE,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

function makeStatusChangedEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'update.status_changed',
    workspace_id: MOCK_WORKSPACE_ID,
    event_id: 'evt-123',
    timestamp: new Date().toISOString(),
    payload: {
      update_id: MOCK_UPDATE_ID,
      workspace_id: MOCK_WORKSPACE_ID,
      update_date: MOCK_UPDATE_DATE,
      status: 'processed',
      summary: 'They finished the API integration.',
      ...overrides,
    },
  };
}

// ─── Wrapper factory ──────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryWrapper';
  return { wrapper: Wrapper, queryClient };
}

// ─── Cache helper ─────────────────────────────────────────────────────────────

function seedCache(queryClient: QueryClient, updates = [MOCK_UPDATE]) {
  queryClient.setQueryData(updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE), {
    updates,
    total: updates.length,
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearAllHandlers();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDashboardUpdates', () => {
  it('patches status in cache when update.status_changed event arrives', () => {
    const { wrapper, queryClient } = createWrapper();
    seedCache(queryClient);

    renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), { wrapper });

    act(() => {
      dispatch(makeStatusChangedEvent({ status: 'processed', summary: 'AI summary.' }));
    });

    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    expect(cached?.updates[0].status).toBe('processed');
    expect(cached?.updates[0].summary).toBe('AI summary.');
  });

  it('patches status without triggering a refetch', () => {
    const { wrapper, queryClient } = createWrapper();
    seedCache(queryClient);

    renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), { wrapper });

    act(() => {
      dispatch(makeStatusChangedEvent({ status: 'processing' }));
    });

    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    expect(cached?.updates[0].status).toBe('processing');
    expect(queryClient.isFetching()).toBe(0);
  });

  it('patches summary in cache when status is processed', () => {
    const { wrapper, queryClient } = createWrapper();
    seedCache(queryClient);

    renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), { wrapper });

    act(() => {
      dispatch(makeStatusChangedEvent({ status: 'processed', summary: 'AI summary.' }));
    });

    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    expect(cached?.updates[0].summary).toBe('AI summary.');
  });

  it('ignores events for other workspaces', () => {
    const { wrapper, queryClient } = createWrapper();
    seedCache(queryClient);

    renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), { wrapper });

    act(() => {
      dispatch(
        makeStatusChangedEvent({
          workspace_id: 'other-workspace',
          status: 'processed',
          summary: 'Should be ignored.',
        }),
      );
    });

    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    expect(cached?.updates[0].status).toBe('pending');
  });

  it('does not modify other updates in the same cache entry', () => {
    const { wrapper, queryClient } = createWrapper();
    const secondUpdate = {
      ...MOCK_UPDATE,
      id: 'update-xyz',
      status: 'pending' as const,
    };
    seedCache(queryClient, [MOCK_UPDATE, secondUpdate]);

    renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), { wrapper });

    act(() => {
      dispatch(
        makeStatusChangedEvent({
          update_id: 'update-abc',
          status: 'processed',
        }),
      );
    });

    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    const abc = cached?.updates.find((u) => u.id === 'update-abc');
    const xyz = cached?.updates.find((u) => u.id === 'update-xyz');

    expect(abc?.status).toBe('processed');
    expect(xyz?.status).toBe('pending');
  });

  it('does nothing when workspaceId is undefined', () => {
    const { wrapper, queryClient } = createWrapper();
    seedCache(queryClient);

    expect(() => {
      renderHook(() => useDashboardUpdates(undefined), { wrapper });
      act(() => {
        dispatch(makeStatusChangedEvent({ status: 'processed' }));
      });
    }).not.toThrow();

    // Cache should be untouched since hook early-returned
    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    expect(cached?.updates[0].status).toBe('pending');
  });

  it('unsubscribes handler on unmount so cache is not mutated after unmount', () => {
    const { wrapper, queryClient } = createWrapper();
    seedCache(queryClient);

    const { unmount } = renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    unmount();

    act(() => {
      dispatch(makeStatusChangedEvent({ status: 'processed' }));
    });

    const cached = queryClient.getQueryData<{ updates: (typeof MOCK_UPDATE)[] }>(
      updateKeys.byDate(MOCK_WORKSPACE_ID, MOCK_UPDATE_DATE),
    );
    expect(cached?.updates[0].status).toBe('pending');
  });

  it('handles missing cache entry gracefully without throwing', () => {
    const { wrapper } = createWrapper();
    // Intentionally do NOT seed cache

    expect(() => {
      renderHook(() => useDashboardUpdates(MOCK_WORKSPACE_ID), { wrapper });
      act(() => {
        dispatch(makeStatusChangedEvent({ status: 'processed' }));
      });
    }).not.toThrow();
  });
});
