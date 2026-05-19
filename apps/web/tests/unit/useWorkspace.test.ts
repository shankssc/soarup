// apps/web/tests/unit/useWorkspace.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-123',
  email: 'jane@example.com',
  full_name: 'Jane Doe',
  avatar_url: null,
  email_verified: true,
  is_onboarded: true,
  created_at: new Date().toISOString(),
};

const MOCK_TOKENS = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600 * 1000,
};

const MOCK_WORKSPACE = {
  id: 'workspace-123',
  name: 'Acme Team',
  slug: 'acme-team',
  owner_id: 'user-123',
  plan: 'free',
  created_at: new Date().toISOString(),
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useWorkspace', () => {
  it('returns workspace data when token is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([MOCK_WORKSPACE]);
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Returns first item, not the array
    expect(result.current.data).toEqual(MOCK_WORKSPACE);
  });

  it('returns null when API returns empty array', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([]);
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not fetch when token is missing', async () => {
    useAuthStore.setState({ tokens: null });
    vi.mocked(apiClient.get).mockResolvedValue([MOCK_WORKSPACE]);
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: createWrapper(),
    });
    // Should be idle — not fetching
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('passes access token to apiClient', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([MOCK_WORKSPACE]);
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith('/workspaces/me', 'mock-access-token');
  });

  it('isLoading is true while fetching', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useWorkspace(), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });
});
