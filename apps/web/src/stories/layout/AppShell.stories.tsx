// apps/web/src/stories/layout/AppShell.stories.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';
import { useWebSocketStore } from '@/stores/websocket-store';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER: UserProfile = {
  id: 'user-123',
  email: 'suyash@example.com',
  full_name: 'Suyash Chaudhary',
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

// ─── Decorators ───────────────────────────────────────────────────────────────

function withQueryClient(Story: React.ComponentType) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  );
}

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
        // Mock useWebSocketStore to avoid real WS connection
        useWebSocketStore.setState({ status: 'connected' });
        return () => {
          useAuthStore.setState({
            user: null,
            tokens: null,
            isLoading: false,
            error: null,
          });
          useWebSocketStore.setState({ status: 'idle' });
        };
      }, []);
      return <Story />;
    }
    return <StoreSeeder />;
  };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Layout/AppShell',
  component: AppShell,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Dark: Story = {
  name: 'AppShell (Dark)',
  parameters: { theme: 'dark' },
  decorators: [withQueryClient, withAuthStore()],
  args: {
    children: (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-high" />
        <div className="h-32 rounded border border-outline-variant bg-surface-high" />
        <div className="h-32 rounded border border-outline-variant bg-surface-high" />
      </div>
    ),
  },
};

export const Light: Story = {
  name: 'AppShell (Light)',
  parameters: { theme: 'light' },
  decorators: [withQueryClient, withAuthStore()],
  args: {
    children: (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-high" />
        <div className="h-32 rounded border border-outline-variant bg-surface-high" />
        <div className="h-32 rounded border border-outline-variant bg-surface-high" />
      </div>
    ),
  },
};

export const MobileDark: Story = {
  name: 'AppShell — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [withQueryClient, withAuthStore()],
  args: {
    children: (
      <div className="h-32 rounded border border-outline-variant bg-surface-high" />
    ),
  },
};

export const MobileLight: Story = {
  name: 'AppShell — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [withQueryClient, withAuthStore()],
  args: {
    children: (
      <div className="h-32 rounded border border-outline-variant bg-surface-high" />
    ),
  },
};
