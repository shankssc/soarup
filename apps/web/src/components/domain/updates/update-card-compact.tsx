// apps/web/src/components/domain/updates/update-card-compact.tsx
// Read-only compact variant for the history list.
// Distinct from the full UpdateCard used on the dashboard.
// Collapsed by default — click to expand full content + summary + transcript.

'use client';

import * as React from 'react';
import type { UpdateResponse } from '@/hooks/useUpdates';

interface UpdateCardCompactProps {
  update: UpdateResponse;
  workspaceId: string;
}

export function UpdateCardCompact({ update }: UpdateCardCompactProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div
      className="shadow-card card-interactive cursor-pointer rounded-card bg-surface-high p-4"
      onClick={() => setIsExpanded((e) => !e)}
      data-testid="update-card-compact"
    >
      {/* Header row — always visible */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* Avatar initial */}
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-container text-[10px] font-bold text-primary-on-container">
            {update.author_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <span className="truncate font-label text-xs text-on-surface-variant">
            {update.author_name ?? 'Unknown'}
          </span>
          <span className="flex-shrink-0 font-label text-[10px] text-outline">
            {update.update_date}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {update.mode === 'voice' && (
            <span className="rounded-full border border-outline-variant px-1.5 py-0.5 font-label text-[9px] uppercase tracking-[0.15em] text-outline">
              Voice
            </span>
          )}
          <span
            className="material-symbols-outlined text-[14px] text-outline transition-transform duration-200"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
          >
            expand_more
          </span>
        </div>
      </div>

      {/* Collapsed: 2-line content snippet */}
      {!isExpanded && (
        <p className="mt-2 line-clamp-2 font-body text-sm text-on-surface-variant">
          {update.content || 'Voice update — expand to see transcript'}
        </p>
      )}

      {/* Expanded: full content + AI summary + transcript */}
      {isExpanded && (
        <div
          className="mt-3 space-y-3"
          onClick={(e) => e.stopPropagation()} // prevent collapse when clicking links
        >
          {/* Full content */}
          {update.content && (
            <p className="font-body text-sm leading-relaxed text-on-surface">
              {update.content}
            </p>
          )}

          {/* AI summary — italic per design system convention */}
          {update.summary && (
            <div className="border-l-2 border-primary-container pl-3">
              <p className="font-body text-sm italic leading-relaxed text-on-surface-variant">
                {update.summary}
              </p>
            </div>
          )}

          {/* Transcript — voice updates only */}
          {update.mode === 'voice' && update.transcript && (
            <div className="border-t border-outline-variant pt-2">
              <p className="mb-1 font-label text-[9px] uppercase tracking-[0.15em] text-outline">
                Transcript
              </p>
              <p className="font-body text-xs leading-relaxed text-on-surface-variant">
                {update.transcript}
              </p>
            </div>
          )}

          {/* No content fallback */}
          {!update.content && !update.transcript && (
            <p className="font-body text-xs italic text-outline">
              No content available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
