// apps/web/src/stories/domain/digests/DigestCard.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { DigestCard } from '@/components/domain/digests/digest-card';
import type { Digest } from '@/hooks/useDigests';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const DIGEST_WITH_SUMMARY: Digest = {
  id: 'digest-1',
  workspace_id: WORKSPACE_ID,
  digest_date: '2026-06-07',
  summary:
    'The team made solid progress across the board. Two key features landed in staging, one blocker was resolved, and the API refactor is on track for end of week.',
  status: 'sent',
  update_count: 3,
  email_sent_at: '2026-06-07T09:00:00Z',
  created_at: '2026-06-07T09:00:00Z',
  items: [
    {
      id: 'item-1',
      update_id: 'update-1',
      author_name: 'Alice Owen',
      summary_snapshot:
        'Finished the invite flow and deployed to staging. Fixed a race condition in the Redis pub/sub layer.',
    },
    {
      id: 'item-2',
      update_id: 'update-2',
      author_name: 'Bob Chen',
      summary_snapshot:
        'Resolved the Celery worker memory leak. Started on digest email templates.',
    },
    {
      id: 'item-3',
      update_id: 'update-3',
      author_name: 'Carol Singh',
      summary_snapshot:
        'API refactor 60% complete. No blockers but need design review on the new endpoint shape.',
    },
  ],
};

const DIGEST_NO_SUMMARY: Digest = {
  ...DIGEST_WITH_SUMMARY,
  id: 'digest-2',
  summary: null,
  status: 'failed',
  email_sent_at: null,
  items: [],
};

const DIGEST_PROCESSING: Digest = {
  ...DIGEST_WITH_SUMMARY,
  id: 'digest-3',
  summary: null,
  status: 'processing',
  update_count: 2,
  email_sent_at: null,
  items: [],
};

const DIGEST_NO_UPDATES: Digest = {
  ...DIGEST_WITH_SUMMARY,
  id: 'digest-4',
  summary: null,
  status: 'failed',
  update_count: 0,
  email_sent_at: null,
  items: [],
};

// ─── Shell ────────────────────────────────────────────────────────────────────

function CardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Digests/DigestCard',
  component: DigestCard,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/history' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DigestCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const WithSummaryCollapsedDark: Story = {
  name: 'With Summary — Collapsed (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_WITH_SUMMARY,
    workspaceId: WORKSPACE_ID,
  },
};

export const WithSummaryCollapsedLight: Story = {
  name: 'With Summary — Collapsed (Light)',
  parameters: { theme: 'light' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_WITH_SUMMARY,
    workspaceId: WORKSPACE_ID,
  },
};

export const ProcessingDark: Story = {
  name: 'Processing — Generating Summary (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_PROCESSING,
    workspaceId: WORKSPACE_ID,
  },
};

export const FailedNoSummaryDark: Story = {
  name: 'Failed — No Summary (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_NO_SUMMARY,
    workspaceId: WORKSPACE_ID,
  },
};

export const NoUpdatesDark: Story = {
  name: 'No Updates — Zero Count (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_NO_UPDATES,
    workspaceId: WORKSPACE_ID,
  },
};

export const LoadingSkeletonDark: Story = {
  name: 'Loading Skeleton (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_WITH_SUMMARY, // unused — render() takes over
    workspaceId: WORKSPACE_ID,
  },
  render: () => (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 w-full animate-pulse border border-outline-variant bg-surface-high"
          />
        ))}
      </div>
    </div>
  ),
};

export const MultipleDark: Story = {
  name: 'Multiple Cards — History List (Dark)',
  parameters: { theme: 'dark' },
  decorators: [CardShell],
  args: {
    digest: DIGEST_WITH_SUMMARY, // unused — render() takes over
    workspaceId: WORKSPACE_ID,
  },
  render: () => (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <DigestCard digest={DIGEST_WITH_SUMMARY} workspaceId={WORKSPACE_ID} />
        <DigestCard digest={DIGEST_PROCESSING} workspaceId={WORKSPACE_ID} />
        <DigestCard digest={DIGEST_NO_SUMMARY} workspaceId={WORKSPACE_ID} />
      </div>
    </div>
  ),
};
