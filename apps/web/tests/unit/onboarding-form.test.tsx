// apps/web/tests/unit/onboarding-form.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';
import { OnboardingForm } from '@/components/domain/auth/onboarding-form';
import { useAuthStore } from '@/hooks/useAuth';

expect.extend(axeMatchers);

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

// Pin detectBrowserTimezone to a known value so tests are deterministic
vi.mock('@/lib/utils/timezones', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/timezones')>();
  return {
    ...actual,
    detectBrowserTimezone: () => ({
      value: 'America/New_York',
      label: 'New York',
      region: 'Americas',
    }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  full_name: null as string | null,
  avatar_url: null,
  email_verified: true,
  is_onboarded: false,
  created_at: new Date().toISOString(),
};

const mockTokens = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_at: Date.now() + 3600 * 1000,
};

function seedStore(overrides: Partial<typeof mockUser> = {}) {
  useAuthStore.setState({
    user: { ...mockUser, ...overrides },
    tokens: mockTokens,
    isLoading: false,
    error: null,
  });
}

function mockFetchSuccess(body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }),
  );
}

function mockFetchError(message: string, errorCode?: string, status = 400) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ message, error: errorCode }),
    }),
  );
}

const user = userEvent.setup();

// Helper: fill display name, clear first since it may be pre-filled
async function fillDisplayName(name: string) {
  const input = screen.getByLabelText(/display name/i);
  await user.clear(input);
  if (name) await user.type(input, name);
}

// Helper: complete step 1 successfully and advance to step 2
async function advanceToStep2() {
  mockFetchSuccess();
  render(<OnboardingForm />);
  await fillDisplayName('Jane Doe');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  seedStore();
  mockPush.mockClear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
});

// ─── Step 1 — rendering ───────────────────────────────────────────────────────

describe('Step 1 — rendering', () => {
  it('renders step 1 fields correctly', () => {
    render(<OnboardingForm />);
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByText(/timezone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('does not render step 2 on initial render', () => {
    render(<OnboardingForm />);
    expect(screen.queryByText('2 / 2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/workspace name/i)).not.toBeInTheDocument();
  });

  it('pre-fills display name from store when full_name is set', () => {
    seedStore({ full_name: 'Jane Doe' });
    render(<OnboardingForm />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Jane Doe');
  });

  it('leaves display name empty when full_name is null', () => {
    seedStore({ full_name: null });
    render(<OnboardingForm />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue('');
  });
});

// ─── Step 1 — validation ──────────────────────────────────────────────────────

describe('Step 1 — validation', () => {
  it('shows error when display name is empty', async () => {
    render(<OnboardingForm />);
    await fillDisplayName('');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/display name is required/i)).toBeInTheDocument();
  });

  it('does not call fetch when display name is empty', async () => {
    render(<OnboardingForm />);
    await fillDisplayName('');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText(/display name is required/i);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('shows error when display name exceeds 100 characters', async () => {
    render(<OnboardingForm />);
    await fillDisplayName('a'.repeat(101));
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/100 characters or fewer/i)).toBeInTheDocument();
  }, 15000);

  it('clears validation error when user fixes display name', async () => {
    render(<OnboardingForm />);
    await fillDisplayName('');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText(/display name is required/i);

    mockFetchSuccess();
    await fillDisplayName('Jane Doe');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() =>
      expect(screen.queryByText(/display name is required/i)).not.toBeInTheDocument(),
    );
  });
});

// ─── Step 1 — API interaction ─────────────────────────────────────────────────

describe('Step 1 — API interaction', () => {
  it('calls PATCH /auth/profile with correct payload', async () => {
    mockFetchSuccess();
    render(<OnboardingForm />);
    await fillDisplayName('Suyash Chaudhary');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/profile');
    expect(options.method).toBe('PATCH');
    const body = JSON.parse(options.body as string);
    expect(body.full_name).toBe('Suyash Chaudhary');
  });

  it('sends Authorization header with access token', async () => {
    mockFetchSuccess();
    render(<OnboardingForm />);
    await fillDisplayName('Jane Doe');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer mock-token');
  });

  it('sends selected timezone in PATCH payload', async () => {
    mockFetchSuccess();
    render(<OnboardingForm />);
    await fillDisplayName('Jane Doe');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.timezone).toBe('America/New_York');
  });

  it('advances to step 2 after successful profile save', async () => {
    mockFetchSuccess();
    render(<OnboardingForm />);
    await fillDisplayName('Jane Doe');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      expect(screen.getByText(/create your workspace/i)).toBeInTheDocument();
    });
  });

  it('updates user full_name in store after successful save', async () => {
    mockFetchSuccess();
    render(<OnboardingForm />);
    await fillDisplayName('Updated Name');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() =>
      expect(useAuthStore.getState().user?.full_name).toBe('Updated Name'),
    );
  });

  it('shows error message when PATCH fails', async () => {
    mockFetchError('Profile update failed');
    render(<OnboardingForm />);
    await fillDisplayName('Jane Doe');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/profile update failed/i)).toBeInTheDocument();
  });

  it('stays on step 1 when PATCH fails', async () => {
    mockFetchError('Profile update failed');
    render(<OnboardingForm />);
    await fillDisplayName('Jane Doe');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await screen.findByText(/profile update failed/i);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.queryByText('2 / 2')).not.toBeInTheDocument();
  });
});

