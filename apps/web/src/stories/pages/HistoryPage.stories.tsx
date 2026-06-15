// apps/web/src/stories/pages/HistoryPage.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { DigestCard } from '@/components/domain/digests/digest-card';
import type { Digest } from '@/hooks/useDigests';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'workspace-123';

const makeDigest = (
  id: string,
  date: string,
  summary: string | null,
  status: string,
  updateCount: number,
): Digest => ({
  id,
  workspace_id: WORKSPACE_ID,
  digest_date: date,
  summary,
  status,
  update_count: updateCount,
  email_sent_at: status === 'sent' ? `${date}T09:00:00Z` : null,
  created_at: `${date}T09:00:00Z`,
  items: [],
});

const DIGESTS: Digest[] = [
  makeDigest(
    'digest-1',
    '2026-06-07',
    'Strong day overall. The invite flow shipped to staging, a Redis race condition was patched, and the API refactor hit the 60% mark.',
    'sent',
    3,
  ),
  makeDigest(
    'digest-2',
    '2026-06-06',
    'Focused execution day. Two PRs merged, one blocker resolved. Good velocity heading into the weekend.',
    'sent',
    2,
  ),
  makeDigest('digest-3', '2026-06-05', null, 'failed', 0),
  makeDigest(
    'digest-4',
    '2026-06-04',
    'Team aligned on the digest pipeline design. Implementation started, Jinja2 templates drafted.',
    'sent',
    4,
  ),
];

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 px-6 py-8">
          <Story />
        </main>
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/History',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/history' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const WithDigestsDark: Story = {
  name: 'With Digests (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-[24px] italic text-on-surface">
          Digest history
        </h1>
        <p className="font-body text-[13px] text-on-surface-variant">
          4 digests generated
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {DIGESTS.map((digest) => (
          <DigestCard key={digest.id} digest={digest} workspaceId={WORKSPACE_ID} />
        ))}
      </div>
      <div className="flex justify-center pt-2">
        <button
          type="button"
          className={[
            'px-6 py-2.5',
            'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
            'border border-outline-variant text-on-surface-variant',
          ].join(' ')}
        >
          Load more
        </button>
      </div>
    </div>
  ),
};

export const WithDigestsLight: Story = {
  name: 'With Digests (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  render: WithDigestsDark.render,
};

export const EmptyStateDark: Story = {
  name: 'Empty State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-[24px] italic text-on-surface">
          Digest history
        </h1>
      </div>
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span
          className="material-symbols-outlined text-[40px] text-on-surface-variant"
          aria-hidden="true"
        >
          summarize
        </span>
        <p className="max-w-xs font-body text-[14px] text-on-surface-variant">
          No digests yet. Digests are generated daily when updates exist.
        </p>
      </div>
    </div>
  ),
};

export const EmptyStateLight: Story = {
  name: 'Empty State (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  render: EmptyStateDark.render,
};

export const LoadingDark: Story = {
  name: 'Loading Skeleton (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-[24px] italic text-on-surface">
          Digest history
        </h1>
      </div>
      <div className="flex flex-col gap-3">
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

export const MobileDark: Story = {
  name: 'Mobile — With Digests (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
  render: WithDigestsDark.render,
};
