// apps/web/src/stories/ui/StreakCard.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { StreakCard } from '@/components/ui/streak-card';
import type { StreakData } from '@/hooks/useAnalytics';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTIVE_STREAK: StreakData = {
  current_streak: 14,
  best_streak: 21,
  total_submissions: 87,
  last_submission_date: '2026-06-23',
};

const NO_STREAK: StreakData = {
  current_streak: 0,
  best_streak: 8,
  total_submissions: 12,
  last_submission_date: '2026-05-30',
};

const LONG_STREAK: StreakData = {
  current_streak: 112,
  best_streak: 112,
  total_submissions: 250,
  last_submission_date: '2026-06-23',
};

const SINGLE_DAY: StreakData = {
  current_streak: 1,
  best_streak: 1,
  total_submissions: 1,
  last_submission_date: '2026-06-23',
};

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl">
        <Story />
      </div>
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="min-h-screen bg-[#ebfdfc] p-8">
      <div className="max-w-2xl">
        <Story />
      </div>
    </div>
  );
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'UI/StreakCard',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const ActiveStreakDark: Story = {
  name: 'Active streak — 14 days (Dark)',
  decorators: [dark],
  render: () => <StreakCard streak={ACTIVE_STREAK} />,
};

export const ActiveStreakLight: Story = {
  name: 'Active streak — 14 days (Light)',
  decorators: [light],
  render: () => <StreakCard streak={ACTIVE_STREAK} />,
};

export const NoStreakDark: Story = {
  name: 'No current streak (Dark)',
  decorators: [dark],
  render: () => <StreakCard streak={NO_STREAK} />,
};

export const NoStreakLight: Story = {
  name: 'No current streak (Light)',
  decorators: [light],
  render: () => <StreakCard streak={NO_STREAK} />,
};

export const LongStreakDark: Story = {
  name: 'Long streak — 112 days (Dark)',
  decorators: [dark],
  render: () => <StreakCard streak={LONG_STREAK} />,
};

export const SingleDayDark: Story = {
  name: 'First day — singular label (Dark)',
  decorators: [dark],
  render: () => <StreakCard streak={SINGLE_DAY} />,
};