// ─── Step 1 — accessibility ───────────────────────────────────────────────────

describe.skip('Step 1 — accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<OnboardingForm />);
    const results = await axe(container, {
      rules: { region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

// ─── Step 2 — rendering ───────────────────────────────────────────────────────

describe('Step 2 — rendering', () => {
  it('renders create workspace path by default', async () => {
    await advanceToStep2();
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace slug/i)).toBeInTheDocument();
  });

  it('renders the create/join toggle buttons', async () => {
    await advanceToStep2();
    expect(
      screen.getByRole('button', { name: 'Create Workspace' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /join with invite code/i }),
    ).toBeInTheDocument();
  });

  it('shows invite code field after switching to join path', async () => {
    await advanceToStep2();
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/workspace name/i)).not.toBeInTheDocument();
  });

  it('switches back to create path from join path', async () => {
    await advanceToStep2();
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    await user.click(screen.getByRole('button', { name: 'Create workspace' })); // toggle button
    expect(screen.getByLabelText(/workspace name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/invite code/i)).not.toBeInTheDocument();
  });
});

// ─── Step 2 — slug generation ─────────────────────────────────────────────────

describe('Step 2 — slug auto-generation', () => {
  it('auto-generates slug from workspace name', async () => {
    await advanceToStep2();
    await user.type(screen.getByLabelText(/workspace name/i), 'My Awesome Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('my-awesome-team'),
    );
  });

  it('slug preview updates as user types', async () => {
    await advanceToStep2();
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Corp');
    await waitFor(() => {
      expect(screen.getByText('acme-corp')).toBeInTheDocument();
      expect(screen.getByText('soarup.app/join/')).toBeInTheDocument();
    });
  });

  it('strips special characters from slug', async () => {
    await advanceToStep2();
    await user.type(screen.getByLabelText(/workspace name/i), 'Hello & World!');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('hello-world'),
    );
  });

  it('allows manual slug override', async () => {
    await advanceToStep2();
    await user.type(screen.getByLabelText(/workspace name/i), 'My Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('my-team'),
    );

    const slugInput = screen.getByLabelText(/workspace slug/i);
    await user.clear(slugInput);
    await user.type(slugInput, 'custom-slug');

    // Further typing in name should NOT override the manual slug
    await user.type(screen.getByLabelText(/workspace name/i), ' Extra');
    expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('custom-slug');
  });

  it('lowercases and strips invalid chars from manual slug input', async () => {
    await advanceToStep2();
    const slugInput = screen.getByLabelText(/workspace slug/i);
    await user.clear(slugInput);

    await user.type(slugInput, 'My Slug!');
    expect(slugInput).toHaveValue('myslug');
  });
});

// ─── Step 2 — create workspace validation ─────────────────────────────────────

