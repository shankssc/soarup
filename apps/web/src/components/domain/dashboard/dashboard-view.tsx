// apps/web/src/components/domain/dashboard/dashboard-view.tsx
// Pure presentational component — no data fetching, no hooks.
// Receives all data and callbacks as props so it can be rendered
// in Storybook without needing React Query or auth providers.
'use client';

import { EmptyState } from '@/components/domain/updates/empty-state';
import { UpdateCard } from '@/components/domain/updates/update-card';
import { UpdateForm } from '@/components/domain/updates/update-form';
import type { UpdateResponse } from '@/hooks/useUpdates';

export interface DashboardViewProps {
  updates: UpdateResponse[];
  isLoading: boolean;
  hasSubmittedToday: boolean;
  showForm: boolean;
  currentUserId: string;
  todayLabel: string;
  onSubmitClick: () => void;
  onFormSubmit: (content: string) => Promise<void>;
  onFormCancel: () => void;
  onEdit: (updateId: string, content: string) => Promise<void>;
  onDelete: (updateId: string, updateDate: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function DashboardView({
  updates,
  isLoading,
  hasSubmittedToday,
  showForm,
  currentUserId,
  todayLabel,
  onSubmitClick,
  onFormSubmit,
  onFormCancel,
  onEdit,
  onDelete,
  isSubmitting = false,
}: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-8">
      {/* Date header */}
      <div className="border-b border-outline-variant pb-3">
        <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Today — {todayLabel}
        </h2>
      </div>

      {/* Submission area */}
      {!hasSubmittedToday && (
        <>
          {showForm ? (
            <UpdateForm
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              isSubmitting={isSubmitting}
            />
          ) : (
            <EmptyState onSubmitClick={onSubmitClick} />
          )}
        </>
      )}

      {/* Updates list */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse border border-outline-variant bg-surface-high"
            />
          ))}
        </div>
      ) : updates.length > 0 ? (
        <div className="flex flex-col gap-3">
          {updates.map((update) => (
            <UpdateCard
              key={update.id}
              update={update}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
