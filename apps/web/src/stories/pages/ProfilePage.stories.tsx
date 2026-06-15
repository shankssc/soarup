// apps/web/src/stories/settings/ProfilePage.stories.tsx
// Page-level story for profile settings.
// ProfileSettingsPage uses hooks directly (no view component split)
// so we render the UI statically here using the same layout.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 p-8">
          <Story />
        </main>
      </div>
    </div>
  );
}

// ─── Static profile form ──────────────────────────────────────────────────────
// Mirrors ProfileSettingsPage markup without hooks

function ProfileForm({
  displayName,
  timezone,
  hasAvatar,
  isSaving,
  isDirty,
}: {
  displayName: string;
  timezone: string;
  hasAvatar: boolean;
  isSaving: boolean;
  isDirty: boolean;
}) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="max-w-lg px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl italic text-on-surface">Profile</h1>

      {/* Avatar */}
      <div className="mb-8 flex flex-col items-start gap-3">
        <div className="bg-primary/10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full">
          {hasAvatar ? (
            <div className="h-20 w-20 rounded-full bg-surface-high" />
          ) : (
            <span className="text-2xl font-semibold text-primary">{initials}</span>
          )}
        </div>
        <button className="text-sm text-primary transition-opacity hover:opacity-80">
          Change photo
        </button>
        {hasAvatar && (
          <button className="text-sm text-on-surface-variant transition-colors hover:text-error">
            Remove photo
          </button>
        )}
      </div>

      {/* Display name */}
      <div className="mb-6">
        <label className="mb-2 block text-xs uppercase tracking-widest text-on-surface-variant">
          Display name
        </label>
        <input
          defaultValue={displayName}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-on-surface focus:border-primary focus:outline-none"
        />
      </div>

      {/* Timezone */}
      <div className="mb-8">
        <label className="mb-2 block text-xs uppercase tracking-widest text-on-surface-variant">
          Timezone
        </label>
        <select
          defaultValue={timezone}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-on-surface focus:border-primary focus:outline-none"
        >
          <option value={timezone}>{timezone}</option>
        </select>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          disabled={!isDirty || isSaving}
          className="relative rounded-bl-lg rounded-br-3xl rounded-tl-3xl rounded-tr-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-on transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isSaving ? 'Saving...' : 'Save changes'}
        </button>
        {isDirty && (
          <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
        )}
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Settings/Profile',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/settings/profile' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const NoAvatarDark: Story = {
  name: 'No Avatar — Initials (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Jane Doe"
      timezone="UTC"
      hasAvatar={false}
      isSaving={false}
      isDirty={false}
    />
  ),
};

export const NoAvatarLight: Story = {
  name: 'No Avatar — Initials (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  render: NoAvatarDark.render,
};

export const WithAvatarDark: Story = {
  name: 'With Avatar (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Jane Doe"
      timezone="America/New_York"
      hasAvatar={true}
      isSaving={false}
      isDirty={false}
    />
  ),
};

export const DirtyDark: Story = {
  name: 'Unsaved Changes (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Jane Doe"
      timezone="Europe/London"
      hasAvatar={false}
      isSaving={false}
      isDirty={true}
    />
  ),
};

export const SavingDark: Story = {
  name: 'Saving State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Jane Doe"
      timezone="UTC"
      hasAvatar={false}
      isSaving={true}
      isDirty={true}
    />
  ),
};

export const MobileDark: Story = {
  name: 'Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
  render: NoAvatarDark.render,
};