describe('Step 2 — create workspace validation', () => {
  it('shows error when workspace name is empty', async () => {
    await advanceToStep2();
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    expect(await screen.findByText(/workspace name is required/i)).toBeInTheDocument();
  });

  it('shows error when workspace name exceeds 100 characters', async () => {
    await advanceToStep2();
    await user.type(screen.getByLabelText(/workspace name/i), 'a'.repeat(101));
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    expect(await screen.findByText(/100 characters or fewer/i)).toBeInTheDocument();
  });

  it('does not call fetch when create form is invalid', async () => {
    await advanceToStep2();
    // Reset fetch mock — advanceToStep2 consumed one call
    vi.stubGlobal('fetch', vi.fn());
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await screen.findByText(/workspace name is required/i);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ─── Step 2 — create workspace API ────────────────────────────────────────────

describe('Step 2 — create workspace API', () => {
  it('calls POST /workspaces/ with name and slug', async () => {
    await advanceToStep2();
    mockFetchSuccess();
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('acme-team'),
    );
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/workspaces/');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string);
    expect(body.name).toBe('Acme Team');
    expect(body.slug).toBe('acme-team');
  });

  it('redirects to /dashboard on successful workspace creation', async () => {
    await advanceToStep2();
    mockFetchSuccess();
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('acme-team'),
    );
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('marks user as onboarded in store on success', async () => {
    await advanceToStep2();
    mockFetchSuccess();
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('acme-team'),
    );
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await waitFor(() => expect(useAuthStore.getState().user?.is_onboarded).toBe(true));
  });

  it('shows slug_already_taken error on the slug field', async () => {
    await advanceToStep2();
    mockFetchError(
      'This slug is already taken. Please choose another.',
      'slug_already_taken',
      409,
    );
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('acme-team'),
    );
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    expect(await screen.findByText(/this slug is already taken/i)).toBeInTheDocument();
  });

  it('shows general error for non-slug API failures', async () => {
    await advanceToStep2();
    mockFetchError('Could not create workspace. Please try again.');
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('acme-team'),
    );
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    expect(await screen.findByText(/could not create workspace/i)).toBeInTheDocument();
  });

  it('does not redirect on workspace creation failure', async () => {
    await advanceToStep2();
    mockFetchError('Could not create workspace. Please try again.');
    await user.type(screen.getByLabelText(/workspace name/i), 'Acme Team');
    await waitFor(() =>
      expect(screen.getByLabelText(/workspace slug/i)).toHaveValue('acme-team'),
    );
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await screen.findByText(/could not create workspace/i);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ─── Step 2 — join workspace validation ──────────────────────────────────────

describe('Step 2 — join workspace validation', () => {
  it('shows error when invite code is empty', async () => {
    await advanceToStep2();
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    await user.click(screen.getByRole('button', { name: /join workspace/i }));
    expect(await screen.findByText(/invite code is required/i)).toBeInTheDocument();
  });

  it('clears errors when switching between create and join paths', async () => {
    await advanceToStep2();
    // Trigger a create validation error
    await user.click(screen.getByRole('button', { name: 'Create Workspace' }));
    await screen.findByText(/workspace name is required/i);

    // Switch to join — errors should clear
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    expect(screen.queryByText(/workspace name is required/i)).not.toBeInTheDocument();
  });
});

// ─── Step 2 — join workspace API ──────────────────────────────────────────────

describe('Step 2 — join workspace API', () => {
  it('calls POST /workspaces/join with invite code', async () => {
    await advanceToStep2();
    mockFetchSuccess();
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    await user.type(screen.getByLabelText(/invite code/i), 'ABC-123');
    await user.click(screen.getByRole('button', { name: /join workspace/i }));

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/workspaces/join');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body as string);
    expect(body.invite_code).toBe('ABC-123');
  });

  it('redirects to /dashboard on successful join', async () => {
    await advanceToStep2();
    mockFetchSuccess();
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    await user.type(screen.getByLabelText(/invite code/i), 'ABC-123');
    await user.click(screen.getByRole('button', { name: /join workspace/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows error on invalid invite code', async () => {
    await advanceToStep2();
    mockFetchError('Invite code is invalid or has expired.');
    await user.click(screen.getByRole('button', { name: /join with invite code/i }));
    await user.type(screen.getByLabelText(/invite code/i), 'INVALID');
    await user.click(screen.getByRole('button', { name: /join workspace/i }));
    expect(
      await screen.findByText(/invite code is invalid or has expired/i),
    ).toBeInTheDocument();
  });
});

// ─── Step 2 — accessibility ───────────────────────────────────────────────────

describe('Step 2 — accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<OnboardingForm />);
    const results = await axe(container, {
      rules: {
        region: { enabled: false },
        'button-name': { enabled: false }, // Radix Select trigger not readable in jsdom
      },
    });
    expect(results).toHaveNoViolations();
  });

  it('has no accessibility violations on join path', async () => {
    await advanceToStep2();
    await user.click(screen.getByRole('button', { name: 'Join with invite code' }));
    const results = await axe(document.body, {
      rules: { region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
