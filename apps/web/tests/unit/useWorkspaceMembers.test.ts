// apps/web/tests/unit/useWorkspaceMembers.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useWorkspaceMembers,
  useUpdateMemberRole,
  useRemoveMember,
} from '@/hooks/useWorkspaceMembers';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'workspace-123';

const MOCK_MEMBERS = [
  {
    user_id: 'user-owner',
    role: 'owner' as const,
    joined_at: '2026-01-01T00:00:00Z',
    full_name: 'Alice Owner',
    avatar_url: null,
  },
  {
    user_id: 'user-admin',
    role: 'admin' as const,
    joined_at: '2026-02-01T00:00:00Z',
    full_name: 'Bob Admin',
    avatar_url: null,
  },
  {
    user_id: 'user-member',
    role: 'member' as const,
    joined_at: '2026-03-01T00:00:00Z',
    full_name: 'Carol Member',
    avatar_url: null,
  },
];

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

// ─── useWorkspaceMembers ──────────────────────────────────────────────────────

describe('useWorkspaceMembers', () => {
  it('fetches members for the given workspace', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      members: MOCK_MEMBERS,
      total: MOCK_MEMBERS.length,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceMembers(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/members`,
      MOCK_TOKENS.access_token,
    );
    expect(result.current.data?.members).toHaveLength(3);
    expect(result.current.data?.total).toBe(3);
  });

  it('does not fetch when workspaceId is undefined', () => {
    const { wrapper } = createWrapper();
    renderHook(() => useWorkspaceMembers(undefined), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch when access_token is absent', () => {
    useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
    const { wrapper } = createWrapper();
    renderHook(() => useWorkspaceMembers(MOCK_WORKSPACE_ID), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('returns members with correct shape', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      members: MOCK_MEMBERS,
      total: 3,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWorkspaceMembers(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const owner = result.current.data?.members.find((m) => m.role === 'owner');
    expect(owner?.full_name).toBe('Alice Owner');
    expect(owner?.user_id).toBe('user-owner');
  });
});

// ─── useUpdateMemberRole ──────────────────────────────────────────────────────

describe('useUpdateMemberRole', () => {
  it('calls PATCH with correct path and role', async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      ...MOCK_MEMBERS[1],
      role: 'member',
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateMemberRole(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ userId: 'user-admin', role: 'member' });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/members/user-admin/role`,
      { role: 'member' },
      MOCK_TOKENS.access_token,
    );
  });

  it('updates role in cache on success', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['members', MOCK_WORKSPACE_ID, 'list'], {
      members: MOCK_MEMBERS,
      total: 3,
    });

    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      ...MOCK_MEMBERS[1],
      role: 'member',
      user_id: 'user-admin',
    });

    const { result } = renderHook(() => useUpdateMemberRole(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ userId: 'user-admin', role: 'member' });
    });

    const cached = queryClient.getQueryData<{ members: typeof MOCK_MEMBERS }>([
      'members',
      MOCK_WORKSPACE_ID,
      'list',
    ]);
    const updated = cached?.members.find((m) => m.user_id === 'user-admin');
    expect(updated?.role).toBe('member');
  });

  it('does not modify other members when updating one role', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['members', MOCK_WORKSPACE_ID, 'list'], {
      members: MOCK_MEMBERS,
      total: 3,
    });

    vi.mocked(apiClient.patch).mockResolvedValueOnce({
      ...MOCK_MEMBERS[1],
      role: 'member',
      user_id: 'user-admin',
    });

    const { result } = renderHook(() => useUpdateMemberRole(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ userId: 'user-admin', role: 'member' });
    });

    const cached = queryClient.getQueryData<{ members: typeof MOCK_MEMBERS }>([
      'members',
      MOCK_WORKSPACE_ID,
      'list',
    ]);
    expect(cached?.members.find((m) => m.user_id === 'user-owner')?.role).toBe('owner');
    expect(cached?.members.find((m) => m.user_id === 'user-member')?.role).toBe(
      'member',
    );
  });
});

// ─── useRemoveMember ──────────────────────────────────────────────────────────

describe('useRemoveMember', () => {
  it('calls DELETE with correct path', async () => {
    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveMember(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('user-member');
    });

    expect(apiClient.delete).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/members/user-member`,
      MOCK_TOKENS.access_token,
    );
  });

  it('removes member from cache on success', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['members', MOCK_WORKSPACE_ID, 'list'], {
      members: MOCK_MEMBERS,
      total: 3,
    });

    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRemoveMember(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('user-member');
    });

    const cached = queryClient.getQueryData<{
      members: typeof MOCK_MEMBERS;
      total: number;
    }>(['members', MOCK_WORKSPACE_ID, 'list']);
    expect(cached?.members.find((m) => m.user_id === 'user-member')).toBeUndefined();
    expect(cached?.total).toBe(2);
  });

  it('decrements total in cache after removal', async () => {
    const { wrapper, queryClient } = createWrapper();

    queryClient.setQueryData(['members', MOCK_WORKSPACE_ID, 'list'], {
      members: MOCK_MEMBERS,
      total: 3,
    });

    vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useRemoveMember(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync('user-admin');
    });

    const cached = queryClient.getQueryData<{
      members: typeof MOCK_MEMBERS;
      total: number;
    }>(['members', MOCK_WORKSPACE_ID, 'list']);
    expect(cached?.total).toBe(2);
    expect(cached?.members).toHaveLength(2);
  });
});
