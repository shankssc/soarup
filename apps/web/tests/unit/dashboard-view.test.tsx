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

// VoiceRecorder uses MediaRecorder and getUserMedia — stub them so it
// doesn't crash when rendered in tests that show the voice recorder
vi.mock('@/components/domain/updates/voice-recorder', () => ({
  VoiceRecorder: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="voice-recorder">
      <button onClick={onCancel}>Cancel voice</button>
    </div>
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_UPDATE = {
  id: 'update-abc',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content: 'Finished the API integration and started on dashboard layout.',
  mode: 'text',
  status: 'pending',
  summary: null,
  transcript: null,
  audio_duration_seconds: null,
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
  showVoiceRecorder: false,
  currentUserId: 'user-123',
  workspaceId: 'workspace-123',
  todayLabel: 'Monday, May 18',
  today: '2026-05-18',
  onSubmitClick: vi.fn(),
  onVoiceClick: vi.fn(),
  onFormSubmit: vi.fn().mockResolvedValue(undefined),
  onFormCancel: vi.fn(),
  onVoiceSuccess: vi.fn().mockResolvedValue(undefined),
  onVoiceCancel: vi.fn(),
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

// ─── Submission area — mode toggle ────────────────────────────────────────────

describe('DashboardView — mode toggle', () => {
  it('shows submit update and voice note buttons when not submitted and no form open', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        showVoiceRecorder={false}
      />,
    );
    expect(screen.getByRole('button', { name: /submit update/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /voice note/i })).toBeInTheDocument();
  });

  it('hides mode toggle when hasSubmittedToday is true', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={true}
        showForm={false}
        showVoiceRecorder={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /submit update/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /voice note/i }),
    ).not.toBeInTheDocument();
  });

  it('hides mode toggle when showForm is true', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={true}
        showVoiceRecorder={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /voice note/i }),
    ).not.toBeInTheDocument();
  });

  it('hides mode toggle when showVoiceRecorder is true', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        showVoiceRecorder={true}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /voice note/i }),
    ).not.toBeInTheDocument();
  });

  it('submit update button fires onSubmitClick', () => {
    const onSubmitClick = vi.fn();
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        showVoiceRecorder={false}
        onSubmitClick={onSubmitClick}
      />,
    );
    screen.getByRole('button', { name: /submit update/i }).click();
    expect(onSubmitClick).toHaveBeenCalledOnce();
  });

  it('voice note button fires onVoiceClick', () => {
    const onVoiceClick = vi.fn();
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        showVoiceRecorder={false}
        onVoiceClick={onVoiceClick}
      />,
    );
    screen.getByRole('button', { name: /voice note/i }).click();
    expect(onVoiceClick).toHaveBeenCalledOnce();
  });
});

// ─── Submission area — UpdateForm ─────────────────────────────────────────────

describe('DashboardView — update form', () => {
  it('shows UpdateForm when showForm is true and not submitted', () => {
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

  it('passes isSubmitting to UpdateForm — disables cancel when true', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={true}
        isSubmitting={true}
      />,
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('passes onFormCancel to UpdateForm cancel button', () => {
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

// ─── Submission area — VoiceRecorder ──────────────────────────────────────────

describe('DashboardView — voice recorder', () => {
  it('shows VoiceRecorder when showVoiceRecorder is true and not submitted', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showVoiceRecorder={true}
      />,
    );
    expect(screen.getByTestId('voice-recorder')).toBeInTheDocument();
  });

  it('does not show VoiceRecorder when hasSubmittedToday is true', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={true}
        showVoiceRecorder={true}
      />,
    );
    expect(screen.queryByTestId('voice-recorder')).not.toBeInTheDocument();
  });

  it('does not show VoiceRecorder when showVoiceRecorder is false', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showVoiceRecorder={false}
      />,
    );
    expect(screen.queryByTestId('voice-recorder')).not.toBeInTheDocument();
  });
});

// ─── hasSubmittedToday hides submission area entirely ─────────────────────────

describe('DashboardView — hasSubmittedToday', () => {
  it('hides all submission UI when hasSubmittedToday is true', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={true}
        showForm={true}
        showVoiceRecorder={true}
      />,
    );
    expect(screen.queryByPlaceholderText(/I finished/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('voice-recorder')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /submit update/i }),
    ).not.toBeInTheDocument();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('DashboardView — loading state', () => {
  it('renders two skeleton placeholders when isLoading is true', () => {
    const { container } = render(<DashboardView {...defaultProps} isLoading={true} />);
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

  it('renders nothing in the updates area when updates is empty', () => {
    const { container } = render(
      <DashboardView {...defaultProps} isLoading={false} updates={[]} />,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(screen.queryByText(MOCK_UPDATE.content)).not.toBeInTheDocument();
  });

  it('shows three-dot menu for own updates', () => {
    render(
      <DashboardView
        {...defaultProps}
        isLoading={false}
        updates={[MOCK_UPDATE]}
        currentUserId="user-123"
      />,
    );
    expect(screen.getByRole('button', { name: /update options/i })).toBeInTheDocument();
  });

  it('hides three-dot menu for other users updates', () => {
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
  it('shows mode toggle and update cards simultaneously', () => {
    render(
      <DashboardView
        {...defaultProps}
        hasSubmittedToday={false}
        showForm={false}
        showVoiceRecorder={false}
        updates={[MOCK_UPDATE]}
        isLoading={false}
      />,
    );
    expect(screen.getByRole('button', { name: /submit update/i })).toBeInTheDocument();
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
  });

  it('shows UpdateForm and update cards simultaneously', () => {
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
