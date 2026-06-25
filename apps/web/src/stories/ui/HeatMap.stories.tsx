// apps/web/src/stories/ui/Heatmap.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Heatmap } from '@/components/ui/heatmap';
import type { HeatmapDay } from '@/hooks/useAnalytics';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeHeatmapDays(
  weeks: number,
  pattern: 'empty' | 'sparse' | 'varied' | 'full' = 'varied',
): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const today = new Date();
  const totalDays = weeks * 7;

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    let count = 0;
    let intensity: 0 | 1 | 2 | 3 = 0;

    if (pattern === 'sparse') {
      if (Math.random() > 0.85) {
        count = 1;
        intensity = 1;
      }
    } else if (pattern === 'varied') {
      const r = Math.random();
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
    } else if (pattern === 'full') {
      count = 3;
      intensity = 3;
    }

    days.push({ date: dateStr, count, intensity });
  }
  return days;
}

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="min-h-screen bg-background p-8">
      <Story />
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="min-h-screen bg-[#ebfdfc] p-8">
      <Story />
    </div>
  );
};

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'UI/Heatmap',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const PersonalFullDark: Story = {
  name: 'Personal — 52 weeks varied (Dark)',
  decorators: [dark],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(52, 'varied')}
      weeks={52}
      label="Your activity — last 52 weeks"
    />
  ),
};

export const PersonalFullLight: Story = {
  name: 'Personal — 52 weeks varied (Light)',
  decorators: [light],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(52, 'varied')}
      weeks={52}
      label="Your activity — last 52 weeks"
    />
  ),
};

export const PersonalEmptyDark: Story = {
  name: 'Personal — empty (Dark)',
  decorators: [dark],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(52, 'empty')}
      weeks={52}
      label="Your activity — last 52 weeks"
    />
  ),
};

export const PersonalEmptyLight: Story = {
  name: 'Personal — empty (Light)',
  decorators: [light],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(52, 'empty')}
      weeks={52}
      label="Your activity — last 52 weeks"
    />
  ),
};

export const TeamDark: Story = {
  name: 'Team — 12 weeks (Dark)',
  decorators: [dark],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(12, 'varied')}
      weeks={12}
      label="Team activity — last 12 weeks"
    />
  ),
};

export const TeamLight: Story = {
  name: 'Team — 12 weeks (Light)',
  decorators: [light],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(12, 'varied')}
      weeks={12}
      label="Team activity — last 12 weeks"
    />
  ),
};

export const FullIntensityDark: Story = {
  name: 'All cells — full intensity (Dark)',
  decorators: [dark],
  render: () => (
    <Heatmap
      days={makeHeatmapDays(12, 'full')}
      weeks={12}
      label="Maximum intensity — all days submitted"
    />
  ),
};
