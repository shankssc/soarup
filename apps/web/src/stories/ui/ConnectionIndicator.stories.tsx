// apps/web/src/stories/ui/ConnectionIndicator.stories.tsx
// Stories for the ConnectionIndicator component embedded in Sidebar.
// Since ConnectionIndicator is not exported separately, we render it
// via a minimal Sidebar wrapper seeded with each WsStatus state.
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';
import { useWebSocketStore } from '@/stores/websocket-store';
import type { WsStatus } from '@/stores/websocket-store';

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

// ─── Inline ConnectionIndicator (mirrors sidebar.tsx implementation) ──────────
// Duplicated here so the story is self-contained and doesn't depend on
// ConnectionIndicator being exported from sidebar.tsx.

function ConnectionIndicator() {
  const status = useWebSocketStore((s) => s.status);

  if (status === 'connected' || status === 'idle') {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full bg-primary"
        aria-label="Connected"
      />
    );
  }
  if (status === 'connecting') {
    return (
      <span
        className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"
        aria-label="Connecting"
      />
    );
  }
  if (status === 'reconnecting') {
    return (
      <span className="flex items-center gap-1.5 font-label text-[10px] text-outline">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        Reconnecting...
      </span>
    );
  }
  if (status === 'disconnected' || status === 'error') {
    return (
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 font-label text-[10px] text-error hover:underline"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-error" />
        Connection lost — reconnect
      </button>
    );
  }
  return null;
}

// ─── Decorators ───────────────────────────────────────────────────────────────

function withStores(wsStatus: WsStatus) {
  return function Decorator(Story: React.ComponentType) {
    function StoreSeeder() {
      useEffect(() => {
        useAuthStore.setState({
          user: MOCK_USER,
          tokens: MOCK_TOKENS,
          isLoading: false,
          error: null,
        });
        useWebSocketStore.setState({ status: wsStatus });
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

function Shell(Story: React.ComponentType) {
  return (
    <div className="flex min-h-[120px] w-64 flex-col items-start justify-center gap-2 border border-outline-variant bg-surface-lowest p-6">
      <p className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
        Connection indicator
      </p>
      <Story />
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'UI/ConnectionIndicator',
  component: ConnectionIndicator,
  parameters: {
    layout: 'centered',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ConnectionIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── All 4 status states ──────────────────────────────────────────────────────

export const ConnectedDark: Story = {
  name: 'Connected (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Shell, withStores('connected')],
};

export const ConnectedLight: Story = {
  name: 'Connected (Light)',
  parameters: { theme: 'light' },
  decorators: [Shell, withStores('connected')],
};

export const ReconnectingDark: Story = {
  name: 'Reconnecting (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Shell, withStores('reconnecting')],
};

export const DisconnectedDark: Story = {
  name: 'Disconnected / Error (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Shell, withStores('disconnected')],
};

export const DisconnectedLight: Story = {
  name: 'Disconnected / Error (Light)',
  parameters: { theme: 'light' },
  decorators: [Shell, withStores('disconnected')],
};

export const ConnectingDark: Story = {
  name: 'Connecting (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Shell, withStores('connecting')],
};
