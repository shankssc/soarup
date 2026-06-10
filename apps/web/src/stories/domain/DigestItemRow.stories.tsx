// apps/web/src/stories/domain/digests/DigestItemRow.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { DigestItemRow } from '@/components/domain/digests/digest-item-row';
import type { DigestItem } from '@/hooks/useDigests';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ITEM_WITH_NAME: DigestItem = {
  id: 'item-1',
  update_id: 'update-1',
  author_name: 'Alice Owen',
  summary_snapshot:
    'Finished the invite flow and deployed to staging. Fixed a race condition in the Redis pub/sub layer that was causing dropped events on reconnect.',
};

const ITEM_NO_NAME: DigestItem = {
  id: 'item-2',
  update_id: 'update-2',
  author_name: null,
  summary_snapshot:
    'Resolved the Celery worker memory leak. Started on digest email templates.',
};

const ITEM_NO_SUMMARY: DigestItem = {
  id: 'item-3',
  update_id: 'update-3',
  author_name: 'Bob Chen',
  summary_snapshot: null,
};

const ITEM_LONG_NAME: DigestItem = {
  id: 'item-4',
  update_id: 'update-4',
  author_name: 'Alexandria Bartholomew-Whitmore',
  summary_snapshot:
    'Completed API refactor. All endpoints now return consistent error shapes.',
};

// ─── Shell ────────────────────────────────────────────────────────────────────

function RowShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl border border-outline-variant bg-surface px-4">
        <Story />
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Digests/DigestItemRow',
  component: DigestItemRow,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DigestItemRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const WithNameDark: Story = {
  name: 'With Author Name (Dark)',
  parameters: { theme: 'dark' },
  decorators: [RowShell],
  args: { item: ITEM_WITH_NAME },
};

export const WithNameLight: Story = {
  name: 'With Author Name (Light)',
  parameters: { theme: 'light' },
  decorators: [RowShell],
  args: { item: ITEM_WITH_NAME },
};

export const WithInitialsDark: Story = {
  name: 'Initials Only — No Avatar (Dark)',
  parameters: { theme: 'dark' },
  decorators: [RowShell],
  args: { item: ITEM_WITH_NAME },
};

export const NoAuthorNameDark: Story = {
  name: 'No Author Name (Dark)',
  parameters: { theme: 'dark' },
  decorators: [RowShell],
  args: { item: ITEM_NO_NAME },
};

export const NoSummaryDark: Story = {
  name: 'No Summary Snapshot (Dark)',
  parameters: { theme: 'dark' },
  decorators: [RowShell],
  args: { item: ITEM_NO_SUMMARY },
};

export const LongNameDark: Story = {
  name: 'Long Author Name (Dark)',
  parameters: { theme: 'dark' },
  decorators: [RowShell],
  args: { item: ITEM_LONG_NAME },
};

export const MultipleRowsDark: Story = {
  name: 'Multiple Rows (Dark)',
  parameters: { theme: 'dark' },
  decorators: [RowShell],
  args: {
    item: ITEM_WITH_NAME,
  },
  render: () => (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl border border-outline-variant bg-surface px-4">
        <DigestItemRow item={ITEM_WITH_NAME} />
        <DigestItemRow item={ITEM_NO_NAME} />
        <DigestItemRow item={ITEM_NO_SUMMARY} />
        <DigestItemRow item={ITEM_LONG_NAME} />
      </div>
    </div>
  ),
};
