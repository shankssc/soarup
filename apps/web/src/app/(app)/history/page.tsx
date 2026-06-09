// apps/web/src/app/(app)/history/page.tsx
// History page — paginated digest list powered by useInfiniteQuery.
// Thin data wrapper following the same pattern as dashboard/page.tsx.

'use client';

import { useWorkspace } from '@/hooks/useWorkspace';
import { useDigests } from '@/hooks/useDigests';
import { DigestCard } from '@/components/domain/digests/digest-card';

export default function HistoryPage() {
  const { data: workspace } = useWorkspace();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useDigests(workspace?.id);

  const allDigests = data?.pages.flatMap((page) => page.digests) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      {/* Page header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-[24px] italic text-on-surface">
          Digest history
        </h1>
        {total > 0 && (
          <p className="font-body text-[13px] text-on-surface-variant">
            {total} digest{total !== 1 ? 's' : ''} generated
          </p>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 w-full animate-pulse border border-outline-variant bg-surface-high"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allDigests.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span
            className="material-symbols-outlined text-[40px] text-on-surface-variant"
            aria-hidden="true"
          >
            summarize
          </span>
          <p className="max-w-xs font-body text-[14px] text-on-surface-variant">
            No digests yet. Digests are generated daily when updates exist.
          </p>
        </div>
      )}

      {/* Digest list */}
      {allDigests.map((digest) => (
        <DigestCard key={digest.id} digest={digest} workspaceId={workspace?.id ?? ''} />
      ))}

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className={[
              'px-6 py-2.5',
              'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
              'border border-outline-variant text-on-surface-variant',
              'hover:border-primary hover:text-primary',
              'transition-colors duration-150',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
