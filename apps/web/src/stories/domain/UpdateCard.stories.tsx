// apps/web/src/components/domain/updates/update-card.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { UpdateCard } from '@/components/domain/updates/update-card';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';
import type { UpdateResponse } from '@/hooks/useUpdates';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER: UserProfile = {
  id: 'user-123',
  email: 'jane@example.com',
  full_name: 'Jane Doe',
  avatar_url: null,
  email_verified: true,
  is_onboarded: true,
  created_at: new Date().toISOString(),
};

const MOCK_TOKENS: AuthTokens = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600 * 1000,
};

const MOCK_UPDATE: UpdateResponse = {
  id: 'update-abc',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content:
    'Finished the API integration for the workspace switcher and started on the dashboard layout tokens. The alignment looks solid — mostly working on the asymmetric border radius logic for the primary buttons next.',
  mode: 'text',
  status: 'pending',
  summary: null,
  update_date: '2026-05-18',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const MOCK_UPDATE_OTHER_USER: UpdateResponse = {
  ...MOCK_UPDATE,
  id: 'update-def',
  user_id: 'user-456',
  author_name: 'Alex Kim',
  status: 'processed',
  created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
  updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
};

// ─── Store seeder ─────────────────────────────────────────────────────────────

function withAuthStore() {
  return function Decorator(Story: React.ComponentType) {
    function StoreSeeder() {
      useEffect(() => {
        useAuthStore.setState({
          user: MOCK_USER,
          tokens: MOCK_TOKENS,
          isLoading: false,
          error: null,
        });
        return () => {
          useAuthStore.setState({
            user: null,
            tokens: null,
            isLoading: false,
            error: null,
          });
        };
      }, []);
      return <Story />;
    }
    return <StoreSeeder />;
  };
}

// ─── Shell ────────────────────────────────────────────────────────────────────

function DashboardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-[800px] flex-col gap-4">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Updates/UpdateCard',
  component: UpdateCard,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    update: MOCK_UPDATE,
    currentUserId: 'user-123',
    onEdit: async (_id: string, _content: string) => {},
    onDelete: async (_id: string, _date: string) => {},
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UpdateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const OwnUpdatePendingDark: Story = {
  name: 'Own Update — Pending (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
};

export const OwnUpdatePendingLight: Story = {
  name: 'Own Update — Pending (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
};

export const OwnUpdateProcessedDark: Story = {
  name: 'Own Update — Summarised (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: { update: { ...MOCK_UPDATE, status: 'processed' } },
};

export const OtherUserUpdateDark: Story = {
  name: "Teammate's Update — No Menu (Dark)",
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: MOCK_UPDATE_OTHER_USER,
    currentUserId: 'user-123',
  },
};

export const OtherUserUpdateLight: Story = {
  name: "Teammate's Update — No Menu (Light)",
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: MOCK_UPDATE_OTHER_USER,
    currentUserId: 'user-123',
  },
};

export const MultipleCardsDark: Story = {
  name: 'Multiple Cards (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  render: (args) => (
    <>
      <UpdateCard {...args} update={MOCK_UPDATE} />
      <UpdateCard {...args} update={MOCK_UPDATE_OTHER_USER} />
    </>
  ),
};

export const MultipleCardsLight: Story = {
  name: 'Multiple Cards (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  render: (args) => (
    <>
      <UpdateCard {...args} update={MOCK_UPDATE} />
      <UpdateCard {...args} update={MOCK_UPDATE_OTHER_USER} />
    </>
  ),
};

export const MobileDark: Story = {
  name: 'Update Card — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};

export const MobileLight: Story = {
  name: 'Update Card — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};
