// apps/web/src/components/domain/digests/digest-card.tsx
// Pure presentational digest card with lazy-loaded collapsible items.

'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import type { Digest } from '@/hooks/useDigests';
import { useDigest } from '@/hooks/useDigests';
import { DigestItemRow } from './digest-item-row';

interface DigestCardProps {
  digest: Digest;
  workspaceId: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: 'bg-primary/10 text-primary',
    processing: 'bg-tertiary/10 text-tertiary',
    failed: 'bg-error/10 text-error',
    pending: 'bg-surface-high text-on-surface-variant',
  };

  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5',
        'font-label text-[10px] font-medium uppercase tracking-[0.08em]',
        styles[status] ?? styles.pending,
      ].join(' ')}
    >
      {status}
    </span>
  );
}

export function DigestCard({ digest, workspaceId }: DigestCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  // Only fetch detail once the user has expanded at least once
  const [fetchEnabled, setFetchEnabled] = React.useState(false);

  const { data: detailData, isLoading: isLoadingItems } = useDigest(
    fetchEnabled ? workspaceId : undefined,
    fetchEnabled ? digest.id : undefined,
  );

  const items = detailData?.items ?? [];

  const formattedDate = (() => {
    try {
      return format(parseISO(digest.digest_date), 'EEEE, d MMMM yyyy');
    } catch {
      return digest.digest_date;
    }
  })();

  function handleToggle() {
    if (!fetchEnabled) setFetchEnabled(true); // trigger fetch on first expand
    setExpanded((prev) => !prev);
  }

  const canExpand = digest.update_count > 0;

  return (
    <div className="shadow-card card-interactive border border-outline-variant bg-surface">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
            {formattedDate}
          </span>
          <div className="flex items-center gap-2">
            <StatusBadge status={digest.status} />
            <span className="font-label text-[11px] text-on-surface-variant">
              {digest.update_count} update{digest.update_count !== 1 ? 's' : ''}
            </span>
            {digest.delivered_to_slack && (
              <span className="flex items-center gap-1 font-label text-[9px] uppercase tracking-[0.1em] text-outline">
                <span
                  className="material-symbols-outlined text-[11px] text-outline"
                  aria-hidden="true"
                >
                  label
                </span>
                Slack
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Team summary */}
      {digest.summary && (
        <div className="mx-4 my-4 border-l-[3px] border-primary pl-3">
          <p className="font-headline text-[14px] italic leading-relaxed text-on-surface">
            {digest.summary}
          </p>
        </div>
      )}

      {/* No summary yet */}
      {!digest.summary && digest.status !== 'sent' && (
        <div className="px-4 py-3">
          <p className="font-body text-[13px] text-on-surface-variant">
            {digest.status === 'processing'
              ? 'Generating digest...'
              : 'No summary available.'}
          </p>
        </div>
      )}

      {/* Expand toggle */}
      {canExpand && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={handleToggle}
            className={[
              'flex items-center gap-1.5',
              'font-label text-[11px] font-medium uppercase tracking-[0.06em]',
              'text-on-surface-variant hover:text-primary',
              'transition-colors duration-150',
            ].join(' ')}
          >
            <span
              className="material-symbols-outlined text-[14px] transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              aria-hidden="true"
            >
              expand_circle_down
            </span>
            {expanded ? 'Hide updates' : `View updates (${digest.update_count})`}
          </button>

          {/* Items list */}
          {expanded && (
            <div className="mt-3">
              {isLoadingItems ? (
                // Skeleton while detail loads
                <div className="flex flex-col gap-2 py-1">
                  {Array.from({ length: Math.min(digest.update_count, 5) }).map(
                    (_, i) => (
                      <div key={i} className="flex gap-3 py-2.5">
                        <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-surface-high" />
                        <div className="flex flex-1 flex-col gap-1.5">
                          <div className="h-2.5 w-20 animate-pulse bg-surface-high" />
                          <div className="h-3 w-full animate-pulse bg-surface-high" />
                          <div className="h-3 w-2/3 animate-pulse bg-surface-high" />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : items.length > 0 ? (
                items.map((item) => <DigestItemRow key={item.id} item={item} />)
              ) : (
                <p className="py-2 font-body text-[13px] text-on-surface-variant">
                  No individual updates available.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
