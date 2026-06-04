// apps/web/tests/unit/useInviteMembers.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  usePendingInvites,
  useCreateInvite,
  useRevokeInvite,
  useInviteDetails,
  useAcceptInvite,
} from '@/hooks/useInviteMembers';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-owner',
  email: 'alice@example.com',
  full_name: 'Alice Owner',
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

const MOCK_WORKSPACE_ID = 'workspace-123';

const MOCK_PENDING_INVITES = [
  {
    id: 'inv-001',
    email: 'dave@example.com',
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const MOCK_INVITE_DETAILS = {
  workspace_name: 'Acme Corp',
  workspace_slug: 'acme-corp',
  invited_by_name: 'Alice Owner',
  email: 'dave@example.com',
  expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  is_valid: true,
};

const MOCK_INVITE_CODE = 'testinvitecode123';

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryWrapper';
  return { wrapper: Wrapper, queryClient };
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.setState({
    user: MOCK_USER,
    tokens: MOCK_TOKENS,
    isLoading: false,
    error: null,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
});

// ─── usePendingInvites ────────────────────────────────────────────────────────

describe('usePendingInvites', () => {
  it('fetches pending invites for the workspace', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      invites: MOCK_PENDING_INVITES,
      total: 1,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePendingInvites(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/invites`,
      MOCK_TOKENS.access_token,
    );
    expect(result.current.data?.invites).toHaveLength(1);
    expect(result.current.data?.invites[0].email).toBe('dave@example.com');
  });

  it('does not fetch when workspaceId is undefined', () => {
    const { wrapper } = createWrapper();
    renderHook(() => usePendingInvites(undefined), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch when access_token is absent', () => {
    useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
    const { wrapper } = createWrapper();
    renderHook(() => usePendingInvites(MOCK_WORKSPACE_ID), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});

// ─── useCreateInvite ──────────────────────────────────────────────────────────

describe('useCreateInvite', () => {
  const newInvite = {
    id: 'inv-new',
    workspace_id: MOCK_WORKSPACE_ID,
    email: 'new@example.com',
    code: 'newcode123',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    is_used: false,
    created_at: new Date().toISOString(),
  };

  it('calls POST with correct path and email', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(newInvite);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateInvite(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('new@example.com');
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/invites`,
      { email: 'new@example.com' },
      MOCK_TOKENS.access_token,
    );
  });

  it('appends invite to pending invites cache on success', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['invites', MOCK_WORKSPACE_ID, 'pending'], {
      invites: MOCK_PENDING_INVITES,
      total: 1,
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce(newInvite);

    const { result } = renderHook(() => useCreateInvite(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('new@example.com');
    });

    const cached = queryClient.getQueryData<{
      invites: typeof MOCK_PENDING_INVITES;
      total: number;
    }>(['invites', MOCK_WORKSPACE_ID, 'pending']);

    expect(cached?.invites).toHaveLength(2);
    expect(cached?.total).toBe(2);
    expect(cached?.invites[1].email).toBe('new@example.com');
  });

  it('increments total in cache after creation', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['invites', MOCK_WORKSPACE_ID, 'pending'], {
      invites: [],
      total: 0,
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce(newInvite);

    const { result } = renderHook(() => useCreateInvite(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('new@example.com');
    });

    const cached = queryClient.getQueryData<{ total: number }>([
      'invites',
      MOCK_WORKSPACE_ID,
      'pending',
    ]);
    expect(cached?.total).toBe(1);
  });
});

// ─── useRevokeInvite ──────────────────────────────────────────────────────────

describe('useRevokeInvite', () => {
  it('calls DELETE with correct invite id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRevokeInvite(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('inv-001');
    });

    expect(apiClient.delete).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/invites/inv-001`,
      MOCK_TOKENS.access_token,
    );
  });

  it('removes invite from cache on success', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['invites', MOCK_WORKSPACE_ID, 'pending'], {
      invites: MOCK_PENDING_INVITES,
      total: 1,
    });

    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRevokeInvite(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('inv-001');
    });

    const cached = queryClient.getQueryData<{
      invites: typeof MOCK_PENDING_INVITES;
      total: number;
    }>(['invites', MOCK_WORKSPACE_ID, 'pending']);

    expect(cached?.invites).toHaveLength(0);
    expect(cached?.total).toBe(0);
  });
});

// ─── useInviteDetails ─────────────────────────────────────────────────────────

describe('useInviteDetails', () => {
  it('fetches invite details without auth token (public endpoint)', async () => {
    // Clear auth — this is a public endpoint
    useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });

    vi.mocked(apiClient.get).mockResolvedValueOnce(MOCK_INVITE_DETAILS);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInviteDetails(MOCK_INVITE_CODE), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Called with only one argument — no token
    expect(apiClient.get).toHaveBeenCalledWith(`/invites/${MOCK_INVITE_CODE}`);
    expect(result.current.data?.workspace_name).toBe('Acme Corp');
    expect(result.current.data?.is_valid).toBe(true);
  });

  it('does not fetch when code is undefined', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useInviteDetails(undefined), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not retry on failure — called exactly once', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Not found'));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInviteDetails(MOCK_INVITE_CODE), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // retry: false on this hook — only one attempt
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('returns invite details with correct shape', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(MOCK_INVITE_DETAILS);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInviteDetails(MOCK_INVITE_CODE), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.workspace_slug).toBe('acme-corp');
    expect(result.current.data?.invited_by_name).toBe('Alice Owner');
    expect(result.current.data?.email).toBe('dave@example.com');
  });
});

// ─── useAcceptInvite ──────────────────────────────────────────────────────────

describe('useAcceptInvite', () => {
  it('calls POST to accept invite', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      workspace_id: MOCK_WORKSPACE_ID,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAcceptInvite(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(MOCK_INVITE_CODE);
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/invites/${MOCK_INVITE_CODE}/accept`,
      {},
      MOCK_TOKENS.access_token,
    );
  });

  it('returns workspace_id on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      workspace_id: MOCK_WORKSPACE_ID,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAcceptInvite(), { wrapper });

    let response: { workspace_id: string } | undefined;
    await act(async () => {
      response = await result.current.mutateAsync(MOCK_INVITE_CODE);
    });

    expect(response?.workspace_id).toBe(MOCK_WORKSPACE_ID);
  });

  it('invalidates workspace and member caches on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      workspace_id: MOCK_WORKSPACE_ID,
    });

    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAcceptInvite(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(MOCK_INVITE_CODE);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['workspace'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['members'] }),
    );
  });
});
