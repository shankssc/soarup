// apps/web/src/stories/domain/dashboard/PendingMembersRow.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { PendingMembersRow } from '@/components/domain/dashboard/pending-members-row';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeMembers = (count: number): WorkspaceMember[] =>
  Array.from({ length: count }, (_, i) => ({
    user_id: `user-${i + 1}`,
    role: 'member' as const,
    joined_at: new Date().toISOString(),
    full_name:
      [
        'Alice Owen',
        'Bob Chen',
        'Carol Singh',
        'Dave Park',
        'Eve Moss',
        'Frank Wu',
        'Grace Lee',
      ][i] ?? `Member ${i + 1}`,
    avatar_url: null,
  }));

const ONE_MEMBER = makeMembers(1);
const THREE_MEMBERS = makeMembers(3);
const SIX_MEMBERS = makeMembers(6);
const EIGHT_MEMBERS = makeMembers(8);

// ─── Shell ────────────────────────────────────────────────────────────────────

function DashboardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl border border-outline-variant">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Dashboard/PendingMembersRow',
  component: PendingMembersRow,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PendingMembersRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const OneMemberDark: Story = {
  name: '1 Member Pending (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  args: { members: ONE_MEMBER },
};

export const OneMemberLight: Story = {
  name: '1 Member Pending (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell],
  args: { members: ONE_MEMBER },
};

export const ThreeMembersDark: Story = {
  name: '3 Members Pending (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  args: { members: THREE_MEMBERS },
};

export const ThreeMembersLight: Story = {
  name: '3 Members Pending (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell],
  args: { members: THREE_MEMBERS },
};

export const FourMembersDark: Story = {
  name: '4 Members — At Limit (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  args: { members: makeMembers(4) },
};

export const SixMembersDark: Story = {
  name: '6 Members — Overflow +2 (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  args: { members: SIX_MEMBERS },
};

export const EightMembersDark: Story = {
  name: '8 Members — Overflow +4 (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  args: { members: EIGHT_MEMBERS },
};

export const MobileDark: Story = {
  name: 'Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell],
  args: { members: THREE_MEMBERS },
};
