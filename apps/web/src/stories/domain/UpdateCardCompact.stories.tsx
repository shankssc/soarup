// apps/web/src/stories/domain/updates/UpdateCardCompact.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { UpdateCardCompact } from '@/components/domain/updates/update-card-compact';
import type { UpdateResponse } from '@/hooks/useUpdates';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const BASE_UPDATE: UpdateResponse = {
  id: 'update-compact-1',
  workspace_id: WORKSPACE_ID,
  user_id: 'user-123',
  content:
    'Finished the history page component. Cursor pagination is working end-to-end. Will start the analytics tab tomorrow and wire up the heatmap.',
  mode: 'text',
  status: 'processed',
  summary:
    'They completed the history page component with working cursor pagination and will begin the analytics tab next.',
  transcript: null,
  audio_duration_seconds: null,
  update_date: '2026-06-23',
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  author_name: 'Jane Doe',
  author_avatar_url: null,
};

const VOICE_UPDATE: UpdateResponse = {
  ...BASE_UPDATE,
  id: 'update-compact-2',
  mode: 'voice',
  content: '',
  audio_duration_seconds: 94,
  summary:
    'They reviewed the analytics PR and found an edge case in the streak calculation on non-digest days.',
  transcript:
    'Yeah so today I went through the analytics PR and found that the streak calculation has an edge case on Saturdays when the workspace runs Monday to Friday. The algorithm needs to skip Saturday when walking backwards. Going to fix it tomorrow morning before standup.',
};

const PENDING_UPDATE: UpdateResponse = {
  ...BASE_UPDATE,
  id: 'update-compact-3',
  status: 'pending',
  summary: null,
};

const PROCESSING_UPDATE: UpdateResponse = {
  ...BASE_UPDATE,
  id: 'update-compact-4',
  status: 'processing',
  summary: null,
};

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <Story />
      </div>
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="min-h-screen bg-[#ebfdfc] p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <Story />
      </div>
    </div>
  );
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Updates/UpdateCardCompact',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const TextCollapsedDark: Story = {
  name: 'Text update — collapsed (Dark)',
  decorators: [dark],
  render: () => <UpdateCardCompact update={BASE_UPDATE} workspaceId={WORKSPACE_ID} />,
};

export const TextCollapsedLight: Story = {
  name: 'Text update — collapsed (Light)',
  decorators: [light],
  render: () => <UpdateCardCompact update={BASE_UPDATE} workspaceId={WORKSPACE_ID} />,
};

export const VoiceCollapsedDark: Story = {
  name: 'Voice update — collapsed (Dark)',
  decorators: [dark],
  render: () => <UpdateCardCompact update={VOICE_UPDATE} workspaceId={WORKSPACE_ID} />,
};

export const VoiceCollapsedLight: Story = {
  name: 'Voice update — collapsed (Light)',
  decorators: [light],
  render: () => <UpdateCardCompact update={VOICE_UPDATE} workspaceId={WORKSPACE_ID} />,
};

export const PendingDark: Story = {
  name: 'Pending — no summary yet (Dark)',
  decorators: [dark],
  render: () => (
    <UpdateCardCompact update={PENDING_UPDATE} workspaceId={WORKSPACE_ID} />
  ),
};

export const ProcessingDark: Story = {
  name: 'Processing — summary incoming (Dark)',
  decorators: [dark],
  render: () => (
    <UpdateCardCompact update={PROCESSING_UPDATE} workspaceId={WORKSPACE_ID} />
  ),
};

export const FeedDark: Story = {
  name: 'Feed — multiple cards (Dark)',
  decorators: [dark],
  render: () => (
    <>
      <UpdateCardCompact update={BASE_UPDATE} workspaceId={WORKSPACE_ID} />
      <UpdateCardCompact update={VOICE_UPDATE} workspaceId={WORKSPACE_ID} />
      <UpdateCardCompact update={PENDING_UPDATE} workspaceId={WORKSPACE_ID} />
    </>
  ),
};

export const FeedLight: Story = {
  name: 'Feed — multiple cards (Light)',
  decorators: [light],
  render: () => (
    <>
      <UpdateCardCompact update={BASE_UPDATE} workspaceId={WORKSPACE_ID} />
      <UpdateCardCompact update={VOICE_UPDATE} workspaceId={WORKSPACE_ID} />
      <UpdateCardCompact update={PENDING_UPDATE} workspaceId={WORKSPACE_ID} />
    </>
  ),
};
