// apps/web/tests/unit/useSlack.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useSlackSettings,
  useUpdateSlackSettings,
  useSendSlackTest,
  useRemoveSlackIntegration,
} from '@/hooks/useSlack';
import { apiClient } from '@/lib/api/client';
import {
  MOCK_SLACK_SETTINGS,
  MOCK_SLACK_SETTINGS_NOT_CONNECTED,
  MOCK_TOKENS,
} from '../mocks/user';

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

vi.mock('@/hooks/useWorkspace', () => ({
  workspaceKeys: {
    all: ['workspace'],
    mine: () => ['workspace', 'mine'],
  },
}));

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
  vi.mocked(useAuth).mockReturnValue({
    tokens: MOCK_TOKENS,
    user: null,
    isLoading: false,
    error: null,
    isAuthenticated: true,
    needsOnboarding: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    setUser: vi.fn(),
    hydrateSession: vi.fn(),
  });
});

const WORKSPACE_ID = 'workspace-123';

// ─── useSlackSettings ─────────────────────────────────────────────────────────

describe('useSlackSettings', () => {
  it('returns slack settings on success', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_SLACK_SETTINGS);

    const { result } = renderHook(() => useSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(MOCK_SLACK_SETTINGS);
  });

  it('calls correct endpoint', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_SLACK_SETTINGS);

    const { result } = renderHook(() => useSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/slack/settings`,
      MOCK_TOKENS.access_token,
    );
  });

  it('does not fetch when workspaceId is undefined', () => {
    const { result } = renderHook(() => useSlackSettings(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', () => {
    vi.mocked(useAuth).mockReturnValue({
      tokens: null,
      user: null,
      isLoading: false,
      error: null,
      isAuthenticated: false,
      needsOnboarding: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      setUser: vi.fn(),
      hydrateSession: vi.fn(),
    });

    const { result } = renderHook(() => useSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('returns not connected settings correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(MOCK_SLACK_SETTINGS_NOT_CONNECTED);

    const { result } = renderHook(() => useSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.slack_configured).toBe(false);
    expect(result.current.data?.webhook_url_hint).toBeNull();
  });

  it('isLoading is true while fetching', () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });
});

// ─── useUpdateSlackSettings ───────────────────────────────────────────────────

describe('useUpdateSlackSettings', () => {
  it('calls PATCH endpoint with payload', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(MOCK_SLACK_SETTINGS);

    const { result } = renderHook(() => useUpdateSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ slack_digest_enabled: true });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/slack/settings`,
      { slack_digest_enabled: true },
      MOCK_TOKENS.access_token,
    );
  });

  it('calls PATCH with webhook_url payload', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(MOCK_SLACK_SETTINGS);

    const { result } = renderHook(() => useUpdateSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    const webhookUrl = 'https://hooks.slack.com/services/T123/B456/abc';

    await act(async () => {
      await result.current.mutateAsync({ webhook_url: webhookUrl });
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/slack/settings`,
      { webhook_url: webhookUrl },
      MOCK_TOKENS.access_token,
    );
  });

  it('mutation is successful on resolve', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue(MOCK_SLACK_SETTINGS);

    const { result } = renderHook(() => useUpdateSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ slack_updates_enabled: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('mutation fails on reject', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useUpdateSlackSettings(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({ slack_digest_enabled: true });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ─── useSendSlackTest ─────────────────────────────────────────────────────────

describe('useSendSlackTest', () => {
  it('calls POST test endpoint', async () => {
    const mockResponse = {
      success: true,
      message: 'Test message sent successfully.',
    };
    vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSendSlackTest(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/slack/test`,
      {},
      MOCK_TOKENS.access_token,
    );
  });

  it('returns success response', async () => {
    const mockResponse = {
      success: true,
      message: 'Test message sent successfully. Check your Slack channel.',
    };
    vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSendSlackTest(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    let data;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(data).toEqual(mockResponse);
  });

  it('returns failure response', async () => {
    const mockResponse = {
      success: false,
      message: 'Failed to send test message.',
    };
    vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useSendSlackTest(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    let data: { success: boolean; message: string } | undefined;
    await act(async () => {
      data = await result.current.mutateAsync();
    });

    expect(data?.success).toBe(false);
  });

  it('mutation fails on network error', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSendSlackTest(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ─── useRemoveSlackIntegration ────────────────────────────────────────────────

describe('useRemoveSlackIntegration', () => {
  it('calls DELETE endpoint', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveSlackIntegration(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(apiClient.delete).toHaveBeenCalledWith(
      `/workspaces/${WORKSPACE_ID}/slack/settings`,
      MOCK_TOKENS.access_token,
    );
  });

  it('mutation is successful on resolve', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveSlackIntegration(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('mutation fails on reject', async () => {
    vi.mocked(apiClient.delete).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useRemoveSlackIntegration(WORKSPACE_ID), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
