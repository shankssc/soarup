// apps/web/tests/unit/digest-card.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DigestCard } from '@/components/domain/digests/digest-card';
import { apiClient } from '@/lib/api/client';
import {
  MOCK_DIGEST,
  MOCK_DIGEST_PENDING,
  MOCK_DIGEST_PROCESSING,
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const DIGEST_WITH_ITEMS = {
  ...MOCK_DIGEST,
  items: [
    {
      id: 'item-1',
      update_id: 'update-1',
      author_name: 'Alice Owen',
      summary_snapshot: 'Finished the invite flow.',
    },
    {
      id: 'item-2',
      update_id: 'update-2',
      author_name: 'Bob Chen',
      summary_snapshot: 'Fixed the Redis bug.',
    },
  ],
};

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('DigestCard — rendering', () => {
  it('renders the digest date', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('renders the team summary', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(MOCK_DIGEST.summary!)).toBeInTheDocument();
  });

  it('renders the status badge', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('sent')).toBeInTheDocument();
  });

  it('renders update count', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/2 updates/)).toBeInTheDocument();
  });

  it('renders singular update count correctly', () => {
    const singleUpdate = { ...MOCK_DIGEST, update_count: 1 };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={singleUpdate} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(
      screen.getByText((_, element) => element?.textContent?.trim() === '1 update'),
    ).toBeInTheDocument();
  });

  it('shows processing message when status is processing', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST_PROCESSING} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/generating digest/i)).toBeInTheDocument();
  });

  it('shows no summary available when status is pending', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST_PENDING} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/no summary available/i)).toBeInTheDocument();
  });

  it('does not render expand toggle when update_count is 0', () => {
    const noUpdates = { ...MOCK_DIGEST, update_count: 0 };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={noUpdates} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/view updates/i)).not.toBeInTheDocument();
  });

  it('renders expand toggle when update_count > 0', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/view updates/i)).toBeInTheDocument();
  });

  it('renders Slack delivery badge when delivered_to_slack is true', () => {
    const slackDeliveredDigest = {
      ...MOCK_DIGEST,
      delivered_to_slack: true,
      slack_delivered_at: '2026-06-07T09:00:05Z',
    };
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={slackDeliveredDigest} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/slack/i)).toBeInTheDocument();
  });
});

// ─── Lazy load expand ─────────────────────────────────────────────────────────

describe('DigestCard — lazy load expand', () => {
  it('does not call apiClient before expand', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('calls apiClient for detail on first expand', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(DIGEST_WITH_ITEMS);

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText(/view updates/i));

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        `/workspaces/${WORKSPACE_ID}/digests/${MOCK_DIGEST.id}`,
        MOCK_TOKENS.access_token,
      );
    });
  });

  it('shows skeleton while loading items', async () => {
    vi.mocked(apiClient.get).mockReturnValue(new Promise(() => {}));

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText(/view updates/i));

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  it('renders items after detail loads', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(DIGEST_WITH_ITEMS);

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText(/view updates/i));

    await waitFor(() => {
      expect(screen.getByText('Alice Owen')).toBeInTheDocument();
      expect(screen.getByText('Bob Chen')).toBeInTheDocument();
    });
  });

  it('does not fetch again on collapse and re-expand', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(DIGEST_WITH_ITEMS);

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText(/view updates/i));
    await waitFor(() => expect(screen.getByText('Alice Owen')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/hide updates/i));
    fireEvent.click(screen.getByText(/view updates/i));

    // React Query cache — only one API call total
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('shows hide updates text after expand', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(DIGEST_WITH_ITEMS);

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DigestCard digest={MOCK_DIGEST} workspaceId={WORKSPACE_ID} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText(/view updates/i));

    await waitFor(() => {
      expect(screen.getByText(/hide updates/i)).toBeInTheDocument();
    });
  });
});
