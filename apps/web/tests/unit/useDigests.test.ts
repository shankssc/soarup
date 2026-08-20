// apps/web/tests/unit/useDigests.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useDigests,
  useDigest,
  useUpdateDigestSettings,
  useDigestPreview,
} from '@/hooks/useDigests';
import { apiClient } from '@/lib/api/client';
import { MOCK_DIGEST, MOCK_TOKENS } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ tokens: MOCK_TOKENS })),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';
const DIGEST_ID = 'digest-123';

const MOCK_LIST_PAGE = {
  digests: [MOCK_DIGEST],
  next_cursor: null,
  total: 1,
};

const MOCK_LIST_PAGE_WITH_CURSOR = {
  digests: [MOCK_DIGEST],
  next_cursor: '2026-06-07T09:00:00Z|digest-123',
  total: 5,
};

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

import { useAuth } from '@/hooks/useAuth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ tokens: MOCK_TOKENS } as ReturnType<
    typeof useAuth
  >);
});

// ─── useDigests ───────────────────────────────────────────────────────────────

describe('useDigests', () => {
  it('returns digest list on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_LIST_PAGE);

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const allDigests = result.current.data?.pages.flatMap((p) => p.digests) ?? [];
    expect(allDigests).toHaveLength(1);
    expect(allDigests[0].id).toBe(DIGEST_ID);
  });

  it('does not fetch when workspaceId is undefined', () => {
    const { result } = renderHook(() => useDigests(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', () => {
    vi.mocked(useAuth).mockReturnValue({ tokens: null } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('passes access token to apiClient', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_LIST_PAGE);

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/digests`,
      MOCK_TOKENS.access_token,
      expect.objectContaining({ limit: '20' }),
    );
  });

  it('passes custom limit to apiClient', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_LIST_PAGE);

    const { result } = renderHook(() => useDigests(WORKSPACE_ID, 5), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ limit: '5' }),
    );
  });

  it('hasNextPage is true when next_cursor is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_LIST_PAGE_WITH_CURSOR);

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(true);
  });

  it('hasNextPage is false when next_cursor is null', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_LIST_PAGE);

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.hasNextPage).toBe(false);
  });

  it('passes cursor on fetchNextPage', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(MOCK_LIST_PAGE_WITH_CURSOR)
      .mockResolvedValueOnce({ ...MOCK_LIST_PAGE, next_cursor: null });

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(apiClient.get).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ cursor: '2026-06-07T09:00:00Z|digest-123' }),
    );
  });

  it('isLoading is true while fetching', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useDigests(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });
});

// ─── useDigest ────────────────────────────────────────────────────────────────

describe('useDigest', () => {
  it('returns digest detail on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_DIGEST);

    const { result } = renderHook(() => useDigest(WORKSPACE_ID, DIGEST_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe(DIGEST_ID);
  });

  it('does not fetch when workspaceId is undefined', () => {
    const { result } = renderHook(() => useDigest(undefined, DIGEST_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch when digestId is undefined', () => {
    const { result } = renderHook(() => useDigest(WORKSPACE_ID, undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('calls correct endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_DIGEST);

    const { result } = renderHook(() => useDigest(WORKSPACE_ID, DIGEST_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/digests/${DIGEST_ID}`,
      MOCK_TOKENS.access_token,
    );
  });
});

// ─── useUpdateDigestSettings ──────────────────────────────────────────────────

describe('useUpdateDigestSettings', () => {
  it('calls PATCH endpoint with payload', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(MOCK_DIGEST);

    const { result } = renderHook(() => useUpdateDigestSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ digest_enabled: true });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/digest-settings`,
      { digest_enabled: true },
      MOCK_TOKENS.access_token,
    );
  });

  it('mutation is successful on resolve', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(MOCK_DIGEST);

    const { result } = renderHook(() => useUpdateDigestSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ digest_enabled: true });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('mutation fails on reject', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useUpdateDigestSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ digest_enabled: true });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ─── useDigestPreview ─────────────────────────────────────────────────────────

describe('useDigestPreview', () => {
  it('calls POST preview endpoint', async () => {
    const MOCK_PREVIEW = {
      html: '<html>preview</html>',
      digest_date: '2026-06-07',
      update_count: 2,
      would_send_to: ['test@example.com'],
    };
    vi.mocked(apiClient.post).mockResolvedValue(MOCK_PREVIEW);

    const { result } = renderHook(() => useDigestPreview(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/digests/preview`,
      {},
      MOCK_TOKENS.access_token,
    );
  });

  it('returns preview data on success', async () => {
    const MOCK_PREVIEW = {
      html: '<html>digest</html>',
      digest_date: '2026-06-07',
      update_count: 3,
      would_send_to: ['a@test.com', 'b@test.com'],
    };
    vi.mocked(apiClient.post).mockResolvedValue(MOCK_PREVIEW);

    const { result } = renderHook(() => useDigestPreview(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    let data;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(data).toEqual(MOCK_PREVIEW);
  });
});
