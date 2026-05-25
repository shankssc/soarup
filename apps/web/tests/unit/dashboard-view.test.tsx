// apps/web/tests/unit/dashboard-view.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardView } from '@/components/domain/dashboard/dashboard-view';
import type { DashboardViewProps } from '@/components/domain/dashboard/dashboard-view';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock('date-fns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('date-fns')>();
  return {
    ...actual,
    formatDistanceToNow: () => '5 minutes ago',
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_UPDATE = {
  id: 'update-abc',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content: 'Finished the API integration and started on dashboard layout.',
  mode: 'text',
  status: 'pending',
  summary: null,
  update_date: '2026-05-18',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const defaultProps: DashboardViewProps = {
  updates: [],
  isLoading: false,
  hasSubmittedToday: false,
  showForm: false,
  currentUserId: 'user-123',
  todayLabel: 'Monday, May 18',
  onSubmitClick: vi.fn(),
  onFormSubmit: vi.fn().mockResolvedValue(undefined),
  onFormCancel: vi.fn(),
  onEdit: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  isSubmitting: false,
};

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Date header ──────────────────────────────────────────────────────────────

describe('DashboardView — date header', () => {
  it('renders the today label in the date header', () => {
    render(<DashboardView {...defaultProps} />);
    expect(screen.getByText(/Monday, May 18/i)).toBeInTheDocument();
  });

  it('includes "Today" prefix in the date header', () => {
    render(<DashboardView {...defaultProps} />);
    expect(
      screen.getByRole('heading', { name: /today/i, level: 2 }),
    ).toBeInTheDocument();
  });
});

// ─── Submission area — EmptyState ─────────────────────────────────────────────

describe('DashboardView — empty state', () => {
  it('shows EmptyState when hasSubmittedToday is false and showForm is false', () => {
    render(
      <DashboardView {...defaultProps} hasSubmittedToday={false} showForm={false} />,
    );
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit update/i })).toBeInTheDocument();
  });

  it('does not show EmptyState when hasSubmittedToday is true', () => {
    render(
      <DashboardView {...defaultProps} hasSubmittedToday={true} showForm={false} />,
    );
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('does not show EmptyState when showForm is true', () => {
    render(
      <DashboardView {...defaultProps} hasSubmittedToday={false} showForm={true} />,
    );
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('fires onSubmitClick when EmptyState CTA is clicked', async () => {
    const onSubmitClick = vi.fn();
    const { getByRole } = render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        onSubmitClick={onSubmitClick}
      />,
    );
    getByRole('button', { name: /submit update/i }).click();
    expect(onSubmitClick).toHaveBeenCalledOnce();
  });
});

// ─── Submission area — UpdateForm ─────────────────────────────────────────────

describe('DashboardView — update form', () => {
  it('shows UpdateForm when hasSubmittedToday is false and showForm is true', () => {
    render(
      <DashboardView {...defaultProps} hasSubmittedToday={false} showForm={true} />,
    );
    expect(screen.getByPlaceholderText(/I finished/i)).toBeInTheDocument();
  });

  it('does not show UpdateForm when hasSubmittedToday is true', () => {
    render(
      <DashboardView {...defaultProps} hasSubmittedToday={true} showForm={true} />,
    );
    expect(screen.queryByPlaceholderText(/I finished/i)).not.toBeInTheDocument();
  });

  it('passes isSubmitting prop to UpdateForm', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={true}
        isSubmitting={true}
      />,
    );
    // When isSubmitting, cancel button is disabled
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('passes onFormCancel to UpdateForm cancel button', async () => {
    const onFormCancel = vi.fn();
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={true}
        onFormCancel={onFormCancel}
      />,
    );
    screen.getByRole('button', { name: /cancel/i }).click();
    expect(onFormCancel).toHaveBeenCalledOnce();
  });
});

// ─── Submission area — hasSubmittedToday hides both ───────────────────────────

describe('DashboardView — hasSubmittedToday', () => {
  it('hides both EmptyState and UpdateForm when hasSubmittedToday is true', () => {
    render(
      <DashboardView {...defaultProps} hasSubmittedToday={true} showForm={true} />,
    );
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/I finished/i)).not.toBeInTheDocument();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('DashboardView — loading state', () => {
  it('renders skeleton placeholders when isLoading is true', () => {
    const { container } = render(<DashboardView {...defaultProps} isLoading={true} />);
    // Two skeleton divs with animate-pulse class
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons).toHaveLength(2);
  });

  it('does not render update cards while loading', () => {
    render(
      <DashboardView {...defaultProps} isLoading={true} updates={[MOCK_UPDATE]} />,
    );
    expect(screen.queryByText(MOCK_UPDATE.content)).not.toBeInTheDocument();
  });
});

// ─── Updates list ─────────────────────────────────────────────────────────────

describe('DashboardView — updates list', () => {
  it('renders update cards when updates are present and not loading', () => {
    render(
      <DashboardView {...defaultProps} isLoading={false} updates={[MOCK_UPDATE]} />,
    );
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
  });

  it('renders multiple update cards', () => {
    const secondUpdate = {
      ...MOCK_UPDATE,
      id: 'update-xyz',
      content: 'Reviewed the PR and left comments.',
    };
    render(
      <DashboardView
        {...defaultProps}
        isLoading={false}
        updates={[MOCK_UPDATE, secondUpdate]}
      />,
    );
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
    expect(screen.getByText(secondUpdate.content)).toBeInTheDocument();
  });

  it('renders nothing in the updates area when updates is empty and not loading', () => {
    const { container } = render(
      <DashboardView {...defaultProps} isLoading={false} updates={[]} />,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(screen.queryByText(MOCK_UPDATE.content)).not.toBeInTheDocument();
  });

  it('passes currentUserId to UpdateCard', () => {
    render(
      <DashboardView
        {...defaultProps}
        isLoading={false}
        updates={[MOCK_UPDATE]}
        currentUserId="user-123"
      />,
    );
    // owner matches → three-dot menu visible
    expect(screen.getByRole('button', { name: /update options/i })).toBeInTheDocument();
  });

  it('hides three-dot menu for other user updates', () => {
    render(
      <DashboardView
        {...defaultProps}
        isLoading={false}
        updates={[MOCK_UPDATE]}
        currentUserId="user-999"
      />,
    );
    expect(
      screen.queryByRole('button', { name: /update options/i }),
    ).not.toBeInTheDocument();
  });
});

// ─── Combined states ──────────────────────────────────────────────────────────

describe('DashboardView — combined states', () => {
  it('can show EmptyState and update cards simultaneously', () => {
    // User has not submitted today (showForm=false) but has past updates
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        updates={[MOCK_UPDATE]}
        isLoading={false}
      />,
    );
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
  });

  it('can show UpdateForm and update cards simultaneously', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={true}
        updates={[MOCK_UPDATE]}
        isLoading={false}
      />,
    );
    expect(screen.getByPlaceholderText(/I finished/i)).toBeInTheDocument();
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
  });
});
