// apps/web/src/stories/domain/UpdateCard.stories.tsx
// M3 additions: Processing, Summarised, Failed story variants
// M4 additions: Voice update variants (Pending, Transcribing, Summarised, Failed)
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { UpdateCard } from '@/components/domain/updates/update-card';
import { useAuthStore } from '@/hooks/useAuth';
import type { UpdateResponse } from '@/hooks/useUpdates';
import { MOCK_USER, MOCK_TOKENS } from '../../../tests/mocks/user';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_UPDATE: UpdateResponse = {
  id: 'update-abc',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content:
    'Finished the API integration for the workspace switcher and started on the dashboard layout tokens. The alignment looks solid — mostly working on the asymmetric border radius logic for the primary buttons next.',
  mode: 'text',
  status: 'pending',
  summary: null,
  transcript: null,
  audio_duration_seconds: null,
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

const BASE_VOICE_UPDATE: UpdateResponse = {
  id: 'update-voice-001',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content: '',
  mode: 'voice',
  status: 'pending',
  summary: null,
  transcript: null,
  audio_duration_seconds: 107,
  update_date: '2026-05-21',
  created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
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

// ─── M4 voice variants ────────────────────────────────────────────────────────

export const VoiceUpdatePendingDark: Story = {
  name: 'Voice Update — Pending (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: BASE_VOICE_UPDATE,
  },
};

export const VoiceUpdatePendingLight: Story = {
  name: 'Voice Update — Pending (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: BASE_VOICE_UPDATE,
  },
};

export const VoiceUpdateTranscribingDark: Story = {
  name: 'Voice Update — Transcribing (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_VOICE_UPDATE,
      status: 'processing',
    },
  },
};

export const VoiceUpdateSummarisedDark: Story = {
  name: 'Voice Update — Summarised (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_VOICE_UPDATE,
      status: 'processed',
      transcript:
        'Today I finished the audio upload pipeline and wired up the voice recorder component. The presigned URL flow is working end to end and I can see files landing in Minio. Next up is the transcription task and wiring up the WebSocket events.',
      summary:
        'They completed the audio upload pipeline and voice recorder integration, with the presigned URL flow working end to end. Next focus is the transcription task and WebSocket event wiring.',
    },
  },
};

export const VoiceUpdateSummarisedLight: Story = {
  name: 'Voice Update — Summarised (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_VOICE_UPDATE,
      status: 'processed',
      transcript:
        'Today I finished the audio upload pipeline and wired up the voice recorder component. The presigned URL flow is working end to end and I can see files landing in Minio. Next up is the transcription task and wiring up the WebSocket events.',
      summary:
        'They completed the audio upload pipeline and voice recorder integration, with the presigned URL flow working end to end. Next focus is the transcription task and WebSocket event wiring.',
    },
  },
};

export const VoiceUpdateFailedDark: Story = {
  name: 'Voice Update — Failed (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_VOICE_UPDATE,
      status: 'failed',
    },
  },
};

export const VoiceUpdateFailedLight: Story = {
  name: 'Voice Update — Failed (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    update: {
      ...BASE_VOICE_UPDATE,
      status: 'failed',
    },
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
