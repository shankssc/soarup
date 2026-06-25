// apps/web/src/stories/pages/HistoryPage.stories.tsx
// M7 additions: Updates tab, Analytics tab (personal + team) story variants.
// Extends the existing digest-only stories with new tab states.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { DigestCard } from '@/components/domain/digests/digest-card';
import { UpdateCardCompact } from '@/components/domain/updates/update-card-compact';
import { StreakCard } from '@/components/ui/streak-card';
import { Heatmap } from '@/components/ui/heatmap';
import type { Digest } from '@/hooks/useDigests';
import type { UpdateResponse } from '@/hooks/useUpdates';
import type {
  HeatmapDay,
  StreakData,
  MemberParticipationRow,
} from '@/hooks/useAnalytics';

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
    'd-1',
    '2026-06-23',
    'Strong day overall. The history page shipped and analytics is in review.',
    'sent',
    3,
  ),
  makeDigest(
    'd-2',
    '2026-06-20',
    'Focused execution day. Two PRs merged, one blocker resolved.',
    'sent',
    2,
  ),
  makeDigest('d-3', '2026-06-19', null, 'failed', 0),
  makeDigest(
    'd-4',
    '2026-06-18',
    'Team aligned on the digest pipeline design. Implementation started.',
    'sent',
    4,
  ),
];

const makeUpdate = (
  id: string,
  name: string,
  date: string,
  content: string,
): UpdateResponse => ({
  id,
  workspace_id: WORKSPACE_ID,
  user_id: `user-${id}`,
  content,
  mode: 'text',
  status: 'processed',
  summary: `${name} made progress on their assigned tasks.`,
  transcript: null,
  audio_duration_seconds: null,
  update_date: date,
  created_at: `${date}T09:00:00Z`,
  updated_at: `${date}T09:00:00Z`,
  author_name: name,
  author_avatar_url: null,
});

const UPDATES: UpdateResponse[] = [
  makeUpdate(
    '1',
    'Jane Doe',
    '2026-06-23',
    'Finished the history page component. Cursor pagination working end-to-end.',
  ),
  makeUpdate(
    '2',
    'Alex Kim',
    '2026-06-23',
    'Reviewed the analytics PR and left comments on the streak edge case.',
  ),
  makeUpdate(
    '3',
    'Jane Doe',
    '2026-06-20',
    'Started on the heatmap SVG component. Dark/light mode toggle working.',
  ),
  makeUpdate(
    '4',
    'Sam Chen',
    '2026-06-20',
    'Fixed the MutationObserver timing bug in the heatmap initial render.',
  ),
];

function makeHeatmapDays(weeks: number): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const today = new Date();
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const r = Math.random();
    let count = 0;
    let intensity: 0 | 1 | 2 | 3 = 0;
    if (r > 0.6) {
      count = 1;
      intensity = 1;
    }
    if (r > 0.8) {
      count = 2;
      intensity = 2;
    }
    if (r > 0.92) {
      count = 4;
      intensity = 3;
    }
    days.push({ date: d.toISOString().split('T')[0], count, intensity });
  }
  return days;
}

const STREAK: StreakData = {
  current_streak: 14,
  best_streak: 21,
  total_submissions: 87,
  last_submission_date: '2026-06-23',
};

const MEMBERS: MemberParticipationRow[] = [
  {
    user_id: 'u1',
    full_name: 'Jane Doe',
    avatar_url: null,
    current_streak: 14,
    participation_rate_30d: 0.95,
    submissions_30d: 28,
    sparkline: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  },
  {
    user_id: 'u2',
    full_name: 'Alex Kim',
    avatar_url: null,
    current_streak: 5,
    participation_rate_30d: 0.73,
    submissions_30d: 22,
    sparkline: [0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1],
  },
  {
    user_id: 'u3',
    full_name: 'Sam Chen',
    avatar_url: null,
    current_streak: 2,
    participation_rate_30d: 0.4,
    submissions_30d: 12,
    sparkline: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  },
  {
    user_id: 'u4',
    full_name: 'Priya Nair',
    avatar_url: null,
    current_streak: 0,
    participation_rate_30d: 0.1,
    submissions_30d: 3,
    sparkline: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
];

// ─── Sub-components (inlined for stories — mirrors history/page.tsx) ──────────

function StatCard({
  value,
  label,
  highlight = false,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="shadow-card bg-surface-high p-4 text-center">
      <span
        className={[
          'font-headline text-[22px] tabular-nums',
          highlight ? 'text-primary' : 'text-on-surface',
        ].join(' ')}
      >
        {value}
      </span>
      <p className="mt-1 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
        {label}
      </p>
    </div>
  );
}

function SparkLine({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-6 flex-shrink-0 items-end gap-px" aria-hidden="true">
      {data.map((count, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm"
          style={{
            height: `${Math.max((count / max) * 100, count > 0 ? 15 : 5)}%`,
            backgroundColor:
              count > 0 ? 'var(--color-primary)' : 'var(--color-surface-highest)',
          }}
        />
      ))}
    </div>
  );
}

function MemberRow({ member }: { member: MemberParticipationRow }) {
  return (
    <div className="shadow-card flex items-center gap-4 bg-surface-high px-4 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-primary-on-container">
        {member.full_name?.[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="min-w-0 flex-1 truncate font-body text-[13px] text-on-surface">
        {member.full_name}
      </span>
      <div className="flex-shrink-0 text-right">
        <span className="font-label text-[12px] font-bold tabular-nums text-primary">
          {member.current_streak}d
        </span>
        <p className="font-label text-[9px] text-outline">streak</p>
      </div>
      <div className="w-12 flex-shrink-0 text-right">
        <span className="font-label text-[12px] tabular-nums text-on-surface">
          {Math.round(member.participation_rate_30d * 100)}%
        </span>
        <p className="font-label text-[9px] text-outline">30d</p>
      </div>
      <SparkLine data={member.sparkline} />
    </div>
  );
}

// ─── Page mode ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 px-6 py-8">
          <Story />
        </main>
      </div>
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="min-h-screen bg-[#ebfdfc]">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 px-6 py-8">
          <Story />
        </main>
      </div>
    </div>
  );
};

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function HistoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="font-headline text-[24px] text-on-surface">History</h1>
      {children}
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

// ─── Digests tab (existing) ───────────────────────────────────────────────────

export const WithDigestsDark: Story = {
  name: 'Digests tab — with digests (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <p className="-mt-3 font-body text-[13px] text-on-surface-variant">
        4 digests generated
      </p>
      <div className="flex flex-col gap-3">
        {DIGESTS.map((d) => (
          <DigestCard key={d.id} digest={d} workspaceId={WORKSPACE_ID} />
        ))}
      </div>
      <div className="flex justify-center pt-2">
        <button
          type="button"
          className="border border-outline-variant px-6 py-2.5 font-label text-[12px] font-medium uppercase tracking-[0.06em] text-on-surface-variant transition-colors duration-150 hover:border-primary hover:text-primary"
        >
          Load more
        </button>
      </div>
    </HistoryLayout>
  ),
};

