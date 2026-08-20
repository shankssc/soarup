// apps/web/src/stories/ui/ConnectionIndicator.stories.tsx
// Stories for the ConnectionIndicator component embedded in Sidebar.
// Since ConnectionIndicator is not exported separately, we render it
// via a minimal Sidebar wrapper seeded with each WsStatus state.
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import { useWebSocketStore } from '@/stores/websocket-store';
import type { WsStatus } from '@/stores/websocket-store';
import { MOCK_TOKENS, MOCK_USER } from '../../../tests/mocks/user';

// ─── Inline ConnectionIndicator (mirrors sidebar.tsx implementation) ──────────
// Duplicated here so the story is self-contained and doesn't depend on
// ConnectionIndicator being exported from sidebar.tsx.

function ConnectionIndicator() {
  const status = useWebSocketStore((s) => s.status);

  const PILL_STYLES = {
    connected: {
      pill: 'bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
      text: 'text-emerald-800',
      label: 'Live',
      pulse: false,
    },
    idle: {
      pill: 'bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
      text: 'text-emerald-800',
      label: 'Live',
      pulse: false,
    },
    connecting: {
      pill: 'bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
      text: 'text-amber-800',
      label: 'Connecting',
      pulse: true,
    },
    reconnecting: {
      pill: 'bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
      text: 'text-amber-800',
      label: 'Reconnecting...',
      pulse: true,
    },
  } as const;

  if (status === 'disconnected' || status === 'error') {
    return (
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 transition-opacity hover:opacity-80"
        aria-label="Connection lost — click to reconnect"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
        <span className="font-label text-[10px] font-medium uppercase tracking-[0.08em] text-red-800">
          Connection lost · Reconnect
        </span>
      </button>
    );
  }

  const config = PILL_STYLES[status as keyof typeof PILL_STYLES];
  if (!config) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${config.pill}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot} ${config.pulse ? 'animate-pulse' : ''}`}
      />
      <span
        className={`font-label text-[10px] font-medium uppercase tracking-[0.08em] ${config.text}`}
      >
        {config.label}
      </span>
    </div>
  );
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
