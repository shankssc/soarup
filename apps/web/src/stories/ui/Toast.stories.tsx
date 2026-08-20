// apps/web/src/stories/ui/Toast.stories.tsx
// Stories for the minimal Toast component used on the public profile empty state.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Toast } from '@/components/ui/toast';

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="relative min-h-[200px] bg-background">
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

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'UI/Toast',
  component: Toast,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof Toast>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const DefaultDark: Story = {
  name: 'Default (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => (
    <Toast
      message="No activity yet — updates will appear here once submitted"
      onDismiss={() => {}}
      duration={999999} // prevent auto-dismiss in Storybook
    />
  ),
};

export const DefaultLight: Story = {
  name: 'Default (Light)',
  parameters: { theme: 'light' },
  decorators: [light],
  render: () => (
    <Toast
      message="No activity yet — updates will appear here once submitted"
      onDismiss={() => {}}
      duration={999999}
    />
  ),
};

export const LongMessageDark: Story = {
  name: 'Long Message (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => (
    <Toast
      message="Your public profile has been updated — changes will be visible at soarup.app/u/your-username within a few minutes"
      onDismiss={() => {}}
      duration={999999}
    />
  ),
};
