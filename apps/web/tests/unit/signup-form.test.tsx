// apps/web/tests/unit/signup-form.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from '@/components/domain/auth/signup-form';
import { useAuthStore } from '@/hooks/useAuth';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/components/domain/auth/oauth-buttons', () => ({
  OAuthButtons: () => <div data-testid="oauth-buttons" />,
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/signup',
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-456',
  email: 'new@soarup.app',
  full_name: 'New User',
  avatar_url: null,
  email_verified: false,
  is_onboarded: false,
  created_at: '2024-01-01T00:00:00Z',
};

function mockSignupSuccess() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          expires_in: 3600,
          user: mockUser,
        }),
    }),
  );
}

function mockSignupError(errorCode: string, status = 400) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: errorCode, message: 'error' }),
    }),
  );
}

const user = userEvent.setup();

async function fillForm({
  fullName = '',
  email = 'new@soarup.app',
  password = 'Password1', // pragma: allowlist secret
  confirmPassword = 'Password1', // pragma: allowlist secret
} = {}) {
  if (fullName) {
    await user.type(screen.getByLabelText(/full name/i), fullName);
  }
  await user.type(screen.getByLabelText(/^email$/i), email);
  await user.type(screen.getByLabelText(/^password$/i), password);
  await user.type(screen.getByLabelText(/confirm password/i), confirmPassword);
}

async function fillAndSubmit(overrides = {}) {
  await fillForm(overrides);
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    tokens: null,
    isLoading: false,
    error: null,
  });
  mockPush.mockClear();

  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('SignupForm — rendering', () => {
  it('renders all four fields', () => {
    render(<SignupForm />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('renders the create account submit button', () => {
    render(<SignupForm />);
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders OAuth buttons', () => {
    render(<SignupForm />);
    expect(screen.getByTestId('oauth-buttons')).toBeInTheDocument();
  });

  it('renders sign in navigation link', () => {
    render(<SignupForm />);
    expect(
      screen.getByRole('button', { name: /already have an account/i }),
    ).toBeInTheDocument();
  });
});

// ─── Validation ───────────────────────────────────────────────────────────────

describe('SignupForm — validation', () => {
  it('shows email required error on empty submit', async () => {
    render(<SignupForm />);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
  });

  it('shows invalid email format error', async () => {
    render(<SignupForm />);
    await user.type(screen.getByLabelText(/^email$/i), 'bademail');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(
      await screen.findByText('Please enter a valid email address.'),
    ).toBeInTheDocument();
  });

  it('shows password too short error', async () => {
    render(<SignupForm />);
    await user.type(screen.getByLabelText(/^email$/i), 'new@soarup.app');
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(
      await screen.findByText('Password must be at least 8 characters.'),
    ).toBeInTheDocument();
  });

  it('shows missing uppercase error', async () => {
    render(<SignupForm />);
    await user.type(screen.getByLabelText(/^email$/i), 'new@soarup.app');
    await user.type(screen.getByLabelText(/^password$/i), 'password1');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(
      await screen.findByText('Password must contain at least one uppercase letter.'),
    ).toBeInTheDocument();
  });

  it('shows missing digit error', async () => {
    render(<SignupForm />);
    await user.type(screen.getByLabelText(/^email$/i), 'new@soarup.app');
    await user.type(screen.getByLabelText(/^password$/i), 'Passwordonly');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(
      await screen.findByText('Password must contain at least one digit.'),
    ).toBeInTheDocument();
  });

  it('shows passwords do not match error', async () => {
    render(<SignupForm />);
    await fillForm({ password: 'Password1', confirmPassword: 'Different1' }); // pragma: allowlist secret
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('does not call signup when form is invalid', async () => {
    render(<SignupForm />);
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText('Email is required.');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── Submission ───────────────────────────────────────────────────────────────

describe('SignupForm — submission', () => {
  it('redirects to /onboarding on success', async () => {
    mockSignupSuccess();
    render(<SignupForm />);
    await fillAndSubmit();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding'));
  });

  it('calls onSuccess prop instead of redirecting when provided', async () => {
    mockSignupSuccess();
    const onSuccess = vi.fn();
    render(<SignupForm onSuccess={onSuccess} />);
    await fillAndSubmit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not send confirm_password to the API', async () => {
    mockSignupSuccess();
    render(<SignupForm />);
    await fillAndSubmit({ fullName: 'Test User' });

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).not.toHaveProperty('confirm_password');
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('password');
  });

  it('does not send full_name when it is empty', async () => {
    mockSignupSuccess();
    render(<SignupForm />);
    await fillAndSubmit(); // no fullName

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).not.toHaveProperty('full_name');
  });

  it('disables submit button while loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    render(<SignupForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });
});

// ─── API errors ───────────────────────────────────────────────────────────────

describe('SignupForm — API errors', () => {
  it('shows friendly error for user_already_exists', async () => {
    mockSignupError('user_already_exists', 409);
    render(<SignupForm />);
    await fillAndSubmit();
    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  });

  it('shows friendly error for registration_failed', async () => {
    mockSignupError('registration_failed', 400);
    render(<SignupForm />);
    await fillAndSubmit();
    expect(
      await screen.findByText('Could not create your account. Please try again.'),
    ).toBeInTheDocument();
  });

  it('does not redirect on API error', async () => {
    mockPush.mockClear();
    mockSignupError('user_already_exists', 409);
    render(<SignupForm />);
    await fillAndSubmit();
    await screen.findByText('An account with this email already exists.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears API error when user types in a field', async () => {
    mockSignupError('user_already_exists', 409);
    render(<SignupForm />);
    await fillAndSubmit();
    await screen.findByText('An account with this email already exists.');

    mockSignupSuccess();
    await user.type(screen.getByLabelText(/^email$/i), 'a');
    await waitFor(() =>
      expect(
        screen.queryByText('An account with this email already exists.'),
      ).not.toBeInTheDocument(),
    );
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe('SignupForm — navigation', () => {
  it('navigates to /login when sign in link is clicked', async () => {
    render(<SignupForm />);
    await user.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
