// apps/web/src/app/(app)/dashboard/page.tsx
// Thin data wrapper — fetches data via hooks and passes it to DashboardView.
// All rendering logic lives in DashboardView for Storybook testability.
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
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { DashboardView } from '@/components/domain/dashboard/dashboard-view';

export default function DashboardPage() {
  const { user, tokens } = useAuth();
  const { data: workspace } = useWorkspace();
  const [showForm, setShowForm] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLabel = format(new Date(), 'EEEE, d MMMM');

  const { data: updatesData, isLoading } = useUpdates(workspace?.id, today);
  const updates = updatesData?.updates ?? [];

  const { data: membersData } = useWorkspaceMembers(workspace?.id);
  const pendingMembers = (membersData?.members ?? []).filter(
    (m) => !updates.some((u) => u.user_id === m.user_id),
  );

  const submitMutation = useSubmitUpdate(workspace?.id ?? '');
  const editMutation = useEditUpdate(workspace?.id ?? '');
  const deleteMutation = useDeleteUpdate(workspace?.id ?? '');

  useWebSocket({
    workspaceId: workspace?.id,
    accessToken: tokens?.access_token,
    enabled: !!workspace?.id && !!tokens?.access_token,
  });

  useDashboardUpdates(workspace?.id);

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

  async function handleVoiceSuccess(
    audioKey: string,
    durationSeconds: number,
    _blob: Blob,
  ) {
    if (!workspace?.id) return;
    await submitMutation.mutateAsync({
      content: '',
      mode: 'voice',
      update_date: today,
      audio_key: audioKey,
      audio_duration_seconds: durationSeconds,
    });
    setShowVoiceRecorder(false);
  }

  return (
    <DashboardView
      updates={updates}
      isLoading={isLoading}
      hasSubmittedToday={hasSubmittedToday}
      showForm={showForm}
      showVoiceRecorder={showVoiceRecorder}
      currentUserId={user?.id ?? ''}
      workspaceId={workspace?.id ?? ''}
      todayLabel={todayLabel}
      today={today}
      pendingMembers={pendingMembers}
      onSubmitClick={() => setShowForm(true)}
      onVoiceClick={() => setShowVoiceRecorder(true)}
      onFormSubmit={handleSubmit}
      onFormCancel={() => setShowForm(false)}
      onVoiceSuccess={handleVoiceSuccess}
      onVoiceCancel={() => setShowVoiceRecorder(false)}
      onEdit={handleEdit}
      onDelete={handleDelete}
      isSubmitting={submitMutation.isPending || !workspace?.id}
    />
  );
}
