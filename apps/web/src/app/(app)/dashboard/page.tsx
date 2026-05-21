// apps/web/src/app/(app)/dashboard/page.tsx
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  useUpdates,
  useSubmitUpdate,
  useEditUpdate,
  useDeleteUpdate,
} from '@/hooks/useUpdates';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDashboardUpdates } from '@/hooks/useDashboardUpdates';
import { EmptyState } from '@/components/domain/updates/empty-state';
import { UpdateForm } from '@/components/domain/updates/update-form';
import { UpdateCard } from '@/components/domain/updates/update-card';

export default function DashboardPage() {
  const { user, tokens } = useAuth();
  const { data: workspace } = useWorkspace();
  const [showForm, setShowForm] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLabel = format(new Date(), 'EEEE, d MMMM');

  const { data: updatesData, isLoading } = useUpdates(workspace?.id, today);
  const updates = updatesData?.updates ?? [];

  const submitMutation = useSubmitUpdate(workspace?.id ?? '');
  const editMutation = useEditUpdate(workspace?.id ?? '');
  const deleteMutation = useDeleteUpdate(workspace?.id ?? '');

  // Connect WebSocket — workspace-scoped, reconnects automatically with
  // exponential backoff. Publishes events to the registry for handlers below.
  useWebSocket({
    workspaceId: workspace?.id,
    accessToken: tokens?.access_token,
    enabled: !!workspace?.id && !!tokens?.access_token,
  });

  // Register update.status_changed handler — patches React Query cache
  // in place when AI processing transitions arrive over the WebSocket.
  useDashboardUpdates(workspace?.id);

  // Hide form + CTA once user has submitted today
  const hasSubmittedToday = updates.some((u) => u.user_id === user?.id);

  async function handleSubmit(content: string) {
    if (!workspace?.id) return;
    await submitMutation.mutateAsync({ content, update_date: today });
    setShowForm(false);
  }

  async function handleEdit(updateId: string, content: string) {
    await editMutation.mutateAsync({ updateId, content });
  }

  async function handleDelete(updateId: string, updateDate: string) {
    await deleteMutation.mutateAsync({ updateId, updateDate });
  }

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
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
              isSubmitting={submitMutation.isPending || !workspace?.id}
            />
          ) : (
            <EmptyState onSubmitClick={() => setShowForm(true)} />
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
              currentUserId={user?.id ?? ''}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
