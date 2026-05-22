// apps/web/src/stories/layout/Sidebar.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';
import { useWebSocketStore } from '@/stores/websocket-store';
import type { WsStatus } from '@/stores/websocket-store';
import type { WorkspaceResponse } from '@/hooks/useWorkspace';

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

const MOCK_WORKSPACE: WorkspaceResponse = {
  id: 'workspace-123',
  name: 'Ash Team',
  slug: 'ash-team',
  owner_id: 'user-123',
  plan: 'free',
  created_at: new Date().toISOString(),
};

// ─── Decorators ───────────────────────────────────────────────────────────────

function withAuthStore(wsStatus: WsStatus = 'connected') {
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

function SidebarShell(Story: React.ComponentType) {
  return (
    <div className="relative h-screen w-64">
      <Story />
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Layout/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    workspace: MOCK_WORKSPACE,
    workspaceLoading: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Dark: Story = {
  name: 'Sidebar — Connected (Dark)',
  parameters: { theme: 'dark' },
  decorators: [SidebarShell, withAuthStore('connected')],
};

export const Light: Story = {
  name: 'Sidebar — Connected (Light)',
  parameters: { theme: 'light' },
  decorators: [SidebarShell, withAuthStore('connected')],
};

export const Reconnecting: Story = {
  name: 'Sidebar — Reconnecting (Dark)',
  parameters: { theme: 'dark' },
  decorators: [SidebarShell, withAuthStore('reconnecting')],
};

export const Disconnected: Story = {
  name: 'Sidebar — Disconnected (Dark)',
  parameters: { theme: 'dark' },
  decorators: [SidebarShell, withAuthStore('disconnected')],
};

export const WorkspaceLoading: Story = {
  name: 'Sidebar — Workspace Loading (Dark)',
  parameters: { theme: 'dark' },
  decorators: [SidebarShell, withAuthStore('connected')],
  args: { workspace: null, workspaceLoading: true },
};

export const MobileDark: Story = {
  name: 'Sidebar — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [SidebarShell, withAuthStore('connected')],
};

export const MobileLight: Story = {
  name: 'Sidebar — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [SidebarShell, withAuthStore('connected')],
};
