// apps/web/src/components/domain/dashboard/dashboard-view.tsx
// Pure presentational component — no data fetching, no hooks.
// Receives all data and callbacks as props so it can be rendered
// in Storybook without needing React Query or auth providers.
'use client';

import { Keyboard, Mic } from 'lucide-react';
import { UpdateCard } from '@/components/domain/updates/update-card';
import { UpdateForm } from '@/components/domain/updates/update-form';
import { VoiceRecorder } from '@/components/domain/updates/voice-recorder';
import { Button } from '@/components/ui/button';
import type { UpdateResponse } from '@/hooks/useUpdates';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';
import { PendingMembersRow } from '@/components/domain/dashboard/pending-members-row';

export interface DashboardViewProps {
  updates: UpdateResponse[];
  isLoading: boolean;
  hasSubmittedToday: boolean;
  showForm: boolean;
  showVoiceRecorder: boolean;
  currentUserId: string;
  workspaceId: string;
  todayLabel: string;
  today: string;
  pendingMembers: WorkspaceMember[];
  onSubmitClick: () => void;
  onVoiceClick: () => void;
  onFormSubmit: (content: string) => Promise<void>;
  onFormCancel: () => void;
  onVoiceSuccess: (
    audioKey: string,
    durationSeconds: number,
    blob: Blob,
  ) => Promise<void>;
  onVoiceCancel: () => void;
  onEdit: (updateId: string, content: string) => Promise<void>;
  onDelete: (updateId: string, updateDate: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function DashboardView({
  updates,
  isLoading,
  hasSubmittedToday,
  showForm,
  showVoiceRecorder,
  currentUserId,
  workspaceId,
  todayLabel,
  today,
  pendingMembers,
  onSubmitClick,
  onVoiceClick,
  onFormSubmit,
  onFormCancel,
  onVoiceSuccess,
  onVoiceCancel,
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
          {/* Mode toggle — shown when neither form nor recorder is open */}
          {!showForm && !showVoiceRecorder && (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                asymmetric
                onClick={onSubmitClick}
                data-testid="submit-update-cta"
              >
                Submit update
                <Keyboard className="h-[18px] w-[18px]" aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                onClick={onVoiceClick}
                data-testid="voice-note-cta"
              >
                <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
                Voice note
              </Button>
            </div>
          )}

          {/* Text update form */}
          {showForm && (
            <UpdateForm
              onSubmit={onFormSubmit}
              onCancel={onFormCancel}
              isSubmitting={isSubmitting}
            />
          )}

          {/* Voice recorder */}
          {showVoiceRecorder && (
            <VoiceRecorder
              workspaceId={workspaceId}
              updateDate={today}
              onSuccess={onVoiceSuccess}
              onCancel={onVoiceCancel}
            />
          )}
        </>
      )}

      {/* Pending members */}
      <PendingMembersRow members={pendingMembers} />

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
