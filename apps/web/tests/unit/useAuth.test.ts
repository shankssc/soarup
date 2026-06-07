// apps/web/tests/unit/useAuth.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuth, useAuthStore } from '@/hooks/useAuth';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLoginResponse(overrides = {}) {
  return {
    access_token: MOCK_TOKENS.access_token,
    refresh_token: MOCK_TOKENS.refresh_token,
    expires_in: MOCK_TOKENS.expires_at,
    user: MOCK_USER,
    ...overrides,
  };
}

function mockFetchSuccess(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

function mockFetchError(errorCode: string, status = 401) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: errorCode, message: 'Server error' }),
    }),
  );
}

function mockFetchNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
}

// ─── Reset store between tests ────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    tokens: null,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── useAuth derived state ────────────────────────────────────────────────────

describe('useAuth — derived state', () => {
  it('isAuthenticated is false when no user', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('isAuthenticated is false when tokens are expired', () => {
    useAuthStore.setState({
      user: MOCK_USER,
      tokens: {
        access_token: 'abc',
        refresh_token: 'xyz',
        expires_at: Date.now() - 1000, // already expired
      },
    });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('isAuthenticated is true when user and tokens are valid', () => {
    useAuthStore.setState({
      user: MOCK_USER,
      tokens: {
        access_token: 'abc',
        refresh_token: 'xyz',
        expires_at: Date.now() + 3600 * 1000,
      },
    });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('needsOnboarding is true when authenticated and is_onboarded is false', () => {
    useAuthStore.setState({
      user: { ...MOCK_USER, is_onboarded: false },
      tokens: {
        access_token: 'abc',
        refresh_token: 'xyz',
        expires_at: Date.now() + 3600 * 1000,
      },
    });
    const { result } = renderHook(() => useAuth());
    expect(result.current.needsOnboarding).toBe(true);
  });

  it('needsOnboarding is false when user is already onboarded', () => {
    useAuthStore.setState({
      user: { ...MOCK_USER, is_onboarded: true },
      tokens: {
        access_token: 'abc',
        refresh_token: 'xyz',
        expires_at: Date.now() + 3600 * 1000,
      },
    });
    const { result } = renderHook(() => useAuth());
    expect(result.current.needsOnboarding).toBe(false);
  });

  it('needsOnboarding is false when not authenticated', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.needsOnboarding).toBe(false);
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe('useAuth — login', () => {
  it('sets user and tokens on success', async () => {
    mockFetchSuccess(makeLoginResponse());
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'Password1');
    });

    expect(result.current.user).toEqual(MOCK_USER);
    expect(result.current.tokens?.access_token).toBe(MOCK_TOKENS.access_token);
    expect(result.current.tokens?.refresh_token).toBe(MOCK_TOKENS.refresh_token);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets expires_at as a future timestamp', async () => {
    const before = Date.now();
    mockFetchSuccess(makeLoginResponse());
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'Password1');
    });

    expect(result.current.tokens?.expires_at).toBeGreaterThan(before);
    expect(result.current.tokens?.expires_at).toBeGreaterThan(Date.now() + 3500 * 1000);
  });

  it('sets isLoading to false after success', async () => {
    mockFetchSuccess(makeLoginResponse());
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'Password1');
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('sets friendly error on authentication_failed', async () => {
    mockFetchError('authentication_failed', 401);
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'wrongpass').catch(() => {});
    });

    expect(result.current.error).toBe('Incorrect email or password.');
    expect(result.current.user).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('sets friendly error on service_unavailable', async () => {
    mockFetchError('service_unavailable', 503);
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'Password1').catch(() => {});
    });

    expect(result.current.error).toBe(
      'Service temporarily unavailable. Please try again shortly.',
    );
  });

  it('sets network_error message on fetch failure', async () => {
    mockFetchNetworkError();
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'Password1').catch(() => {});
    });

    expect(result.current.error).toBe(
      'Unable to connect. Check your internet connection.',
    );
  });

  it('re-throws error so form can catch it', async () => {
    mockFetchError('authentication_failed', 401);
    const { result } = renderHook(() => useAuth());
    let thrown: unknown;

    await act(async () => {
      try {
        await result.current.login('bad@email.com', 'wrong');
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
  });

  it('throws when server returns null refresh_token', async () => {
    mockFetchSuccess(makeLoginResponse({ refresh_token: null }));
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('test@soarup.app', 'Password1').catch(() => {});
    });

    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});

// ─── signup ───────────────────────────────────────────────────────────────────

describe('useAuth — signup', () => {
  it('sets user and tokens on success', async () => {
    mockFetchSuccess(makeLoginResponse());
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signup('new@soarup.app', 'Password1', 'New User');
    });

    expect(result.current.user).toEqual(MOCK_USER);
    expect(result.current.tokens?.access_token).toBe(MOCK_TOKENS.access_token);
    expect(result.current.error).toBeNull();
  });

  it('works without fullName argument', async () => {
    mockFetchSuccess(makeLoginResponse());
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signup('new@soarup.app', 'Password1');
    });

    expect(result.current.user).toEqual(MOCK_USER);
  });

  it('sets friendly error on user_already_exists', async () => {
    mockFetchError('user_already_exists', 409);
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signup('existing@soarup.app', 'Password1').catch(() => {});
    });

    expect(result.current.error).toBe('An account with this email already exists.');
  });

  it('sets friendly error on registration_failed', async () => {
    mockFetchError('registration_failed', 400);
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signup('bad@soarup.app', 'Password1').catch(() => {});
    });

    expect(result.current.error).toBe(
      'Could not create your account. Please try again.',
    );
  });

  it('re-throws error so form can catch it', async () => {
    mockFetchError('registration_failed', 400);
    const { result } = renderHook(() => useAuth());
    let thrown: unknown;

    await act(async () => {
      try {
        await result.current.signup('bad@soarup.app', 'Password1');
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe('useAuth — logout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: MOCK_USER,
      tokens: {
        access_token: 'access-abc',
        refresh_token: 'refresh-xyz',
        expires_at: Date.now() + 3600 * 1000,
      },
      isLoading: false,
      error: null,
    });
  });

  it('clears user and tokens after logout', async () => {
    mockFetchSuccess({}, 204);
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.tokens).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('clears state even when logout API call fails', async () => {
    mockFetchNetworkError();
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.tokens).toBeNull();
  });

  it('sets isLoading to false after logout', async () => {
    mockFetchSuccess({}, 204);
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ─── clearError ───────────────────────────────────────────────────────────────

describe('useAuth — clearError', () => {
  it('clears the error field', () => {
    useAuthStore.setState({ error: 'Some error' });
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});

// ─── setUser ──────────────────────────────────────────────────────────────────

describe('useAuth — setUser', () => {
  it('updates the user in the store', () => {
    useAuthStore.setState({ user: MOCK_USER });
    const { result } = renderHook(() => useAuth());
    const updated = { ...MOCK_USER, full_name: 'Updated Name' };

    act(() => {
      result.current.setUser(updated);
    });

    expect(result.current.user?.full_name).toBe('Updated Name');
  });
});
