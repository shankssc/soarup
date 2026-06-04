// apps/web/src/stories/domain/MembersPanel.stories.tsx
// MembersPanel states: loading, owner view, admin view, member view,
// empty workspace, pending invites, mobile.
// No hooks needed — all data passed as props.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { MembersPanel } from '@/components/domain/members/members-panel';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';
import type { PendingInvite } from '@/hooks/useInviteMembers';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER: WorkspaceMember = {
  user_id: 'user-owner',
  role: 'owner',
  joined_at: '2026-01-01T00:00:00Z',
  full_name: 'Alice Owner',
  avatar_url: null,
};

const ADMIN: WorkspaceMember = {
  user_id: 'user-admin',
  role: 'admin',
  joined_at: '2026-02-01T00:00:00Z',
  full_name: 'Bob Admin',
  avatar_url: null,
};

const MEMBER_1: WorkspaceMember = {
  user_id: 'user-member-1',
  role: 'member',
  joined_at: '2026-03-01T00:00:00Z',
  full_name: 'Carol Member',
  avatar_url: null,
};

const MEMBER_2: WorkspaceMember = {
  user_id: 'user-member-2',
  role: 'member',
  joined_at: '2026-04-01T00:00:00Z',
  full_name: 'Dave Member',
  avatar_url: null,
};

const ALL_MEMBERS = [OWNER, ADMIN, MEMBER_1, MEMBER_2];

const PENDING_INVITES: PendingInvite[] = [
  {
    id: 'inv-1',
    email: 'eve@company.com',
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'inv-2',
    email: 'frank@company.com',
    expires_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── No-op handlers ───────────────────────────────────────────────────────────

const noop = async () => {};

const DEFAULT_PROPS = {
  members: ALL_MEMBERS,
  pendingInvites: PENDING_INVITES,
  isLoadingMembers: false,
  isLoadingInvites: false,
  onInvite: noop,
  isInviting: false,
  inviteError: null,
  onRoleChange: noop,
  onRemove: noop,
  onRevokeInvite: noop,
};

// ─── Shell ────────────────────────────────────────────────────────────────────

function PanelShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[800px]">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Members/MembersPanel',
  component: MembersPanel,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/settings/members' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MembersPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Owner view ───────────────────────────────────────────────────────────────
// Owner sees: invite form, member list with role dropdowns, pending invites

export const OwnerViewDark: Story = {
  name: 'Owner View (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
  },
};

export const OwnerViewLight: Story = {
  name: 'Owner View (Light)',
  parameters: { theme: 'light' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
  },
};

// ─── Admin view ───────────────────────────────────────────────────────────────
// Admin sees: invite form, member list without role dropdowns, pending invites

export const AdminViewDark: Story = {
  name: 'Admin View (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-admin',
    currentUserRole: 'admin',
  },
};

// ─── Member view ──────────────────────────────────────────────────────────────
// Member sees: member list only, no invite form, no pending invites section

export const MemberViewDark: Story = {
  name: 'Member View — Read Only (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-member-1',
    currentUserRole: 'member',
  },
};

// ─── Loading states ───────────────────────────────────────────────────────────

export const LoadingMembersDark: Story = {
  name: 'Loading — Members (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    members: [],
    isLoadingMembers: true,
  },
};

export const LoadingInvitesDark: Story = {
  name: 'Loading — Invites (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    pendingInvites: [],
    isLoadingInvites: true,
  },
};

// ─── Empty states ─────────────────────────────────────────────────────────────

export const EmptyWorkspaceDark: Story = {
  name: 'Empty Workspace — No Members (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    members: [],
    pendingInvites: [],
    isLoadingMembers: false,
  },
};

export const NoPendingInvitesDark: Story = {
  name: 'No Pending Invites (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    pendingInvites: [],
  },
};

// ─── Invite sending states ────────────────────────────────────────────────────

export const InvitingSendingDark: Story = {
  name: 'Invite — Sending In Progress (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    isInviting: true,
  },
};

export const InviteErrorDark: Story = {
  name: 'Invite — Error State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    inviteError: 'Failed to send invite. Please try again.',
  },
};

// ─── Single member (owner only) ───────────────────────────────────────────────

export const SingleMemberDark: Story = {
  name: 'Single Member — Owner Only (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    members: [OWNER],
    pendingInvites: [],
  },
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileOwnerViewDark: Story = {
  name: 'Mobile — Owner View (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
  },
};

export const MobileOwnerViewLight: Story = {
  name: 'Mobile — Owner View (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PanelShell],
  args: {
    ...DEFAULT_PROPS,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
  },
};
