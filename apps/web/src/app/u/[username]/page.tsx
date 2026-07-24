// apps/web/src/app/u/[username]/page.tsx
// Server component — generates OG metadata server-side, delegates render to client.

import type { Metadata } from 'next';
import { PublicProfileClient } from './client';

export const runtime = 'edge';

interface Props {
  params: { username: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/profiles/${params.username}`,
      { next: { revalidate: 300 } },
    );

    if (!res.ok) {
      return { title: 'Profile not found — SoarUp' };
    }

    const profile = await res.json();

    const streakText =
      profile.streak.current_streak > 0
        ? `${profile.streak.current_streak} day streak · `
        : '';

    return {
      title: `${profile.full_name ?? profile.username} (@${profile.username}) — SoarUp`,
      description:
        `${streakText}${profile.streak.total_submissions} updates · ` +
        (profile.bio ?? 'Building in public with SoarUp'),
      openGraph: {
        title: `${profile.full_name ?? profile.username} on SoarUp`,
        description:
          `${streakText}${profile.streak.total_submissions} standup updates · ` +
          (profile.bio ?? 'Building in public with SoarUp'),
        url: `${process.env.NEXT_PUBLIC_APP_URL}/u/${params.username}`,
        siteName: 'SoarUp',
        images: profile.avatar_url
          ? [{ url: profile.avatar_url, width: 400, height: 400 }]
          : [],
        type: 'profile',
      },
      twitter: {
        card: 'summary',
        title: `${profile.full_name ?? profile.username} (@${profile.username})`,
        description: `${streakText}${profile.streak.total_submissions} standup updates on SoarUp`,
        images: profile.avatar_url ? [profile.avatar_url] : [],
      },
    };
  } catch {
    return { title: 'SoarUp — Async Standups' };
  }
}

export default function PublicProfilePage({ params }: Props) {
  return <PublicProfileClient username={params.username} />;
}
