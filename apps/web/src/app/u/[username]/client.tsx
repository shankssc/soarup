// apps/web/src/app/u/[username]/client.tsx
'use client';

import * as React from 'react';
import Image from 'next/image';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { Heatmap } from '@/components/ui/heatmap';
import { Toast } from '@/components/ui/toast';

interface Props {
  username: string;
}

export function PublicProfileClient({ username }: Props) {
  const { data: profile, isLoading, isError } = usePublicProfile(username);
  const [showEmptyToast, setShowEmptyToast] = React.useState(false);

  React.useEffect(() => {
    if (profile && profile.streak.total_submissions === 0) {
      setShowEmptyToast(true);
    }
  }, [profile]);

  if (isLoading) {
    return <PublicProfileSkeleton />;
  }

  if (isError || !profile) {
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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-12">
        {/* Hero */}
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-surface-high text-3xl font-bold text-primary">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.full_name ?? profile.username}
                width={96}
                height={96}
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              (profile.full_name?.[0] ?? profile.username[0]).toUpperCase()
            )}
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate font-headline text-2xl text-on-surface">
              {profile.full_name ?? profile.username}
            </h1>
            <p className="font-label text-sm text-outline">@{profile.username}</p>
            {profile.bio && (
              <p className="font-body text-sm italic text-on-surface-variant">
                {profile.bio}
              </p>
            )}
            {profile.tagline && (
              <span className="mt-1 inline-block rounded-full border border-outline-variant px-2 py-0.5 font-label text-[11px] text-outline">
                {profile.tagline}
              </span>
            )}
          </div>

          {/* Built with SoarUp badge */}
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
            <p className="font-headline text-2xl text-primary">
              {profile.streak.current_streak}
            </p>
            <p className="mt-0.5 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
              day streak
            </p>
          </div>
          <div className="shadow-card rounded-card bg-surface-high px-4 py-3">
            <p className="font-headline text-2xl text-on-surface">
              {profile.streak.best_streak}
            </p>
            <p className="mt-0.5 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
              best
            </p>
          </div>
          <div className="shadow-card rounded-card bg-surface-high px-4 py-3">
            <p className="font-headline text-2xl text-on-surface">
              {profile.streak.total_submissions}
            </p>
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
            <Heatmap days={profile.heatmap} weeks={profile.heatmap_weeks} />
          </div>
        </div>

        {/* Footer CTA */}
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
      </div>

      {/* Empty state toast */}
      {showEmptyToast && (
        <Toast
          message="No activity yet — updates will appear here once submitted"
          onDismiss={() => setShowEmptyToast(false)}
        />
      )}
    </div>
  );
}

function PublicProfileSkeleton() {
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
