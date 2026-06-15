// apps/web/src/stories/layout/TopBar.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { useAuthStore } from '@/hooks/useAuth';
import { MOCK_USER, MOCK_TOKENS } from '../../../tests/mocks/user';

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

function TopBarShell(Story: React.ComponentType) {
  return (
    <div className="w-full">
      <Story />
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Layout/TopBar',
  component: TopBar,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Dark: Story = {
  name: 'TopBar — Dashboard (Dark)',
  parameters: { theme: 'dark' },
  decorators: [TopBarShell, withAuthStore()],
};

export const Light: Story = {
  name: 'TopBar — Dashboard (Light)',
  parameters: { theme: 'light' },
  decorators: [TopBarShell, withAuthStore()],
};

export const HistoryDark: Story = {
  name: 'TopBar — History (Dark)',
  parameters: {
    theme: 'dark',
    nextjs: { navigation: { pathname: '/history' } },
  },
  decorators: [TopBarShell, withAuthStore()],
};

export const SettingsDark: Story = {
  name: 'TopBar — Settings (Dark)',
  parameters: {
    theme: 'dark',
    nextjs: { navigation: { pathname: '/settings' } },
  },
  decorators: [TopBarShell, withAuthStore()],
};

export const MobileDark: Story = {
  name: 'TopBar — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [TopBarShell, withAuthStore()],
};

export const MobileLight: Story = {
  name: 'TopBar — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [TopBarShell, withAuthStore()],
};
