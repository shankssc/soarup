// apps/web/src/stories/pages/PublicProfilePage.stories.tsx
// Static render of the public profile page at /u/:username.
// Mirrors PublicProfileClient markup without hooks.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import Image from 'next/image';

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="min-h-screen bg-background">
      <Story />
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="min-h-screen bg-[#ebfdfc]">
      <Story />
    </div>
  );
};

// ─── Static components ────────────────────────────────────────────────────────

function StaticHeatmap() {
  const weeks = 26;
  const days = 7;
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: weeks }).map((_, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {Array.from({ length: days }).map((_, di) => {
            const intensity = Math.floor(Math.random() * 4);
            const bg =
              intensity === 0
                ? 'bg-surface-highest'
                : intensity === 1
                  ? 'bg-primary/20'
                  : intensity === 2
                    ? 'bg-primary/50'
                    : 'bg-primary';
            return <div key={di} className={`h-[10px] w-[10px] rounded-[2px] ${bg}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

function StaticToast({ message }: { message: string }) {
  return (
    <div
      className="shadow-card fixed bottom-6 left-1/2 z-50 mx-4 flex w-full max-w-sm -translate-x-1/2 items-center gap-3 rounded-card border border-outline-variant bg-surface-highest px-5 py-3"
      role="status"
      aria-live="polite"
    >
      <p className="flex-1 font-body text-sm text-on-surface-variant">{message}</p>
      <button
        type="button"
        className="flex-shrink-0 text-outline transition-colors hover:text-on-surface"
        aria-label="Dismiss"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}

function PublicProfileView({
  username,
  fullName,
  bio,
  tagline,
  avatarUrl,
  currentStreak,
  bestStreak,
  totalSubmissions,
  showEmptyToast,
}: {
  username: string;
  fullName: string | null;
  bio: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  currentStreak: number;
  bestStreak: number;
  totalSubmissions: number;
  showEmptyToast?: boolean;
}) {
  const initial = (fullName?.[0] ?? username[0]).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      {/* Hero */}
      <div className="flex items-start gap-6">
        <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-surface-high text-3xl font-bold text-primary">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={fullName ?? username}
              width={80}
              height={80}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initial
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="truncate font-headline text-2xl text-on-surface">
            {fullName ?? username}
          </h1>
          <p className="font-label text-sm text-outline">@{username}</p>
          {bio && (
            <p className="font-body text-sm italic text-on-surface-variant">{bio}</p>
          )}
          {tagline && (
            <span className="mt-1 inline-block rounded-full border border-outline-variant px-2 py-0.5 font-label text-[11px] text-outline">
              {tagline}
            </span>
          )}
        </div>

        <a
          href="/"
          className="flex-shrink-0 font-label text-[10px] uppercase tracking-[0.15em] text-outline transition-colors hover:text-primary"
        >
          Built with SoarUp
        </a>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="shadow-card rounded-card bg-surface-high px-4 py-3">
          <p className="font-headline text-2xl text-primary">{currentStreak}</p>
          <p className="mt-0.5 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
            day streak
          </p>
        </div>
        <div className="shadow-card rounded-card bg-surface-high px-4 py-3">
          <p className="font-headline text-2xl text-on-surface">{bestStreak}</p>
          <p className="mt-0.5 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
            best
          </p>
        </div>
        <div className="shadow-card rounded-card bg-surface-high px-4 py-3">
          <p className="font-headline text-2xl text-on-surface">{totalSubmissions}</p>
          <p className="mt-0.5 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
            updates
          </p>
        </div>
      </div>

      {/* Heatmap */}
      <div className="space-y-3">
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Activity — last 52 weeks
        </p>
        <div className="shadow-card overflow-x-auto rounded-card bg-surface-high p-4">
          <StaticHeatmap />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-outline-variant pt-6">
        <p className="font-label text-[10px] text-outline">
          © SoarUp {new Date().getFullYear()}
        </p>
        <a
          href="/signup"
          className="asymmetric-btn text-on-primary bg-primary px-5 py-2 font-label text-xs uppercase tracking-[0.15em]"
        >
          Sign up to SoarUp →
        </a>
      </div>

      {/* Empty state toast */}
      {showEmptyToast && (
        <StaticToast message="No activity yet — updates will appear here once submitted" />
      )}
    </div>
  );
}

function NotFoundView() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-2 text-center">
        <p className="font-headline text-2xl text-on-surface">Profile not found</p>
        <p className="font-body text-sm text-on-surface-variant">
          This profile doesn`t exist or hasn`t been made public yet.
        </p>
        <a href="/" className="font-label text-xs text-primary hover:underline">
          Go to SoarUp →
        </a>
      </div>
    </div>
  );
}

function SkeletonView() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-8 px-6 py-12">
      <div className="flex items-start gap-6">
        <div className="h-24 w-24 flex-shrink-0 rounded-full bg-surface-high" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-48 rounded-card bg-surface-high" />
          <div className="h-4 w-24 rounded-card bg-surface-high" />
          <div className="h-4 w-64 rounded-card bg-surface-high" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 rounded-card bg-surface-high" />
        <div className="h-20 rounded-card bg-surface-high" />
        <div className="h-20 rounded-card bg-surface-high" />
      </div>
      <div className="h-40 rounded-card bg-surface-high" />
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Public Profile',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/u/suyash' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const WithActivityDark: Story = {
  name: 'With Activity (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => (
    <PublicProfileView
      username="suyash"
      fullName="Suyash Chaudhary"
      bio="Fullstack engineer building in public"
      tagline="Building in public · Open source"
      avatarUrl={null}
      currentStreak={14}
      bestStreak={30}
      totalSubmissions={87}
    />
  ),
};

export const WithActivityLight: Story = {
  name: 'With Activity (Light)',
  parameters: { theme: 'light' },
  decorators: [light],
  render: WithActivityDark.render,
};

export const WithBioAndTaglineDark: Story = {
  name: 'With Bio and Tagline (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => (
    <PublicProfileView
      username="suyash"
      fullName="Suyash Chaudhary"
      bio="Fullstack engineer · ex-auntEDNA · building SoarUp"
      tagline="FastAPI · Next.js · AWS"
      avatarUrl={null}
      currentStreak={7}
      bestStreak={21}
      totalSubmissions={45}
    />
  ),
};

export const NoAvatarDark: Story = {
  name: 'No Avatar — Initials (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => (
    <PublicProfileView
      username="suyash"
      fullName="Suyash Chaudhary"
      bio={null}
      tagline={null}
      avatarUrl={null}
      currentStreak={5}
      bestStreak={12}
      totalSubmissions={33}
    />
  ),
};

export const EmptyStateDark: Story = {
  name: 'Empty State — Zero Submissions (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => (
    <PublicProfileView
      username="newuser"
      fullName="New User"
      bio="Just getting started"
      tagline={null}
      avatarUrl={null}
      currentStreak={0}
      bestStreak={0}
      totalSubmissions={0}
      showEmptyToast={true}
    />
  ),
};

export const LoadingSkeletonDark: Story = {
  name: 'Loading Skeleton (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => <SkeletonView />,
};

export const NotFoundDark: Story = {
  name: '404 — Profile Not Found (Dark)',
  parameters: { theme: 'dark' },
  decorators: [dark],
  render: () => <NotFoundView />,
};

export const MobileDark: Story = {
  name: 'Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [dark],
  render: WithActivityDark.render,
};

export const MobileLight: Story = {
  name: 'Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [light],
  render: WithActivityDark.render,
};
