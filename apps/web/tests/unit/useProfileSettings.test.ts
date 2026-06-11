// apps/web/tests/unit/useProfileSettings.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useUpdateProfile,
  useUploadAvatar,
  useDeleteAvatar,
} from '@/hooks/useProfileSettings';
import { apiClient } from '@/lib/api/client';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSetUser = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    tokens: MOCK_TOKENS,
    user: MOCK_USER,
    setUser: mockSetUser,
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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
  mockSetUser.mockReset();
  vi.mocked(useAuth).mockReturnValue({
    tokens: MOCK_TOKENS,
    user: MOCK_USER,
    setUser: mockSetUser,
  } as unknown as ReturnType<typeof useAuth>);
});

// ─── useUpdateProfile ─────────────────────────────────────────────────────────

describe('useUpdateProfile', () => {
  it('calls PATCH /profile with payload', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      ...MOCK_USER,
      full_name: 'Jane Updated',
    });

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ full_name: 'Jane Updated' });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/auth/profile',
      { full_name: 'Jane Updated' },
      MOCK_TOKENS.access_token,
    );
  });

  it('calls PATCH /profile with timezone', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      ...MOCK_USER,
      timezone: 'America/New_York',
    });

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ timezone: 'America/New_York' });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/auth/profile',
      { timezone: 'America/New_York' },
      MOCK_TOKENS.access_token,
    );
  });

  it('mutation is successful on resolve', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(MOCK_USER);

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ full_name: 'Jane' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('mutation fails on reject', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useUpdateProfile(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ full_name: 'Jane' });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ─── useUploadAvatar ──────────────────────────────────────────────────────────

describe('useUploadAvatar', () => {
  it('calls upload endpoint with file', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ avatar_url: 'https://cdn.example.com/avatar.jpg' }),
    });

    const { result } = renderHook(() => useUploadAvatar(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(['content'], 'avatar.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.mutateAsync(mockFile);
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/auth/profile/avatar');
  });

  it('mutation is successful on resolve', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ avatar_url: 'https://cdn.example.com/avatar.jpg' }),
    });

    const { result } = renderHook(() => useUploadAvatar(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(['content'], 'avatar.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.mutateAsync(mockFile);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('mutation fails on reject', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'upload_failed', message: 'Server error' }),
    });

    const { result } = renderHook(() => useUploadAvatar(), {
      wrapper: createWrapper(),
    });

    const mockFile = new File(['content'], 'avatar.jpg', { type: 'image/jpeg' });

    await act(async () => {
      try {
        await result.current.mutateAsync(mockFile);
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

// ─── useDeleteAvatar ──────────────────────────────────────────────────────────

describe('useDeleteAvatar', () => {
  it('calls DELETE /profile/avatar', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteAvatar(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(apiClient.delete).toHaveBeenCalledWith(
      '/auth/profile/avatar',
      MOCK_TOKENS.access_token,
    );
  });

  it('mutation is successful on resolve', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteAvatar(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('mutation fails on reject', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useDeleteAvatar(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
