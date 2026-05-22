// apps/web/src/stories/domain/UpdateCard.stories.tsx
// M3 additions: Processing, Summarised, Failed story variants
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

const BASE_UPDATE: UpdateResponse = {
  id: 'update-abc',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content:
    'Finished the API integration for the workspace switcher and started on the dashboard layout tokens. The alignment looks solid — mostly working on the asymmetric border radius logic for the primary buttons next.',
  mode: 'text',
  status: 'pending',
  summary: null,
  update_date: '2026-05-21',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const TEAMMATE_UPDATE: UpdateResponse = {
  ...BASE_UPDATE,
  id: 'update-def',
  user_id: 'user-456',
  author_name: 'Alex Kim',
  created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
};

// ─── Decorators ───────────────────────────────────────────────────────────────

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
    update: BASE_UPDATE,
    currentUserId: 'user-123',
    onEdit: async () => {},
    onDelete: async () => {},
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UpdateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── M2 baseline stories ──────────────────────────────────────────────────────

export const PendingDark: Story = {
  name: 'Pending (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
};

export const PendingLight: Story = {
  name: 'Pending (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
};

// ─── M3 status variants ───────────────────────────────────────────────────────

export const ProcessingDark: Story = {
  name: 'Processing — Skeleton (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: { ...BASE_UPDATE, status: 'processing' },
  },
};

export const ProcessingLight: Story = {
  name: 'Processing — Skeleton (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: { ...BASE_UPDATE, status: 'processing' },
  },
};

export const SummarisedDark: Story = {
  name: 'Summarised — With AI Summary (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_UPDATE,
      status: 'processed',
      summary:
        'They completed the API integration for the workspace switcher and began work on the dashboard layout token system, focusing on the asymmetric border radius logic for primary buttons.',
    },
  },
};

export const SummarisedLight: Story = {
  name: 'Summarised — With AI Summary (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_UPDATE,
      status: 'processed',
      summary:
        'They completed the API integration for the workspace switcher and began work on the dashboard layout token system, focusing on the asymmetric border radius logic for primary buttons.',
    },
  },
};

export const FailedDark: Story = {
  name: 'Failed — Summary Unavailable (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: { ...BASE_UPDATE, status: 'failed' },
  },
};

export const FailedLight: Story = {
  name: 'Failed — Summary Unavailable (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: { ...BASE_UPDATE, status: 'failed' },
  },
};

// ─── Teammate card (no menu) ──────────────────────────────────────────────────

export const TeammateProcessedDark: Story = {
  name: "Teammate's Update — Summarised (Dark)",
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...TEAMMATE_UPDATE,
      status: 'processed',
      summary:
        'They reviewed the auth middleware PR with comments and are planning to begin the Redis pub/sub integration next.',
    },
    currentUserId: 'user-123',
  },
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileDark: Story = {
  name: 'UpdateCard — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_UPDATE,
      status: 'processed',
      summary:
        'They completed the API integration for the workspace switcher and began work on the dashboard layout token system.',
    },
  },
};

export const MobileLight: Story = {
  name: 'UpdateCard — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_UPDATE,
      status: 'processed',
      summary:
        'They completed the API integration for the workspace switcher and began work on the dashboard layout token system.',
    },
  },
};
