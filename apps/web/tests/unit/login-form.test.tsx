// apps/web/tests/unit/login-form.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/domain/auth/login-form';
import { useAuthStore } from '@/hooks/useAuth';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// OAuthButtons has its own network calls and is not under test here
vi.mock('@/components/domain/auth/oauth-buttons', () => ({
  OAuthButtons: () => <div data-testid="oauth-buttons" />,
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

// Without this, login() → syncSupabaseSession() in useAuth.ts creates a REAL
// Supabase client and polls document.cookie for up to 12 seconds waiting for
// a session cookie that will never appear in jsdom. That's why the three
// submission tests below were failing — not because redirect/onSuccess logic
// is broken, but because login() never resolved in time for isLoading to
// flip back to false. See the matching fix in useAuth.test.ts for the fuller
// explanation.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      setSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-123',
  email: 'test@soarup.app',
  full_name: 'Test User',
  avatar_url: null,
  email_verified: true,
  is_onboarded: false,
  created_at: '2024-01-01T00:00:00Z',
};

function mockLoginSuccess(isOnboarded = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'access-abc',
          refresh_token: 'refresh-xyz',
          expires_in: 3600,
          user: { ...mockUser, is_onboarded: isOnboarded },
        }),
    }),
  );
}

function mockLoginError(errorCode: string, status = 401) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: errorCode, message: 'error' }),
    }),
  );
}

// Seeds a cookie matching hasSupabaseSessionCookie()'s regex in useAuth.ts
// (sb-<ref>-auth-token=...) so waitForSupabaseSessionCookie() resolves on
// its first synchronous check instead of polling for real.
function seedSupabaseSessionCookie() {
  document.cookie = 'sb-test-project-ref-auth-token=fake-session-value; path=/';
}

function clearSupabaseSessionCookie() {
  document.cookie =
    'sb-test-project-ref-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

const user = userEvent.setup();

async function fillAndSubmit(email = 'test@soarup.app', password = 'Password1') {
  // pragma: allowlist secret
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

// ─── Reset store between tests ────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    tokens: null,
    isLoading: false,
    error: null,
  });
  mockPush.mockClear();
  seedSupabaseSessionCookie();

  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearSupabaseSessionCookie();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('LoginForm — rendering', () => {
  it('renders email and password inputs', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it('renders the sign in submit button', () => {
    render(<LoginForm />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders OAuth buttons', () => {
    render(<LoginForm />);
    expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument();
  });

  it('renders forgot password link', () => {
    render(<LoginForm />);
    expect(
      screen.getByRole('button', { name: /forgot password/i }),
    ).toBeInTheDocument();
  });

  it('renders sign up navigation link', () => {
    render(<LoginForm />);
    expect(screen.getByRole('button', { name: /new to soarup/i })).toBeInTheDocument();
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('LoginForm — validation', () => {
  it('shows email required error on empty submit', async () => {
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
  });

  it('shows invalid email error on bad format', async () => {
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'notanemail');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(
      await screen.findByText('Please enter a valid email address.'),
    ).toBeInTheDocument();
  });

  it('shows password required error on empty submit', async () => {
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Password is required.')).toBeInTheDocument();
  });

  it('does not call login when form is invalid', async () => {
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await screen.findByText('Email is required.');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── Submission ───────────────────────────────────────────────────────────────

describe('LoginForm — submission', () => {
  it('redirects to /onboarding when is_onboarded is false', async () => {
    mockLoginSuccess(false);
    render(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding'));
  });

  it('redirects to /dashboard when is_onboarded is true', async () => {
    mockLoginSuccess(true);
    render(<LoginForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('calls onSuccess prop instead of redirecting when provided', async () => {
    mockLoginSuccess();
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);
    await fillAndSubmit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('disables submit button while loading', async () => {
    // Never resolves — keeps isLoading true
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.type(screen.getByLabelText(/^password$/i), 'Password1');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });
});

// ─── API errors ───────────────────────────────────────────────────────────────

describe('LoginForm — API errors', () => {
  it('shows friendly error for authentication_failed', async () => {
    mockLoginError('authentication_failed', 401);
    render(<LoginForm />);
    await fillAndSubmit();
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('shows friendly error for service_unavailable', async () => {
    mockLoginError('service_unavailable', 503);
    render(<LoginForm />);
    await fillAndSubmit();
    expect(
      await screen.findByText(
        'Service temporarily unavailable. Please try again shortly.',
      ),
    ).toBeInTheDocument();
  });

  it('does not redirect on API error', async () => {
    mockLoginError('authentication_failed', 401);
    render(<LoginForm />);
    await fillAndSubmit();
    await screen.findByText('Incorrect email or password.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears API error when user types in email field', async () => {
    mockLoginError('authentication_failed', 401);
    render(<LoginForm />);
    await fillAndSubmit();
    await screen.findByText('Incorrect email or password.');

    // Now type in the email field — error should clear
    mockLoginSuccess(); // prevent re-trigger error on next fetch
    await user.type(screen.getByLabelText(/email/i), 'a');
    await waitFor(() =>
      expect(
        screen.queryByText('Incorrect email or password.'),
      ).not.toBeInTheDocument(),
    );
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('LoginForm — navigation', () => {
  it('navigates to /forgot-password when forgot password is clicked', async () => {
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');
  });

  it('navigates to /signup when sign up link is clicked', async () => {
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /new to soarup/i }));
    expect(mockPush).toHaveBeenCalledWith('/signup');
  });
});