export const WithDigestsLight: Story = {
  name: 'Digests tab — with digests (Light)',
  decorators: [light],
  render: WithDigestsDark.render,
};

export const DigestsEmptyDark: Story = {
  name: 'Digests tab — empty state (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
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
    </HistoryLayout>
  ),
};

export const DigestsLoadingDark: Story = {
  name: 'Digests tab — loading skeleton (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 w-full animate-pulse border border-outline-variant bg-surface-high"
          />
        ))}
      </div>
    </HistoryLayout>
  ),
};

// ─── Updates tab ─────────────────────────────────────────────────────────────

export const UpdatesTabDark: Story = {
  name: 'Updates tab — feed (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <div className="flex items-center gap-2">
        {['7 days', '30 days', '90 days'].map((label, i) => (
          <button
            key={label}
            type="button"
            className={[
              'rounded-full px-3 py-1 font-label text-[11px] uppercase tracking-[0.1em] transition-colors duration-150',
              i === 1
                ? 'bg-primary-container text-primary-on-container'
                : 'border border-outline-variant text-outline',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {UPDATES.map((u) => (
          <UpdateCardCompact key={u.id} update={u} workspaceId={WORKSPACE_ID} />
        ))}
      </div>
    </HistoryLayout>
  ),
};

export const UpdatesTabLight: Story = {
  name: 'Updates tab — feed (Light)',
  decorators: [light],
  render: UpdatesTabDark.render,
};

export const UpdatesTabEmptyDark: Story = {
  name: 'Updates tab — empty state (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span
          className="material-symbols-outlined text-[40px] text-on-surface-variant"
          aria-hidden="true"
        >
          history
        </span>
        <p className="max-w-xs font-body text-[14px] text-on-surface-variant">
          No updates in this period.
        </p>
      </div>
    </HistoryLayout>
  ),
};

export const UpdatesTabLoadingDark: Story = {
  name: 'Updates tab — loading skeleton (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 w-full animate-pulse border border-outline-variant bg-surface-high"
          />
        ))}
      </div>
    </HistoryLayout>
  ),
};

// ─── Analytics tab — personal ─────────────────────────────────────────────────

export const AnalyticsPersonalDark: Story = {
  name: 'Analytics tab — My stats (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <StreakCard streak={STREAK} />
      <Heatmap
        days={makeHeatmapDays(52)}
        weeks={52}
        label="Your activity — last 52 weeks"
      />
    </HistoryLayout>
  ),
};

export const AnalyticsPersonalLight: Story = {
  name: 'Analytics tab — My stats (Light)',
  decorators: [light],
  render: () => (
    <HistoryLayout>
      <StreakCard streak={STREAK} />
      <Heatmap
        days={makeHeatmapDays(52)}
        weeks={52}
        label="Your activity — last 52 weeks"
      />
    </HistoryLayout>
  ),
};

export const AnalyticsPersonalLoadingDark: Story = {
  name: 'Analytics tab — My stats loading (Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-24 w-full animate-pulse border border-outline-variant bg-surface-high"
          />
        ))}
      </div>
    </HistoryLayout>
  ),
};

// ─── Analytics tab — team ─────────────────────────────────────────────────────

export const AnalyticsTeamDark: Story = {
  name: 'Analytics tab — Team (admin, Dark)',
  decorators: [dark],
  render: () => (
    <HistoryLayout>
      <div className="grid grid-cols-3 gap-4">
        <StatCard value="82%" label="Participation (30d)" highlight />
        <StatCard value="4.2" label="Avg updates/day" />
        <StatCard value="12" label="Active members" />
      </div>
      <Heatmap
        days={makeHeatmapDays(12)}
        weeks={12}
        label="Team activity — last 12 weeks"
      />
      <div className="flex flex-col gap-2">
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Members
        </p>
        {MEMBERS.map((m) => (
          <MemberRow key={m.user_id} member={m} />
        ))}
      </div>
    </HistoryLayout>
  ),
};

export const AnalyticsTeamLight: Story = {
  name: 'Analytics tab — Team (admin, Light)',
  decorators: [light],
  render: AnalyticsTeamDark.render,
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileDark: Story = {
  name: 'Mobile — Digests tab (Dark)',
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [dark],
  render: WithDigestsDark.render,
};
