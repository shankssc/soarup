// apps/web/tests/unit/usePublicProfile.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { usePublicProfile, useUsernameAvailability } from '@/hooks/usePublicProfile';
import { apiClient } from '@/lib/api/client';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getPublic: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_PUBLIC_PROFILE = {
  username: 'suyash',
  full_name: 'Suyash Chaudhary',
  avatar_url: null,
  bio: 'Building in public',
  tagline: 'Fullstack · Open source',
  streak: {
    current_streak: 5,
    best_streak: 10,
    total_submissions: 42,
    last_submission_date: '2026-07-07',
  },
  heatmap: [],
  heatmap_weeks: 52,
};

const MOCK_AVAILABILITY_AVAILABLE = {
  username: 'suyash',
  available: true,
  message: 'Available',
};

const MOCK_AVAILABILITY_TAKEN = {
  username: 'taken',
  available: false,
  message: 'Already taken',
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
});

// ─── usePublicProfile ─────────────────────────────────────────────────────────

describe('usePublicProfile', () => {
  it('returns profile data on success', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PUBLIC_PROFILE);

    const { result } = renderHook(() => usePublicProfile('suyash'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.username).toBe('suyash');
    expect(result.current.data?.streak.current_streak).toBe(5);
    expect(result.current.data?.streak.total_submissions).toBe(42);
  });

  it('calls getPublic without Authorization header', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PUBLIC_PROFILE);

    const { result } = renderHook(() => usePublicProfile('suyash'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // getPublic called — not apiClient.get which would include auth header
    expect(apiClient.getPublic).toHaveBeenCalledWith('/profiles/suyash');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('calls correct endpoint with username', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PUBLIC_PROFILE);

    const { result } = renderHook(() => usePublicProfile('suyash'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.getPublic).toHaveBeenCalledWith('/profiles/suyash');
  });

  it('does not retry on 404', async () => {
    vi.mocked(apiClient.getPublic).mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => usePublicProfile('notfound'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // retry: false — only one call ever made
    expect(apiClient.getPublic).toHaveBeenCalledTimes(1);
  });

  it('isLoading is true while fetching', () => {
    vi.mocked(apiClient.getPublic).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePublicProfile('suyash'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('isError is true on failure', async () => {
    vi.mocked(apiClient.getPublic).mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => usePublicProfile('notfound'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ─── useUsernameAvailability ──────────────────────────────────────────────────

describe('useUsernameAvailability', () => {
  it('returns available true when username is free', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_AVAILABILITY_AVAILABLE);

    const { result } = renderHook(
      () => useUsernameAvailability('suyash', undefined, true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.available).toBe(true);
    expect(result.current.data?.message).toBe('Available');
  });

  it('returns available false when username is taken', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_AVAILABILITY_TAKEN);

    const { result } = renderHook(
      () => useUsernameAvailability('taken', undefined, true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.available).toBe(false);
    expect(result.current.data?.message).toBe('Already taken');
  });

  it('is disabled when username is less than 3 chars', () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_AVAILABILITY_AVAILABLE);

    const { result } = renderHook(
      () => useUsernameAvailability('ab', undefined, true),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.getPublic).not.toHaveBeenCalled();
  });

  it('is disabled when enabled is false', () => {
    const { result } = renderHook(
      () => useUsernameAvailability('suyash', undefined, false),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.getPublic).not.toHaveBeenCalled();
  });

  it('passes current_user_id in query string when provided', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_AVAILABILITY_AVAILABLE);

    const { result } = renderHook(
      () => useUsernameAvailability('suyash', 'user-123', true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.getPublic).toHaveBeenCalledWith(
      '/auth/check-username?username=suyash&current_user_id=user-123',
    );
  });

  it('omits current_user_id when not provided', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_AVAILABILITY_AVAILABLE);

    const { result } = renderHook(
      () => useUsernameAvailability('suyash', undefined, true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.getPublic).toHaveBeenCalledWith(
      '/auth/check-username?username=suyash',
    );
  });

  it('is disabled when username is exactly 2 chars', () => {
    const { result } = renderHook(
      () => useUsernameAvailability('ab', 'user-123', true),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is enabled when username is exactly 3 chars', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_AVAILABILITY_AVAILABLE);

    const { result } = renderHook(
      () => useUsernameAvailability('abc', undefined, true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.getPublic).toHaveBeenCalled();
  });
});
