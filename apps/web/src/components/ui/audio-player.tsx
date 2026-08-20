// apps/web/src/components/ui/audio-player.tsx
'use client';

import * as React from 'react';
import { Play } from 'lucide-react';
import { useAudioPlaybackUrl } from '@/hooks/useAudio';
import { cn } from '@/lib/utils/cn';

interface AudioPlayerProps {
  workspaceId: string;
  updateId: string;
  durationSeconds?: number | null;
  className?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({
  workspaceId,
  updateId,
  durationSeconds,
  className,
}: AudioPlayerProps) {
  const [isActive, setIsActive] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  // Only fetch playback URL when user activates the player —
  // avoids generating presigned URLs on every card render.
  const { data, isLoading, isError } = useAudioPlaybackUrl(
    workspaceId,
    updateId,
    isActive,
  );

  // Auto-play once URL is available
  React.useEffect(() => {
    if (data?.playback_url && audioRef.current) {
      audioRef.current.play().catch(() => {
        // Autoplay blocked by browser — user can press play manually
      });
    }
  }, [data?.playback_url]);

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* Play button — activates URL fetch on first click */}
      {!(isActive && data?.playback_url) && (
        <button
          onClick={() => setIsActive(true)}
          disabled={isLoading}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center',
            'bg-primary-container text-primary-on-container',
            'transition-all hover:brightness-105',
            'disabled:pointer-events-none disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-2',
          )}
          aria-label="Play audio update"
        >
          {isLoading ? (
            <svg
              className="h-3 w-3 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
          )}
        </button>
      )}

      {/* Scrub bar area — shows native audio element once URL is ready */}
      {isActive && data?.playback_url ? (
        <audio
          ref={audioRef}
          src={data.playback_url}
          controls
          className="h-8 flex-1"
          style={{ colorScheme: 'dark' }}
        />
      ) : (
        <div className="flex flex-1 items-center gap-2">
          <div className="h-px flex-1 bg-outline-variant" />
          {durationSeconds != null && (
            <span className="font-label text-[10px] tabular-nums text-outline">
              {formatDuration(durationSeconds)}
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <span className="font-label text-[10px] uppercase tracking-[0.08em] text-error">
          Failed to load
        </span>
      )}
    </div>
  );
}
