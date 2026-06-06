// apps/web/src/components/domain/updates/empty-state.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { EmptyState } from '@/components/domain/updates/empty-state';
import { useAuthStore } from '@/hooks/useAuth';
import { MOCK_USER, MOCK_TOKENS } from '../../../tests/mocks/user';

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
// Mimics the dashboard canvas container without requiring full AppShell
// (which would need router + workspace query mocks).

function DashboardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-[800px] flex-col gap-8">
        {/* Date header */}
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
  title: 'Domain/Updates/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    onSubmitClick: () => {},
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Dark: Story = {
  name: 'Empty State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
};

export const Light: Story = {
  name: 'Empty State (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
};

export const MobileDark: Story = {
  name: 'Empty State — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};

export const MobileLight: Story = {
  name: 'Empty State — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};
