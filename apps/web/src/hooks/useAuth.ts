'use client';

// apps/web/hooks/useAuth.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  email_verified: boolean;
  is_onboarded: boolean;
  created_at: string;
  username: string | null;
  bio: string | null;
  tagline: string | null;
  profile_public: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
}

export interface AuthState {
  user: UserProfile | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<'authenticated' | 'confirmation_required'>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: UserProfile) => void;
}

// ─── API client helpers ───────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

interface ApiErrorEnvelope {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

// Maps FastAPI error codes to user-facing messages
const ERROR_MESSAGES: Record<string, string> = {
  authentication_failed: 'Incorrect email or password.',
  user_already_exists: 'An account with this email already exists.',
  registration_failed: 'Could not create your account. Please try again.',
  service_unavailable: 'Service temporarily unavailable. Please try again shortly.',
  invalid_refresh_token: 'Your session has expired. Please sign in again.',
  missing_token: 'Authorization required.',
  invalid_token: 'Your session is invalid. Please sign in again.',
  internal_error: 'Something went wrong. Please try again.',
  network_error: 'Unable to connect. Check your internet connection.',
};

function friendlyError(code: string): string {
  return ERROR_MESSAGES[code] ?? 'An unexpected error occurred.';
}

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(friendlyError('network_error'));
  }

  if (!res.ok) {
    let envelope: ApiErrorEnvelope & { detail?: string };
    try {
      envelope = await res.json();
    } catch {
      throw new Error(friendlyError('internal_error'));
    }
    // ── Onboarding gate intercept ──────────────────────────────────────────
    // OnboardedDep returns HTTP 403 with FastAPI's default detail field.
    // We check the exact string to avoid swallowing legitimate 403s.

    if (
      res.status === 403 &&
      typeof envelope?.detail === 'string' &&
      envelope.detail.toLowerCase().includes('onboarding required')
    ) {
      if (typeof window !== 'undefined') {
        window.location.href = '/onboarding';
      }
      // Throw anyway so the calling code's try/catch doesn't proceed
      throw new Error('Onboarding required.');
    }

    const code = envelope?.error ?? 'internal_error';
    throw new Error(friendlyError(code));
  }

  return res.json() as Promise<T>;
}

// ─── Login / signup response shape (matches FastAPI LoginResponse schema) ──────

interface LoginResponse {
  access_token: string;
  refresh_token: string | null;
  expires_in: number; // seconds
  user: UserProfile;
}

interface SignupResponse {
  status: 'authenticated' | 'confirmation_required';
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string | null;
  user?: UserProfile;
  email?: string;
  message?: string;
}

// ─── Supabase session sync ────────────────────────────────────────────────────
// After FastAPI returns tokens, we sync them into the Supabase JS client so
// the server-side cookie-based session is set correctly. This allows
// createServerSupabaseClient() in Server Components to read the session.

// supabase.auth.setSession()'s returned promise can resolve BEFORE the
// underlying session cookie is actually written. The cookie write is
// driven by supabase-js's onAuthStateChange event, which is dispatched
// asynchronously (outside the setSession call stack) specifically to
// avoid re-entrancy issues — so awaiting setSession alone does not
// guarantee the cookie @supabase/ssr's middleware reads is present yet.
// This was the root cause of an intermittent race: a navigation straight
// after setSession could hit middleware before the cookie existed,
// bouncing an authenticated user to /login. A fixed delay was previously
// used to paper over this, which is not a real fix — no fixed number is
// guaranteed safe, only "usually long enough". Polling for the actual
// cookie is deterministic instead.
function hasSupabaseSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  // @supabase/ssr's browser client names its cookie sb-<project-ref>-auth-token
  // (and may chunk large tokens into sb-<ref>-auth-token.0, .1, etc.) — match
  // the stable part of that pattern rather than hardcoding the project ref.
  return /(?:^|;\s*)sb-[^=;]+-auth-token[^=;]*=/.test(document.cookie);
}

