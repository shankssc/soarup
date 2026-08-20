// apps/web/tests/unit/update-card.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateCard } from '@/components/domain/updates/update-card';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// next/image is not renderable in jsdom
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// Pin timestamp to avoid flaky "X minutes ago" assertions
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
  transcript: null,
  audio_duration_seconds: null,
  update_date: '2026-05-18',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const defaultProps = {
  update: MOCK_UPDATE,
  currentUserId: 'user-123', // matches MOCK_UPDATE.user_id → isOwner = true
  onEdit: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
};

const otherUserProps = {
  ...defaultProps,
  currentUserId: 'user-999', // does NOT match → isOwner = false
};

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('UpdateCard — rendering', () => {
  it('renders update content', () => {
    render(<UpdateCard {...defaultProps} />);
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
  });

  it('renders author name', () => {
    render(<UpdateCard {...defaultProps} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders timestamp', () => {
    render(<UpdateCard {...defaultProps} />);
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('renders status badge for pending', () => {
    render(<UpdateCard {...defaultProps} />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it('renders status badge for processed', () => {
    render(
      <UpdateCard {...defaultProps} update={{ ...MOCK_UPDATE, status: 'processed' }} />,
    );
    expect(screen.getByText(/summarised/i)).toBeInTheDocument();
  });

  it('renders status badge for failed', () => {
    render(
      <UpdateCard {...defaultProps} update={{ ...MOCK_UPDATE, status: 'failed' }} />,
    );
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('renders avatar initial when no avatar_url', () => {
    render(<UpdateCard {...defaultProps} />);
    expect(screen.getByText('J')).toBeInTheDocument();
  });
});

// ─── Three-dot menu visibility ────────────────────────────────────────────────

describe('UpdateCard — three-dot menu visibility', () => {
  it('shows three-dot menu for own update', () => {
    render(<UpdateCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: /update options/i })).toBeInTheDocument();
  });

  it("does NOT show three-dot menu for another user's update", () => {
    render(<UpdateCard {...otherUserProps} />);
    expect(
      screen.queryByRole('button', { name: /update options/i }),
    ).not.toBeInTheDocument();
  });
});

// ─── Three-dot menu interactions ──────────────────────────────────────────────

describe('UpdateCard — three-dot menu', () => {
  it('clicking three-dot menu reveals edit and delete options', async () => {
    const user = userEvent.setup();
    render(<UpdateCard {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /update options/i }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('clicking edit enters edit mode', async () => {
    const user = userEvent.setup();
    render(<UpdateCard {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /update options/i }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(MOCK_UPDATE.content);
  });

  it('clicking delete calls onDelete with correct args', async () => {
    const user = userEvent.setup();
    render(<UpdateCard {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /update options/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(defaultProps.onDelete).toHaveBeenCalledWith(
        MOCK_UPDATE.id,
        MOCK_UPDATE.update_date,
      ),
    );
  });
});

// ─── Edit mode ────────────────────────────────────────────────────────────────

describe('UpdateCard — edit mode', () => {
  async function enterEditMode() {
    const user = userEvent.setup();
    render(<UpdateCard {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /update options/i }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    return user;
  }

  it('edit mode shows save and cancel buttons', async () => {
    await enterEditMode();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('saving edit calls onEdit with new content', async () => {
    const user = await enterEditMode();
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'new content');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(defaultProps.onEdit).toHaveBeenCalledWith(MOCK_UPDATE.id, 'new content'),
    );
  });

  it('cancelling edit restores original content', async () => {
    const user = await enterEditMode();
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'something new');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // Edit mode closes — original content is shown in the paragraph
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Escape key cancels edit', async () => {
    await enterEditMode();
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(MOCK_UPDATE.content)).toBeInTheDocument();
  });

  it('Cmd+Enter saves edit', async () => {
    const user = await enterEditMode();
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'edited via keyboard');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(defaultProps.onEdit).toHaveBeenCalledWith(
        MOCK_UPDATE.id,
        'edited via keyboard',
      ),
    );
  });

  it('Ctrl+Enter also saves edit', async () => {
    const user = await enterEditMode();
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'edited via ctrl');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(defaultProps.onEdit).toHaveBeenCalledWith(
        MOCK_UPDATE.id,
        'edited via ctrl',
      ),
    );
  });

  it('save button is disabled when edit content is empty', async () => {
    const user = await enterEditMode();
    await user.clear(screen.getByRole('textbox'));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('onEdit not called when content is unchanged and save is clicked', async () => {
    // Content is pre-filled with original — save should still call onEdit
    // but with the original content (trim applied)
    const user = await enterEditMode();
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(defaultProps.onEdit).toHaveBeenCalledWith(
        MOCK_UPDATE.id,
        MOCK_UPDATE.content.trim(),
      ),
    );
  });
});
