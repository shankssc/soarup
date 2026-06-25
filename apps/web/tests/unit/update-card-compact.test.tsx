// apps/web/tests/unit/update-card-compact.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateCardCompact } from '@/components/domain/updates/update-card-compact';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const MOCK_UPDATE = {
  id: 'update-compact-1',
  workspace_id: WORKSPACE_ID,
  user_id: 'user-123',
  content:
    'Finished the history page component. Cursor pagination is working end-to-end.',
  mode: 'text',
  status: 'processed',
  summary: 'They completed the history page component with working cursor pagination.',
  transcript: null,
  audio_duration_seconds: null,
  update_date: '2026-06-23',
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const VOICE_UPDATE = {
  ...MOCK_UPDATE,
  id: 'update-compact-2',
  mode: 'voice',
  content: '',
  audio_duration_seconds: 94,
  summary: 'They reviewed the analytics PR.',
  transcript:
    'Yeah so today I went through the analytics PR and found an edge case in the streak calculation.',
};

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Rendering — collapsed (default) ─────────────────────────────────────────

describe('UpdateCardCompact — collapsed (default)', () => {
  it('renders author name', () => {
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders update date', () => {
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText('2026-06-23')).toBeInTheDocument();
  });

  it('renders content snippet in collapsed state', () => {
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText(/Finished the history page/)).toBeInTheDocument();
  });

  it('does not render summary in collapsed state', () => {
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(
      screen.queryByText(/They completed the history page/),
    ).not.toBeInTheDocument();
  });

  it('renders avatar initial when no avatar_url', () => {
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });

  it('renders avatar image when author_avatar_url is set', () => {
    const update = { ...MOCK_UPDATE, author_avatar_url: 'https://cdn/avatar.jpg' };
    render(<UpdateCardCompact update={update} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByRole('img', { name: 'Jane Doe' })).toBeInTheDocument();
  });
});

// ─── Voice badge ──────────────────────────────────────────────────────────────

describe('UpdateCardCompact — voice badge', () => {
  it('shows voice badge for voice updates', () => {
    render(<UpdateCardCompact update={VOICE_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(screen.getByText('Voice')).toBeInTheDocument();
  });

  it('does not show voice badge for text updates', () => {
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    expect(screen.queryByText('Voice')).not.toBeInTheDocument();
  });
});

// ─── Expand / collapse ────────────────────────────────────────────────────────

describe('UpdateCardCompact — expand / collapse', () => {
  it('expands on click to show full content', async () => {
    const user = userEvent.setup();
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact'));
    expect(screen.getByText(/Finished the history page component/)).toBeInTheDocument();
  });

  it('expands on click to show summary for processed updates', async () => {
    const user = userEvent.setup();
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact'));
    expect(
      screen.getByText(/They completed the history page component/),
    ).toBeInTheDocument();
  });

  it('collapses again on second click', async () => {
    const user = userEvent.setup();
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact')); // expand
    await user.click(screen.getByTestId('update-card-compact')); // collapse
    expect(
      screen.queryByText(/They completed the history page component/),
    ).not.toBeInTheDocument();
  });

  it('does not show summary for pending updates when expanded', async () => {
    const user = userEvent.setup();
    const pendingUpdate = { ...MOCK_UPDATE, status: 'pending', summary: null };
    render(<UpdateCardCompact update={pendingUpdate} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact'));
    expect(screen.queryByText(/They completed/)).not.toBeInTheDocument();
  });
});

// ─── Voice update — transcript ────────────────────────────────────────────────

describe('UpdateCardCompact — voice transcript', () => {
  it('shows transcript label and content when expanded', async () => {
    const user = userEvent.setup();
    render(<UpdateCardCompact update={VOICE_UPDATE} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact'));
    expect(screen.getByText('Transcript')).toBeInTheDocument();
    expect(screen.getByText(/Yeah so today I went through/)).toBeInTheDocument();
  });

  it('does not show transcript section for text updates', async () => {
    const user = userEvent.setup();
    render(<UpdateCardCompact update={MOCK_UPDATE} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact'));
    expect(screen.queryByText('Transcript')).not.toBeInTheDocument();
  });

  it('shows fallback text when voice update has no content or transcript', async () => {
    const user = userEvent.setup();
    const emptyVoice = { ...VOICE_UPDATE, transcript: null, summary: null };
    render(<UpdateCardCompact update={emptyVoice} workspaceId={WORKSPACE_ID} />);
    await user.click(screen.getByTestId('update-card-compact'));
    expect(screen.getByText(/No content available/)).toBeInTheDocument();
  });
});
