// apps/web/src/stories/ui/AudioPlayer.stories.tsx
// AudioPlayer states: Inactive (duration shown), Loading URL, Active (audio element)
// Note: Active state requires a real presigned URL — shown as inactive in Storybook.
// The play button fetches a URL on click; mock the query in canvas to test active state.
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AudioPlayer } from '@/components/ui/audio-player';
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

function withQueryClient() {
  return function Decorator(Story: React.ComponentType) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    });
    return (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    );
  };
}

function CardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[600px] border border-outline-variant bg-surface-high p-6">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'UI/AudioPlayer',
  component: AudioPlayer,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    workspaceId: 'workspace-123',
    updateId: 'update-voice-001',
    durationSeconds: 107,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AudioPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Inactive — duration shown ────────────────────────────────────────────────

export const InactiveDark: Story = {
  name: 'Inactive — Duration Shown (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell, withQueryClient(), withAuthStore()],
};

export const InactiveLight: Story = {
  name: 'Inactive — Duration Shown (Light)',
  parameters: { theme: 'light' },
  decorators: [CardShell, withQueryClient(), withAuthStore()],
};

export const InactiveNoDurationDark: Story = {
  name: 'Inactive — No Duration (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell, withQueryClient(), withAuthStore()],
  args: {
    durationSeconds: null,
  },
};

// ─── Loading URL ──────────────────────────────────────────────────────────────
// Simulates the state after clicking play while the presigned URL is fetching.
// Achieved by seeding the query cache with a pending state.

export const LoadingUrlDark: Story = {
  name: 'Loading — Fetching Playback URL (Dark)',
  parameters: { theme: 'dark' },
  decorators: [
    CardShell,
    withAuthStore(),
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      // Seed a never-resolving query to simulate loading state
      queryClient.setQueryData(
        ['audio', 'playback', 'workspace-123', 'update-voice-001'],
        undefined,
      );
      return (
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileInactiveDark: Story = {
  name: 'AudioPlayer — Mobile Inactive (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [CardShell, withQueryClient(), withAuthStore()],
};

export const MobileInactiveLight: Story = {
  name: 'AudioPlayer — Mobile Inactive (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [CardShell, withQueryClient(), withAuthStore()],
};
