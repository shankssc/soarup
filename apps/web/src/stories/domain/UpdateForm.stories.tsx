// apps/web/src/components/domain/updates/update-form.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { UpdateForm } from '@/components/domain/updates/update-form';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';

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
      <div className="mx-auto flex max-w-[800px] flex-col gap-8">
        <div className="border-b border-outline-variant pb-3">
          <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
            Today — Monday, 18 May
          </h2>
        </div>
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Updates/UpdateForm',
  component: UpdateForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    onSubmit: async (_content: string) => {
      await new Promise((r) => setTimeout(r, 1000));
    },
    onCancel: () => {},
    isSubmitting: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UpdateForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Dark: Story = {
  name: 'Update Form (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
};

export const Light: Story = {
  name: 'Update Form (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
};

export const Submitting: Story = {
  name: 'Submitting State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: { isSubmitting: true },
};

export const NearLimit: Story = {
  name: 'Near Character Limit (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  render: (args) => (
    <UpdateForm
      {...args}
      // Pre-fill with 950 chars to show the counter warning
      onSubmit={args.onSubmit}
      onCancel={args.onCancel}
      isSubmitting={false}
    />
  ),
};

export const MobileDark: Story = {
  name: 'Update Form — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};

export const MobileLight: Story = {
  name: 'Update Form — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};
