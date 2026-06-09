// apps/web/src/components/domain/digests/digest-item-row.tsx
// Pure presentational — renders a single DigestItem within an expanded DigestCard.

'use client';

import type { DigestItem } from '@/hooks/useDigests';

interface DigestItemRowProps {
  item: DigestItem;
}

function AuthorInitials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="bg-primary/10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
      <span className="font-label text-[10px] font-medium text-primary">
        {initials}
      </span>
    </div>
  );
}

export function DigestItemRow({ item }: DigestItemRowProps) {
  return (
    <div className="flex gap-3 border-b border-outline-variant py-2.5 last:border-0">
      {/* Author avatar / initials */}
      <div className="mt-0.5 shrink-0">
        {item.author_name ? (
          <AuthorInitials name={item.author_name} />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-outline-variant">
            <span className="font-label text-[10px] text-on-surface-variant">?</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {item.author_name && (
          <span className="font-label text-[11px] font-medium uppercase tracking-[0.06em] text-primary">
            {item.author_name}
          </span>
        )}
        <p className="line-clamp-2 font-body text-[13px] leading-relaxed text-on-surface-variant">
          {item.summary_snapshot ?? 'No summary available.'}
        </p>
      </div>
    </div>
  );
}
