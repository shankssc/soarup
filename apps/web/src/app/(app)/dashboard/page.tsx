// apps/web/src/app/(app)/dashboard/page.tsx
// Thin data wrapper — fetches data via hooks and passes it to DashboardView.
// All rendering logic lives in DashboardView for Storybook testability.
'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useAuth, useAuthStore } from '@/hooks/useAuth';
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
import { DashboardSkeleton } from '@/components/domain/dashboard/dashboard-skeleton';

export default function DashboardPage() {
  const router = useRouter();
  const { user, tokens, isAuthenticated, needsOnboarding, isLoading } = useAuth();
  const [hydrated, setHydrated] = useState(false);

  // ── Onboarding / auth guard ──────────────────────────────────────────────
  // Mirrors the guard in (auth)/onboarding/page.tsx. Middleware only checks
  // session existence for /dashboard (see middleware.ts comment) — it does
  // NOT check is_onboarded, since that lives client-side in the Zustand
  // store, not in a cookie middleware can read. Without this guard, a user
  // who signed up but never finished onboarding can navigate straight to
  // /dashboard and land on a broken/incomplete view instead of being routed
  // back to finish setup.
  React.useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  React.useEffect(() => {
    if (!hydrated || isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [hydrated, isAuthenticated, needsOnboarding, isLoading, router]);

  const [showForm, setShowForm] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayLabel = format(new Date(), 'EEEE, d MMMM');

  const { data: workspace } = useWorkspace();
  const { data: updatesData, isLoading: updatesLoading } = useUpdates(
    workspace?.id,
    today,
  );
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

  // Block render while hydrating/resolving auth, or if a redirect is about
  // to happen — same spinner pattern as OnboardingPage, avoids a flash of
  // dashboard content before router.replace takes effect.
  if (!hydrated || isLoading || !isAuthenticated || needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!workspace?.id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <DashboardView
      updates={updates}
      isLoading={updatesLoading}
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
