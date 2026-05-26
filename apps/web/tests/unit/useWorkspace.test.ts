// apps/web/tests/unit/useWorkspace.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
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

const mockTokens = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600 * 1000,
};

// Mock useAuth directly — avoids store/supabase import chain issues
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ tokens: mockTokens })),
  useAuthStore: {
    setState: vi.fn(),
    getState: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
  // Restore default token for most tests
  vi.mocked(useAuth).mockReturnValue({ tokens: mockTokens } as ReturnType<
    typeof useAuth
  >);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

import { useAuth } from '@/hooks/useAuth';

describe('useWorkspace', () => {
  it('returns workspace data when token is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [MOCK_WORKSPACE] });
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(MOCK_WORKSPACE);
  });

  it('returns null when API returns empty array', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('does not fetch when token is missing', () => {
    vi.mocked(useAuth).mockReturnValue({ tokens: null } as ReturnType<typeof useAuth>);
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('passes access token to apiClient', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [MOCK_WORKSPACE] });
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.get).toHaveBeenCalledWith(
      '/workspaces/', // ← was '/workspaces/me'
      'mock-access-token',
    );
  });

  it('isLoading is true while fetching', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useWorkspace(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });
});
