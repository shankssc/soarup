// apps/web/src/components/domain/updates/update-card-compact.tsx
// Read-only compact variant for the history list.
// Distinct from the full UpdateCard used on the dashboard.
// Collapsed by default — click to expand full content + summary + transcript.

'use client';

import * as React from 'react';
import Image from 'next/image';
import type { UpdateResponse } from '@/hooks/useUpdates';

// ---------------------------------------------------------------------------
// Avatar — mirrors UpdateCard's Avatar sub-component
// ---------------------------------------------------------------------------

function Avatar({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const initial = (name ?? '?')[0].toUpperCase();
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-high">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name ?? 'User avatar'}
          width={28}
          height={28}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-label text-[10px] font-bold text-on-surface-variant">
          {initial}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice badge — mirrors UpdateCard's VoiceBadge sub-component
// ---------------------------------------------------------------------------

function VoiceBadge() {
  return (
    <div className="flex items-center gap-1.5 border border-outline-variant px-2 py-1">
      <span
        className="material-symbols-outlined text-[12px] text-on-surface-variant"
        aria-hidden="true"
      >
        mic
      </span>
      <span className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
        Voice
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UpdateCardCompactProps {
  update: UpdateResponse;
  workspaceId: string;
}

export function UpdateCardCompact({ update }: UpdateCardCompactProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isVoice = update.mode === 'voice';

  return (
    <div
      className="shadow-card card-interactive flex cursor-pointer flex-col gap-3 border border-outline-variant bg-surface-high p-4"
      onClick={() => setIsExpanded((e) => !e)}
      data-testid="update-card-compact"
    >
      {/* Header row — always visible */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={update.author_name} avatarUrl={update.author_avatar_url} />
          <span className="truncate font-body text-sm font-medium text-on-surface">
            {update.author_name ?? 'Unknown'}
          </span>
          <span className="flex-shrink-0 font-label text-[10px] tracking-[0.08em] text-on-surface-variant">
            {update.update_date}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isVoice && <VoiceBadge />}
          <span
            className="material-symbols-outlined text-[14px] text-outline transition-transform duration-200"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
            aria-hidden="true"
          >
            expand_more
          </span>
        </div>
      </div>

      {/* Collapsed: 2-line content snippet */}
      {!isExpanded && (
        <p className="line-clamp-2 font-body text-sm leading-relaxed text-on-surface-variant">
          {update.content || 'Voice update — expand to see transcript'}
        </p>
      )}

      {/* Expanded: full content + summary + transcript */}
      {isExpanded && (
        <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
          {/* Full content — text updates only */}
          {!isVoice && update.content && (
            <p className="font-body text-base leading-relaxed text-on-surface">
              {update.content}
            </p>
          )}

          {/* AI summary — matches UpdateCard's summary style exactly */}
          {update.status === 'processed' && update.summary && (
            <div className="border-l-2 border-primary pl-3">
              <p className="font-headline text-sm italic leading-relaxed text-on-surface-variant">
                {update.summary}
              </p>
            </div>
          )}

          {/* Transcript — voice updates only */}
          {isVoice && update.transcript && (
            <div className="border-t border-outline-variant pt-3">
              <p className="mb-2 font-label text-[10px] uppercase tracking-[0.15em] text-outline">
                Transcript
              </p>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                {update.transcript}
              </p>
            </div>
          )}

          {/* No content fallback */}
          {!update.content && !update.transcript && (
            <p className="font-body text-sm italic text-outline">
              No content available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
