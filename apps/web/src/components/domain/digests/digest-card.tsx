// apps/web/src/components/domain/digests/digest-card.tsx
// Pure presentational digest card with collapsible items toggle.

'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import type { Digest } from '@/hooks/useDigests';
import { DigestItemRow } from './digest-item-row';

interface DigestCardProps {
  digest: Digest;
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

export function DigestCard({ digest }: DigestCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  const formattedDate = (() => {
    try {
      return format(parseISO(digest.digest_date), 'EEEE, d MMMM yyyy');
    } catch {
      return digest.digest_date;
    }
  })();

  const hasItems = digest.items.length > 0;

  return (
    <div className="border border-outline-variant bg-surface">
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
      {hasItems && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
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
              expand_more
            </span>
            {expanded ? 'Hide updates' : `View updates (${digest.items.length})`}
          </button>

          {/* Items list */}
          {expanded && (
            <div className="mt-3">
              {digest.items.map((item) => (
                <DigestItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