async function waitForSupabaseSessionCookie(
  timeoutMs = 12000,
  intervalMs = 50,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (hasSupabaseSessionCookie()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function syncSupabaseSession(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const cookieReady = await waitForSupabaseSessionCookie();
    if (!cookieReady) {
      // Non-fatal — see comment on the try/catch below. But worth a loud
      // warning: any immediately-following navigation to a middleware-
      // protected route will very likely bounce to /login.
      console.warn(
        'Supabase session cookie did not appear within timeout — a subsequent ' +
          'navigation to a protected route may redirect to /login.',
      );
    }
  } catch {
    // Non-fatal — Zustand store is the source of truth for client-side auth.
    // Server-side session may not work until next page load.
    console.warn('Failed to sync Supabase session cookie.');
  }
}

// ─── Zustand store ────────────────────────────────────────────────────────────
//
// Persisted to localStorage under "soarup-auth".
// Tokens are stored so the app survives a page refresh without re-login.
// The persisted tokens are validated on hydration — if expired, user is
// treated as logged out (the API will return 401 anyway).

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      // ── Initial state ──────────────────────────────────────────────────────
      user: null,
      tokens: null,
      isLoading: false,
      error: null,

      // ── Actions ────────────────────────────────────────────────────────────

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiPost<LoginResponse>('/auth/login', {
            email,
            password,
          });

          const refresh_token = data.refresh_token;

          if (!refresh_token) {
            throw new Error('Refresh token was not sent by the server');
          }

          // Sync tokens into Supabase JS client so server-side cookie is set.
          // This allows createServerSupabaseClient() to read the session.
          await syncSupabaseSession(data.access_token, data.refresh_token ?? '');

          set({
            user: data.user,
            tokens: {
              access_token: data.access_token,
              refresh_token: refresh_token,
              expires_at: Date.now() + data.expires_in * 1000,
            },
            isLoading: false,
            error: null,
          });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : friendlyError('internal_error'),
          });
          throw err; // re-throw so form can catch it too if needed
        }
      },

      signup: async (email, password, fullName) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiPost<SignupResponse>('/auth/signup', {
            email,
            password,
            ...(fullName ? { full_name: fullName } : {}),
          });

          if (data.status === 'confirmation_required') {
            set({ isLoading: false, error: null });
            return 'confirmation_required';
          }

          if (!data.access_token || !data.refresh_token || !data.user) {
            throw new Error('Server returned an incomplete session.');
          }

          await syncSupabaseSession(data.access_token, data.refresh_token);

          set({
            user: data.user,
            tokens: {
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
            },
            isLoading: false,
            error: null,
          });
          return 'authenticated';
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : friendlyError('internal_error'),
          });
          throw err;
        }
      },

      logout: async () => {
        const { tokens } = get();
        set({ isLoading: true });

        // Fire and forget — we clear local state regardless of API response
        if (tokens?.access_token) {
          try {
            await fetch(`${API_BASE}/auth/logout`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
          } catch {
            // Swallow — local state is cleared regardless
          }
        }

        // Clear Supabase cookie session so server-side reads return null
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
        } catch {
          // Swallow — local state cleared regardless
        }

        set({ user: null, tokens: null, isLoading: false, error: null });
      },

      clearError: () => set({ error: null }),

      setUser: (user) => set({ user }),
    }),
    {
      name: 'soarup-auth',
      // Only persist user + tokens, not loading/error state
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
      }),
    },
  ),
);

// ─── Convenience hook ─────────────────────────────────────────────────────────
//
// Wraps useAuthStore with derived state so components don't need to
// import and call the store directly.
//
// Usage:
//   const { user, isAuthenticated, login, isLoading, error } = useAuth();

export function useAuth() {
  const store = useAuthStore();

  const now = Date.now(); // eslint-disable-line react-hooks/purity -- expiry check is inherently time-dependent; no meaningful pure equivalent, and state+interval adds real complexity for zero behavioral benefit

  const isAuthenticated =
    store.user !== null && store.tokens !== null && store.tokens.expires_at > now;

  const needsOnboarding = isAuthenticated && store.user?.is_onboarded === false;

  return {
    user: store.user,
    tokens: store.tokens,
    isLoading: store.isLoading,
    error: store.error,
    isAuthenticated,
    needsOnboarding,
    login: store.login,
    signup: store.signup,
    logout: store.logout,
    clearError: store.clearError,
    setUser: store.setUser,
  };
}
