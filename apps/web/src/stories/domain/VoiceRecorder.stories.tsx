// apps/web/src/stories/domain/VoiceRecorder.stories.tsx
// VoiceRecorder states renderable in Storybook without MediaRecorder mocking.
// Recording/Preview/Uploading states require real browser interaction —
// documented as manual test cases rather than Storybook stories.
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { VoiceRecorder } from '@/components/domain/updates/voice-recorder';
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

function DashboardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-[600px]">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Updates/VoiceRecorder',
  component: VoiceRecorder,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    workspaceId: 'workspace-123',
    updateDate: '2026-05-21',
    onSuccess: async () => {},
    onCancel: () => {},
  },
  tags: ['autodocs'],
} satisfies Meta<typeof VoiceRecorder>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Idle ─────────────────────────────────────────────────────────────────────

export const IdleDark: Story = {
  name: 'Idle — Tap to Record (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
};

export const IdleLight: Story = {
  name: 'Idle — Tap to Record (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
};

// ─── Error — mic permission denied ───────────────────────────────────────────
// Patches getUserMedia to reject immediately so the component transitions
// to error state when the record button is clicked in Storybook canvas.

export const MicPermissionDeniedDark: Story = {
  name: 'Error — Microphone Permission Denied (Dark)',
  parameters: { theme: 'dark' },
  decorators: [
    DashboardShell,
    withAuthStore(),
    (Story) => {
      if (typeof window !== 'undefined' && window.navigator?.mediaDevices) {
        window.navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      }
      return React.createElement(Story);
    },
  ],
};

export const MicPermissionDeniedLight: Story = {
  name: 'Error — Microphone Permission Denied (Light)',
  parameters: { theme: 'light' },
  decorators: [
    DashboardShell,
    withAuthStore(),
    (Story) => {
      if (typeof window !== 'undefined' && window.navigator?.mediaDevices) {
        window.navigator.mediaDevices.getUserMedia = () =>
          Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      }
      return React.createElement(Story);
    },
  ],
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileIdleDark: Story = {
  name: 'VoiceRecorder — Mobile Idle (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};

export const MobileIdleLight: Story = {
  name: 'VoiceRecorder — Mobile Idle (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
};
