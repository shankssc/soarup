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

// ─── Username availability indicator ─────────────────────────────────────────

type AvailabilityState = 'idle' | 'loading' | 'available' | 'taken' | 'own';

function UsernameIndicator({ state }: { state: AvailabilityState }) {
  if (state === 'idle') return null;
  if (state === 'loading') {
    return (
      <span className="material-symbols-outlined animate-spin text-[14px] text-outline">
        progress_activity
      </span>
    );
  }
  if (state === 'available') {
    return (
      <span className="flex items-center gap-1 font-label text-[10px] text-emerald-400">
        <span className="material-symbols-outlined text-[12px]">check_circle</span>
        Available
      </span>
    );
  }
  if (state === 'own') {
    return (
      <span className="flex items-center gap-1 font-label text-[10px] text-emerald-400">
        <span className="material-symbols-outlined text-[12px]">check_circle</span>
        Your current username
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 font-label text-[10px] text-error">
      <span className="material-symbols-outlined text-[12px]">cancel</span>
      Already taken
    </span>
  );
}

// ─── Static profile form ──────────────────────────────────────────────────────

function ProfileForm({
  displayName,
  timezone,
  hasAvatar,
  isSaving,
  isDirty,
  username,
  usernameAvailability,
  bio,
  tagline,
  profilePublic,
  hasUsername,
}: {
  displayName: string;
  timezone: string;
  hasAvatar: boolean;
  isSaving: boolean;
  isDirty: boolean;
  username?: string;
  usernameAvailability?: AvailabilityState;
  bio?: string;
  tagline?: string;
  profilePublic?: boolean;
  hasUsername?: boolean;
}) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const _hasUsername = hasUsername ?? !!username;

  return (
    <div className="max-w-lg px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl italic text-on-surface">Profile</h1>

      {/* Username */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Username
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-outline">@</span>
          <input
            defaultValue={username ?? ''}
            placeholder="your-username"
            className="flex-1 border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface transition-colors focus:border-primary focus:outline-none"
          />
          {usernameAvailability && <UsernameIndicator state={usernameAvailability} />}
        </div>
        <p className="mt-1 font-label text-[10px] text-outline">
          soarup.app/u/{username || 'your-username'}
        </p>
      </div>

      {/* Bio */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Bio
        </label>
        <input
          defaultValue={bio ?? ''}
          placeholder="Full-stack engineer building in public"
          className="w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface transition-colors placeholder:text-outline focus:border-primary focus:outline-none"
        />
      </div>

      {/* Tagline */}
      <div className="mb-6">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Tagline
        </label>
        <input
          defaultValue={tagline ?? ''}
          placeholder="Building in public · Open source"
          className="w-full border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface transition-colors placeholder:text-outline focus:border-primary focus:outline-none"
        />
      </div>

      {/* Public profile toggle */}
      <div className="mb-8 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-body text-sm text-on-surface">Make profile public</p>
            <p className="mt-0.5 font-label text-[11px] text-outline">
              {_hasUsername
                ? `Share your activity at soarup.app/u/${username ?? 'your-username'}`
                : 'Set a username above to enable your public profile'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={profilePublic ?? false}
            disabled={!_hasUsername}
            className={[
              'relative h-6 w-10 flex-shrink-0 rounded-full transition-colors disabled:opacity-40',
              profilePublic ? 'bg-primary' : 'bg-surface-highest',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                profilePublic ? 'translate-x-5' : 'translate-x-1',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Shareable URL when public */}
        {profilePublic && username && (
          <div className="flex items-center gap-2 rounded-card border border-outline-variant bg-surface-high p-3">
            <code className="flex-1 truncate font-label text-xs text-primary">
              soarup.app/u/{username}
            </code>
            <button
              type="button"
              className="flex-shrink-0 font-label text-[10px] uppercase tracking-[0.1em] text-outline transition-colors hover:text-primary"
            >
              Copy
            </button>
            <a
              href={`/u/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 font-label text-[10px] uppercase tracking-[0.1em] text-outline transition-colors hover:text-primary"
            >
              View →
            </a>
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className="mb-8 flex flex-col items-start gap-3">
        <label className="mb-1 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Avatar
        </label>
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
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Display name
        </label>
        <input
          defaultValue={displayName}
          className="w-full border-b border-outline-variant bg-transparent py-2 text-on-surface focus:border-primary focus:outline-none"
        />
      </div>

      {/* Timezone */}
      <div className="mb-8">
        <label className="mb-2 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
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
          className="asymmetric-btn bg-primary px-6 py-2.5 font-label text-[12px] font-medium uppercase tracking-[0.06em] text-primary-on transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
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

// ─── M9 stories ───────────────────────────────────────────────────────────────

export const WithUsernameDark: Story = {
  name: 'Username — Available (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Suyash Chaudhary"
      timezone="America/New_York"
      hasAvatar={false}
      isSaving={false}
      isDirty={true}
      username="suyash"
      usernameAvailability="available"
    />
  ),
};

export const UsernameTakenDark: Story = {
  name: 'Username — Taken (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Suyash Chaudhary"
      timezone="America/New_York"
      hasAvatar={false}
      isSaving={false}
      isDirty={true}
      username="suyash"
      usernameAvailability="taken"
    />
  ),
};

export const UsernameLoadingDark: Story = {
  name: 'Username — Checking (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Suyash Chaudhary"
      timezone="America/New_York"
      hasAvatar={false}
      isSaving={false}
      isDirty={true}
      username="suyash"
      usernameAvailability="loading"
    />
  ),
};

export const PublicEnabledDark: Story = {
  name: 'Public Profile — Enabled (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Suyash Chaudhary"
      timezone="America/New_York"
      hasAvatar={false}
      isSaving={false}
      isDirty={false}
      username="suyash"
      usernameAvailability="own"
      profilePublic={true}
      hasUsername={true}
    />
  ),
};

export const PublicDisabledNoUsernameDark: Story = {
  name: 'Public Profile — Disabled No Username (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Suyash Chaudhary"
      timezone="UTC"
      hasAvatar={false}
      isSaving={false}
      isDirty={false}
      username=""
      profilePublic={false}
      hasUsername={false}
    />
  ),
};

export const WithBioAndTaglineDark: Story = {
  name: 'With Bio and Tagline (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <ProfileForm
      displayName="Suyash Chaudhary"
      timezone="America/New_York"
      hasAvatar={false}
      isSaving={false}
      isDirty={false}
      username="suyash"
      usernameAvailability="own"
      bio="Fullstack engineer building in public"
      tagline="FastAPI · Next.js · AWS"
      profilePublic={false}
      hasUsername={true}
    />
  ),
};
