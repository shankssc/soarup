// apps/web/tests/unit/forgot-password-form.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordForm } from '@/components/domain/auth/forgot-password-form';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/forgot-password',
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockApiSuccess() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          message: 'If that email exists, a reset link has been sent.',
        }),
    }),
  );
}

function mockApiServerError() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    }),
  );
}

// 4xx: backend always 200 for forgot-password, but test defensive handling
function mockApi4xx() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({}),
    }),
  );
}

const user = userEvent.setup();

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockPush.mockClear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('ForgotPasswordForm — rendering', () => {
  it('renders the email field', () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('renders the send reset link button', () => {
    render(<ForgotPasswordForm />);
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it('renders back to sign in link', () => {
    render(<ForgotPasswordForm />);
    expect(
      screen.getByRole('button', { name: /back to sign in/i }),
    ).toBeInTheDocument();
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('ForgotPasswordForm — validation', () => {
  it('shows email required error on empty submit', async () => {
    render(<ForgotPasswordForm />);
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
  });

  it('shows invalid email format error', async () => {
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'bademail');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(
      await screen.findByText('Please enter a valid email address.'),
    ).toBeInTheDocument();
  });

  it('does not call fetch when form is invalid', async () => {
    render(<ForgotPasswordForm />);
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByText('Email is required.');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── Success state ────────────────────────────────────────────────────────────

describe('ForgotPasswordForm — success state', () => {
  it('shows success message after submission', async () => {
    mockApiSuccess();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });

  it('shows the submitted email in the success message', async () => {
    mockApiSuccess();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText('test@soarup.app')).toBeInTheDocument();
  });

  it('hides the form after successful submission', async () => {
    mockApiSuccess();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByText(/check your inbox/i);
    expect(
      screen.queryByRole('button', { name: /send reset link/i }),
    ).not.toBeInTheDocument();
  });

  it('shows back to sign in button in success state', async () => {
    mockApiSuccess();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByText(/check your inbox/i);
    expect(
      screen.getByRole('button', { name: /back to sign in/i }),
    ).toBeInTheDocument();
  });

  it('allows trying again from success state', async () => {
    mockApiSuccess();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByText(/check your inbox/i);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    // Form should be visible again
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it('navigates to /login from success state', async () => {
    mockApiSuccess();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByText(/check your inbox/i);

    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('ForgotPasswordForm — error state', () => {
  it('shows error message on 500 server error', async () => {
    mockApiServerError();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(
      await screen.findByText('Service temporarily unavailable. Please try again.'),
    ).toBeInTheDocument();
  });

  it('does not show success state on server error', async () => {
    mockApiServerError();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByText('Service temporarily unavailable. Please try again.');
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  it('does not throw on 4xx — backend always returns 200 for this endpoint', async () => {
    // 4xx should be treated as success (no error thrown) per the backend contract
    mockApi4xx();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    // Success state should still show — 4xx doesn't trigger error
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('ForgotPasswordForm — loading state', () => {
  it('disables submit button while loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText(/email/i), 'test@soarup.app');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeDisabled();
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('ForgotPasswordForm — navigation', () => {
  it('navigates to /login when back to sign in is clicked', async () => {
    render(<ForgotPasswordForm />);
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
