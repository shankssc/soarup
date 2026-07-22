// apps/web/src/stories/settings/MyNotificationToggle.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { MyNotificationToggle } from '@/components/domain/digests/digest-settings-panel';

// ─── Page shell — matches DigestSettingsPage.stories.tsx's wrapper ─────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[800px]">
            <div className="mb-8 flex max-w-lg flex-col gap-8">
              <div className="border-b border-outline-variant pb-3">
                <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
                  Settings — Digest
                </h2>
              </div>
              <Story />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

const noop = () => {};

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Settings/Digest/MyNotificationToggle',
  component: MyNotificationToggle,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/settings/digest' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MyNotificationToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const SubscribedDark: Story = {
  name: 'Subscribed — receiving digests (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    emailNotifications: true,
    isLoading: false,
    isSaving: false,
    onToggle: noop,
  },
};

export const SubscribedLight: Story = {
  name: 'Subscribed — receiving digests (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  args: { ...SubscribedDark.args },
};

export const UnsubscribedDark: Story = {
  name: 'Unsubscribed — e.g. clicked email unsubscribe link (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...SubscribedDark.args,
    emailNotifications: false,
  },
};

export const UnsubscribedLight: Story = {
  name: 'Unsubscribed — e.g. clicked email unsubscribe link (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  args: { ...UnsubscribedDark.args },
};

export const LoadingDark: Story = {
  name: 'Loading — initial preference fetch (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...SubscribedDark.args,
    emailNotifications: undefined,
    isLoading: true,
  },
};

export const SavingDark: Story = {
  name: 'Saving — toggle mid-flight, switch disabled (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...SubscribedDark.args,
    isSaving: true,
  },
};

export const MobileSubscribedDark: Story = {
  name: 'Mobile — Subscribed (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
  args: { ...SubscribedDark.args },
};
