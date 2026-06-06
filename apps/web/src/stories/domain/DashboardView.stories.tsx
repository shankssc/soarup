// apps/web/src/stories/domain/DashboardView.stories.tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { DashboardView } from '@/components/domain/dashboard/dashboard-view';
import { useAuthStore } from '@/hooks/useAuth';
import { MOCK_USER, MOCK_TOKENS } from '../../../tests/mocks/user';
import type { UpdateResponse } from '@/hooks/useUpdates';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_UPDATE_PENDING: UpdateResponse = {
  id: 'update-001',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content:
    'Finished the API integration for the workspace switcher and started on the dashboard layout tokens.',
  mode: 'text',
  status: 'pending',
  summary: null,
  transcript: null,
  audio_duration_seconds: null,
  update_date: '2026-05-21',
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  author_name: 'Suyash Chaudhary',
  author_avatar_url: null,
};

const MOCK_UPDATE_PROCESSING: UpdateResponse = {
  ...MOCK_UPDATE_PENDING,
  id: 'update-002',
  status: 'processing',
};

const MOCK_UPDATE_PROCESSED: UpdateResponse = {
  ...MOCK_UPDATE_PENDING,
  id: 'update-003',
  status: 'processed',
  summary:
    'They completed the API integration for the workspace switcher and began work on the dashboard layout token system, focusing on the asymmetric border radius logic for primary buttons.',
};

const MOCK_UPDATE_FAILED: UpdateResponse = {
  ...MOCK_UPDATE_PENDING,
  id: 'update-004',
  status: 'failed',
};

const MOCK_TEAMMATE_UPDATE: UpdateResponse = {
  id: 'update-005',
  workspace_id: 'workspace-123',
  user_id: 'user-456',
  content:
    'Reviewed the PR for the auth middleware and left some comments. Planning to start on the Redis pub/sub integration tomorrow.',
  mode: 'text',
  status: 'processed',
  summary:
    'They reviewed the auth middleware PR with comments and are planning to begin the Redis pub/sub integration next.',
  transcript: null,
  audio_duration_seconds: null,
  update_date: '2026-05-21',
  created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  author_name: 'Alex Kim',
  author_avatar_url: null,
};

const MOCK_VOICE_UPDATE_PENDING: UpdateResponse = {
  id: 'update-006',
  workspace_id: 'workspace-123',
  user_id: 'user-123',
  content: '',
  mode: 'voice',
  status: 'pending',
  summary: null,
  transcript: null,
  audio_duration_seconds: 47,
  update_date: '2026-05-21',
  created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  author_name: 'Suyash Chaudhary',
  author_avatar_url: null,
};

const MOCK_VOICE_UPDATE_PROCESSED: UpdateResponse = {
  ...MOCK_VOICE_UPDATE_PENDING,
  id: 'update-007',
  status: 'processed',
  transcript:
    'Today I finished the audio upload pipeline and wired up the voice recorder component. The presigned URL flow is working end to end and I can see files landing in Minio.',
  summary:
    'They completed the audio upload pipeline and voice recorder integration, with presigned URL flow working end to end and files successfully landing in Minio.',
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
      <div className="mx-auto max-w-[800px]">
        <Story />
      </div>
    </div>
  );
}

// ─── Shared no-op handlers ────────────────────────────────────────────────────

const noop = async () => {};

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Dashboard/DashboardView',
  component: DashboardView,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  args: {
    updates: [],
    isLoading: false,
    hasSubmittedToday: false,
    showForm: false,
    showVoiceRecorder: false,
    currentUserId: 'user-123',
    workspaceId: 'workspace-123',
    todayLabel: 'Thursday, 21 May',
    today: '2026-05-21',
    pendingMembers: [],
    onSubmitClick: noop,
    onVoiceClick: noop,
    onFormSubmit: noop,
    onFormCancel: noop,
    onVoiceSuccess: noop,
    onVoiceCancel: noop,
    onEdit: noop,
    onDelete: noop,
    isSubmitting: false,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DashboardView>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Empty state ──────────────────────────────────────────────────────────────

export const EmptyStateDark: Story = {
  name: 'Empty State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
};

export const EmptyStateLight: Story = {
  name: 'Empty State (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
};

// ─── Form open ────────────────────────────────────────────────────────────────

export const FormOpenDark: Story = {
  name: 'Update Form Open (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: { showForm: true },
};

// ─── Voice recorder open ──────────────────────────────────────────────────────

export const VoiceRecorderOpenDark: Story = {
  name: 'Voice Recorder Open (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: { showVoiceRecorder: true },
};

export const VoiceRecorderOpenLight: Story = {
  name: 'Voice Recorder Open (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: { showVoiceRecorder: true },
};

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export const LoadingDark: Story = {
  name: 'Loading Skeleton (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: { isLoading: true },
};

// ─── With text updates ────────────────────────────────────────────────────────

export const WithPendingUpdateDark: Story = {
  name: 'With Pending Update (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_PENDING],
    hasSubmittedToday: true,
  },
};

export const WithProcessingUpdateDark: Story = {
  name: 'With Processing Update (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_PROCESSING],
    hasSubmittedToday: true,
  },
};

export const WithSummarisedUpdateDark: Story = {
  name: 'With Summarised Update (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_PROCESSED, MOCK_TEAMMATE_UPDATE],
    hasSubmittedToday: true,
  },
};

export const WithSummarisedUpdateLight: Story = {
  name: 'With Summarised Update (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_PROCESSED, MOCK_TEAMMATE_UPDATE],
    hasSubmittedToday: true,
  },
};

export const WithFailedUpdateDark: Story = {
  name: 'With Failed Update (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_FAILED],
    hasSubmittedToday: true,
  },
};

// ─── With voice updates ───────────────────────────────────────────────────────

export const WithVoiceUpdatePendingDark: Story = {
  name: 'With Voice Update — Pending (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_VOICE_UPDATE_PENDING],
    hasSubmittedToday: true,
  },
};

export const WithVoiceUpdateProcessedDark: Story = {
  name: 'With Voice Update — Summarised (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_VOICE_UPDATE_PROCESSED, MOCK_TEAMMATE_UPDATE],
    hasSubmittedToday: true,
  },
};

export const WithVoiceUpdateProcessedLight: Story = {
  name: 'With Voice Update — Summarised (Light)',
  parameters: { theme: 'light' },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_VOICE_UPDATE_PROCESSED, MOCK_TEAMMATE_UPDATE],
    hasSubmittedToday: true,
  },
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileDark: Story = {
  name: 'Dashboard — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_PROCESSED, MOCK_TEAMMATE_UPDATE],
    hasSubmittedToday: true,
  },
};

export const MobileLight: Story = {
  name: 'Dashboard — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [DashboardShell, withAuthStore()],
  args: {
    updates: [MOCK_UPDATE_PROCESSED, MOCK_TEAMMATE_UPDATE],
    hasSubmittedToday: true,
  },
};
