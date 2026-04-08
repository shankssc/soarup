// apps/web/hooks/useAuth.ts

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
  email_notifications: boolean;
  onboarded_at: string | null;
  created_at: string;
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
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: (user: UserProfile) => void;
}

// ─── API client helpers ───────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Maps FastAPI error codes to user-facing messages
const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials:    "Incorrect email or password.",
  email_not_verified:     "Please verify your email before signing in.",
  account_disabled:       "This account has been disabled. Contact support.",
  email_already_exists:   "An account with this email already exists.",
  weak_password:          "Password must be at least 8 characters.", // pragma: allowlist secret
  internal_error:         "Something went wrong. Please try again.",
  network_error:          "Unable to connect. Check your internet connection.",
};

function friendlyError(code: string): string {
  return ERROR_MESSAGES[code] ?? "An unexpected error occurred.";
}

async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  accessToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(friendlyError("network_error"));
  }

  if (!res.ok) {
    let envelope: ApiErrorEnvelope;
    try {
      envelope = await res.json();
    } catch {
      throw new Error(friendlyError("internal_error"));
    }
    const code = envelope?.error?.code ?? "internal_error";
    throw new Error(friendlyError(code));
  }

  return res.json() as Promise<T>;
}

// ─── Login / signup response shape (matches FastAPI LoginResponse schema) ──────

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  user: UserProfile;
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
          const data = await apiPost<LoginResponse>("/auth/login", {
            email,
            password,
          });

          set({
            user: data.user,
            tokens: {
              access_token:  data.access_token,
              refresh_token: data.refresh_token,
              expires_at:    Date.now() + data.expires_in * 1000,
            },
            isLoading: false,
            error: null,
          });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : friendlyError("internal_error"),
          });
          throw err; // re-throw so form can catch it too if needed
        }
      },

      signup: async (email, password, fullName) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiPost<LoginResponse>("/auth/signup", {
            email,
            password,
            ...(fullName ? { full_name: fullName } : {}),
          });

          set({
            user: data.user,
            tokens: {
              access_token:  data.access_token,
              refresh_token: data.refresh_token,
              expires_at:    Date.now() + data.expires_in * 1000,
            },
            isLoading: false,
            error: null,
          });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : friendlyError("internal_error"),
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
              method: "POST",
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
          } catch {
            // Swallow — local state is cleared regardless
          }
        }

        set({ user: null, tokens: null, isLoading: false, error: null });
      },

      clearError: () => set({ error: null }),

      setUser: (user) => set({ user }),
    }),
    {
      name: "soarup-auth",
      // Only persist user + tokens, not loading/error state
      partialize: (state) => ({
        user:   state.user,
        tokens: state.tokens,
      }),
    }
  )
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

  const isAuthenticated =
    store.user !== null &&
    store.tokens !== null &&
    store.tokens.expires_at > Date.now();

  const needsOnboarding =
    isAuthenticated && store.user?.onboarded_at === null;

  return {
    user:             store.user,
    tokens:           store.tokens,
    isLoading:        store.isLoading,
    error:            store.error,
    isAuthenticated,
    needsOnboarding,
    login:            store.login,
    signup:           store.signup,
    logout:           store.logout,
    clearError:       store.clearError,
    setUser:          store.setUser,
  };
}
