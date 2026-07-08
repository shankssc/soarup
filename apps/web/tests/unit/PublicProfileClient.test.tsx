// apps/web/tests/unit/PublicProfileClient.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { PublicProfileClient } from '@/app/u/[username]/client';
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

// Mock next/image — jsdom doesn't support image optimization
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement('img', { src, alt }),
}));

// Mock Heatmap — not under test here
vi.mock('@/components/ui/heatmap', () => ({
  Heatmap: () => createElement('div', { 'data-testid': 'heatmap' }),
}));

// Mock Toast — not under test here
vi.mock('@/components/ui/toast', () => ({
  Toast: ({ message, onDismiss }: { message: string; onDismiss: () => void }) =>
    createElement(
      'div',
      { role: 'status', 'data-testid': 'toast' },
      message,
      createElement('button', { onClick: onDismiss }, 'Dismiss'),
    ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_PROFILE_WITH_ACTIVITY = {
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

const MOCK_PROFILE_NO_ACTIVITY = {
  ...MOCK_PROFILE_WITH_ACTIVITY,
  streak: {
    current_streak: 0,
    best_streak: 0,
    total_submissions: 0,
    last_submission_date: null,
  },
};

const MOCK_PROFILE_WITH_AVATAR = {
  ...MOCK_PROFILE_WITH_ACTIVITY,
  avatar_url: 'https://cdn.example.com/avatar.jpg',
};

const MOCK_PROFILE_NO_OPTIONAL_FIELDS = {
  ...MOCK_PROFILE_WITH_ACTIVITY,
  bio: null,
  tagline: null,
  full_name: null,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PublicProfileClient', () => {
  it('shows skeleton while loading', () => {
    vi.mocked(apiClient.getPublic).mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PublicProfileClient username="suyash" />
      </QueryClientProvider>,
    );

    // Skeleton uses animate-pulse — no named content visible
    expect(screen.queryByText('suyash')).not.toBeInTheDocument();
    const pulsingElements = document.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });

  it('renders hero with display name and username', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Suyash Chaudhary')).toBeInTheDocument();
    });
    expect(screen.getByText('@suyash')).toBeInTheDocument();
  });

  it('renders bio when present', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Building in public')).toBeInTheDocument();
    });
  });

  it('renders tagline pill when present', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Fullstack · Open source')).toBeInTheDocument();
    });
  });

  it('does not render bio when absent', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_NO_OPTIONAL_FIELDS);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('@suyash')).toBeInTheDocument();
    });
    expect(screen.queryByText('Building in public')).not.toBeInTheDocument();
  });

  it('renders initials fallback when no avatar', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      // First letter of full_name
      expect(screen.getByText('S')).toBeInTheDocument();
    });
  });

  it('renders avatar image when avatar_url is set', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_AVATAR);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      const img = screen.getByRole('img', { name: 'Suyash Chaudhary' });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://cdn.example.com/avatar.jpg');
    });
  });

  it('renders streak stats', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // current streak
      expect(screen.getByText('10')).toBeInTheDocument(); // best streak
      expect(screen.getByText('42')).toBeInTheDocument(); // total submissions
    });
  });

  it('renders heatmap component', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('heatmap')).toBeInTheDocument();
    });
  });

  it('shows empty state toast when total_submissions is zero', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_NO_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('toast')).toBeInTheDocument();
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });

  it('does not show toast when total_submissions is greater than zero', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Suyash Chaudhary')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });

  it('shows 404 state when isError is true', async () => {
    vi.mocked(apiClient.getPublic).mockRejectedValue(new Error('Not found'));

    render(<PublicProfileClient username="notfound" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Profile not found')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/profile doesn.t exist or hasn.t been made public/i),
    ).toBeInTheDocument();
  });

  it('falls back to username initial when full_name is null', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_NO_OPTIONAL_FIELDS);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      // Falls back to first letter of username
      expect(screen.getByText('S')).toBeInTheDocument();
    });
  });

  it('renders sign up CTA link', async () => {
    vi.mocked(apiClient.getPublic).mockResolvedValue(MOCK_PROFILE_WITH_ACTIVITY);

    render(<PublicProfileClient username="suyash" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/sign up to soarup/i)).toBeInTheDocument();
    });
  });
});
