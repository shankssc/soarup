// apps/web/tests/unit/members-panel.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MembersPanel } from '@/components/domain/members/members-panel';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_MEMBERS = [
  {
    user_id: 'user-owner',
    role: 'owner' as const,
    joined_at: '2026-01-01T00:00:00Z',
    full_name: 'Alice Owner',
    avatar_url: null,
  },
  {
    user_id: 'user-admin',
    role: 'admin' as const,
    joined_at: '2026-02-01T00:00:00Z',
    full_name: 'Bob Admin',
    avatar_url: null,
  },
  {
    user_id: 'user-member',
    role: 'member' as const,
    joined_at: '2026-03-01T00:00:00Z',
    full_name: 'Carol Member',
    avatar_url: null,
  },
];

const MOCK_PENDING_INVITES = [
  {
    id: 'inv-001',
    email: 'dave@example.com',
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── Setup ────────────────────────────────────────────────────────────────────

const noop = vi.fn().mockResolvedValue(undefined);

const DEFAULT_PROPS = {
  members: MOCK_MEMBERS,
  pendingInvites: MOCK_PENDING_INVITES,
  currentUserId: 'user-owner',
  currentUserRole: 'owner' as const,
  isLoadingMembers: false,
  isLoadingInvites: false,
  onInvite: noop,
  isInviting: false,
  inviteError: null,
  onRoleChange: noop,
  onRemove: noop,
  onRevokeInvite: noop,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Member list rendering ────────────────────────────────────────────────────

describe('MembersPanel — member list rendering', () => {
  it('renders all member names', () => {
    render(<MembersPanel {...DEFAULT_PROPS} />);
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('Bob Admin')).toBeInTheDocument();
    expect(screen.getByText('Carol Member')).toBeInTheDocument();
  });

  it('shows (you) label next to current user', () => {
    render(<MembersPanel {...DEFAULT_PROPS} currentUserId="user-owner" />);
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('does not show (you) label for other members', () => {
    render(<MembersPanel {...DEFAULT_PROPS} currentUserId="user-owner" />);
    // Only one (you) label
    expect(screen.getAllByText('(you)')).toHaveLength(1);
  });

  it('shows loading skeletons when isLoadingMembers is true', () => {
    render(<MembersPanel {...DEFAULT_PROPS} members={[]} isLoadingMembers={true} />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state message when no members', () => {
    render(<MembersPanel {...DEFAULT_PROPS} members={[]} isLoadingMembers={false} />);
    expect(screen.getByText('No members yet.')).toBeInTheDocument();
  });
});

// ─── Role-based visibility ────────────────────────────────────────────────────

describe('MembersPanel — role-based visibility', () => {
  it('owner sees invite form', () => {
    render(<MembersPanel {...DEFAULT_PROPS} currentUserRole="owner" />);
    expect(screen.getByPlaceholderText(/colleague@company\.com/i)).toBeInTheDocument();
  });

  it('admin sees invite form', () => {
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        currentUserId="user-admin"
        currentUserRole="admin"
      />,
    );
    expect(screen.getByPlaceholderText(/colleague@company\.com/i)).toBeInTheDocument();
  });

  it('member does not see invite form', () => {
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        currentUserId="user-member"
        currentUserRole="member"
      />,
    );
    expect(
      screen.queryByPlaceholderText(/colleague@company\.com/i),
    ).not.toBeInTheDocument();
  });

  it('owner sees role dropdowns for non-owner members', () => {
    render(<MembersPanel {...DEFAULT_PROPS} currentUserRole="owner" />);
    // admin + member rows get dropdowns; owner row does not
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
  });

  it('admin does not see role dropdowns (owner-only feature)', () => {
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        currentUserId="user-admin"
        currentUserRole="admin"
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('owner sees remove buttons for non-owner members', () => {
    render(<MembersPanel {...DEFAULT_PROPS} currentUserRole="owner" />);
    // admin + member can be removed; owner cannot remove self
    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons).toHaveLength(2);
  });

  it('admin cannot remove another admin', () => {
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        currentUserId="user-admin"
        currentUserRole="admin"
      />,
    );
    // Admin can only remove member — not owner, not self, not another admin
    const removeButtons = screen.queryAllByText('Remove');
    expect(removeButtons).toHaveLength(1);
  });
});

// ─── Invite form ──────────────────────────────────────────────────────────────

describe('MembersPanel — invite form', () => {
  it('calls onInvite with trimmed email on submit', async () => {
    const onInvite = vi.fn().mockResolvedValue(undefined);
    render(<MembersPanel {...DEFAULT_PROPS} onInvite={onInvite} />);

    const input = screen.getByPlaceholderText(/colleague@company\.com/i);
    fireEvent.change(input, { target: { value: '  new@example.com  ' } });
    // Button becomes enabled when input has value — click it
    fireEvent.click(screen.getByText('Send invite'));

    await waitFor(() => {
      expect(onInvite).toHaveBeenCalledWith('new@example.com');
    });
  });

  it('shows validation error for empty email via Enter key', async () => {
    render(<MembersPanel {...DEFAULT_PROPS} />);

    const input = screen.getByPlaceholderText(/colleague@company\.com/i);
    // Trigger via Enter since button is disabled when email is empty
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for invalid email', async () => {
    render(<MembersPanel {...DEFAULT_PROPS} />);

    const input = screen.getByPlaceholderText(/colleague@company\.com/i);
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByText('Send invite'));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
  });

  it('shows API-level invite error from inviteError prop', () => {
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        inviteError="Failed to send invite. Please try again."
      />,
    );
    expect(
      screen.getByText('Failed to send invite. Please try again.'),
    ).toBeInTheDocument();
  });

  it('shows Sending... and disables button while isInviting is true', () => {
    render(<MembersPanel {...DEFAULT_PROPS} isInviting={true} />);
    const button = screen.getByText('Sending...');
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('submits on Enter key press with valid email', async () => {
    const onInvite = vi.fn().mockResolvedValue(undefined);
    render(<MembersPanel {...DEFAULT_PROPS} onInvite={onInvite} />);

    const input = screen.getByPlaceholderText(/colleague@company\.com/i);
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onInvite).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('clears input after successful invite', async () => {
    const onInvite = vi.fn().mockResolvedValue(undefined);
    render(<MembersPanel {...DEFAULT_PROPS} onInvite={onInvite} />);

    const input = screen.getByPlaceholderText(/colleague@company\.com/i);
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByText('Send invite'));

    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(input).toHaveValue('');
  });
});

// ─── Pending invites ──────────────────────────────────────────────────────────

describe('MembersPanel — pending invites', () => {
  it('renders pending invite email', () => {
    render(<MembersPanel {...DEFAULT_PROPS} />);
    expect(screen.getByText('dave@example.com')).toBeInTheDocument();
  });

  it('shows expires in text on pending invite', () => {
    render(<MembersPanel {...DEFAULT_PROPS} />);
    expect(screen.getByText(/expires in/i)).toBeInTheDocument();
  });

  it('calls onRevokeInvite when Revoke is clicked', async () => {
    const onRevokeInvite = vi.fn().mockResolvedValue(undefined);
    render(<MembersPanel {...DEFAULT_PROPS} onRevokeInvite={onRevokeInvite} />);

    fireEvent.click(screen.getByText('Revoke'));

    await waitFor(() => {
      expect(onRevokeInvite).toHaveBeenCalledWith('inv-001');
    });
  });

  it('shows loading skeleton for invites when isLoadingInvites is true', () => {
    render(
      <MembersPanel {...DEFAULT_PROPS} pendingInvites={[]} isLoadingInvites={true} />,
    );
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty pending invites message when none', () => {
    render(
      <MembersPanel {...DEFAULT_PROPS} pendingInvites={[]} isLoadingInvites={false} />,
    );
    expect(screen.getByText('No pending invites.')).toBeInTheDocument();
  });

  it('member does not see pending invites section', () => {
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        currentUserId="user-member"
        currentUserRole="member"
      />,
    );
    expect(screen.queryByText('dave@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending invites.')).not.toBeInTheDocument();
  });
});

// ─── Role change and remove actions ──────────────────────────────────────────

describe('MembersPanel — role change and remove actions', () => {
  it('calls onRoleChange with userId and new role as separate args', async () => {
    const onRoleChange = vi.fn().mockResolvedValue(undefined);
    render(
      <MembersPanel
        {...DEFAULT_PROPS}
        currentUserRole="owner"
        onRoleChange={onRoleChange}
      />,
    );

    const selects = screen.getAllByRole('combobox');
    // First select is for the admin row (second member in list)
    fireEvent.change(selects[0], { target: { value: 'member' } });

    await waitFor(() => {
      expect(onRoleChange).toHaveBeenCalledWith('user-admin', 'member');
    });
  });

  it('calls onRemove with userId when remove button clicked', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <MembersPanel {...DEFAULT_PROPS} currentUserRole="owner" onRemove={onRemove} />,
    );

    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledWith(expect.any(String));
    });
  });

  it('first remove button removes admin (user-admin)', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <MembersPanel {...DEFAULT_PROPS} currentUserRole="owner" onRemove={onRemove} />,
    );

    const removeButtons = screen.getAllByText('Remove');
    // Members are rendered in order: owner (no remove), admin, member
    // First remove button corresponds to admin row
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledWith('user-admin');
    });
  });
});
