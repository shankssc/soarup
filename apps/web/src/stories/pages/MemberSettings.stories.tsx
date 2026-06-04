// apps/web/src/stories/pages/MembersSettings.stories.tsx
// Page-level story — wraps MembersPanel in the real app shell chrome
// using the same PageShell pattern as Pages/Auth/Login.
// Props passed directly to MembersPanel — no hooks needed in Storybook.

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

const MEMBER: WorkspaceMember = {
  user_id: 'user-member-1',
  role: 'member',
  joined_at: '2026-03-01T00:00:00Z',
  full_name: 'Carol Member',
  avatar_url: null,
};

const PENDING_INVITES: PendingInvite[] = [
  {
    id: 'inv-1',
    email: 'eve@company.com',
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const noop = async () => {};

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[800px]">
            {/* Page header — mirrors MembersSettingsPage */}
            <div className="mb-8 flex flex-col gap-8">
              <div className="border-b border-outline-variant pb-3">
                <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
                  Settings — Members
                </h2>
              </div>
              <Story />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Settings/Members',
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

export const Dark: Story = {
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    members: [OWNER, ADMIN, MEMBER],
    pendingInvites: PENDING_INVITES,
    currentUserId: 'user-owner',
    currentUserRole: 'owner',
    isLoadingMembers: false,
    isLoadingInvites: false,
    onInvite: noop,
    isInviting: false,
    inviteError: null,
    onRoleChange: noop,
    onRemove: noop,
    onRevokeInvite: noop,
  },
};

export const Light: Story = {
  parameters: { theme: 'light' },
  decorators: [PageShell],
  args: {
    ...Dark.args,
  },
};

export const MobileDark: Story = {
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
  args: {
    ...Dark.args,
  },
};

export const MobileLight: Story = {
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
  args: {
    ...Dark.args,
  },
};
