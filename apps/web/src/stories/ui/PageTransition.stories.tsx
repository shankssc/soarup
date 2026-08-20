// apps/web/src/stories/ui/PageTransition.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

const meta = {
  title: 'UI/PageTransition',
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="relative min-h-[200px] bg-surface">
      <Story />
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="relative min-h-[200px] bg-[#ebfdfc]">
      <Story />
    </div>
  );
};

// ─── Static bar — shows what the transition bar looks like ───────────────────

function TransitionBar({ progress }: { progress: number }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      <div className="absolute left-0 top-0 h-[2px] w-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export const BarAtStartDark: Story = {
  name: 'Loading bar — start (Dark)',
  decorators: [dark],
  render: () => (
    <div>
      <TransitionBar progress={15} />
      <div className="flex flex-col gap-3 p-8">
        <p className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Page transition — early
        </p>
        <p className="font-body text-sm text-on-surface-variant">
          The cyan bar appears at the top of the viewport on every route change.
        </p>
      </div>
    </div>
  ),
};

export const BarAtMidDark: Story = {
  name: 'Loading bar — mid (Dark)',
  decorators: [dark],
  render: () => (
    <div>
      <TransitionBar progress={60} />
      <div className="flex flex-col gap-3 p-8">
        <p className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Page transition — mid progress
        </p>
      </div>
    </div>
  ),
};

export const BarCompleteDark: Story = {
  name: 'Loading bar — complete (Dark)',
  decorators: [dark],
  render: () => (
    <div>
      <TransitionBar progress={100} />
      <div className="flex flex-col gap-3 p-8">
        <p className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Page transition — complete
        </p>
      </div>
    </div>
  ),
};

export const BarAtStartLight: Story = {
  name: 'Loading bar — start (Light)',
  decorators: [light],
  render: () => (
    <div>
      <TransitionBar progress={15} />
      <div className="flex flex-col gap-3 p-8">
        <p className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Page transition — early
        </p>
        <p className="font-body text-sm text-on-surface-variant">
          In light mode the primary teal bar reads clearly against the pale background.
        </p>
      </div>
    </div>
  ),
};

export const BarAtMidLight: Story = {
  name: 'Loading bar — mid (Light)',
  decorators: [light],
  render: () => (
    <div>
      <TransitionBar progress={60} />
      <div className="flex flex-col gap-3 p-8">
        <p className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Page transition — mid progress
        </p>
      </div>
    </div>
  ),
};
