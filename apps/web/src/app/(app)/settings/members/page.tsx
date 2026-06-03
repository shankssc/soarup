'use client';

// apps/web/src/app/(app)/settings/members/page.tsx
// Data wrapper for the members settings page.
// Wires useWorkspaceMembers + useInviteMembers into MembersPanel.
// All rendering logic lives in MembersPanel for Storybook testability.

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  useWorkspaceMembers,
  useUpdateMemberRole,
  useRemoveMember,
} from '@/hooks/useWorkspaceMembers';
import {
  usePendingInvites,
  useCreateInvite,
  useRevokeInvite,
} from '@/hooks/useInviteMembers';
import { MembersPanel } from '@/components/domain/members/members-panel';

export default function MembersSettingsPage() {
  const { user } = useAuth();
  const { data: workspace } = useWorkspace();
  const [inviteError, setInviteError] = useState<string | null>(null);

  const workspaceId = workspace?.id ?? '';

  const { data: membersData, isLoading: isLoadingMembers } = useWorkspaceMembers(
    workspace?.id,
  );
  const { data: invitesData, isLoading: isLoadingInvites } = usePendingInvites(
    workspace?.id,
  );

  const createInviteMutation = useCreateInvite(workspaceId);
  const revokeInviteMutation = useRevokeInvite(workspaceId);
  const updateRoleMutation = useUpdateMemberRole(workspaceId);
  const removeMemberMutation = useRemoveMember(workspaceId);

  const members = membersData?.members ?? [];
  const pendingInvites = invitesData?.invites ?? [];

  // Derive the current user's role from the members list
  const currentUserRole = members.find((m) => m.user_id === user?.id)?.role ?? 'member';

  async function handleInvite(email: string) {
    setInviteError(null);
    try {
      await createInviteMutation.mutateAsync(email);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite.');
    }
  }

  async function handleRoleChange(userId: string, role: 'admin' | 'member') {
    await updateRoleMutation.mutateAsync({ userId, role });
  }

  async function handleRemove(userId: string) {
    await removeMemberMutation.mutateAsync(userId);
  }

  async function handleRevokeInvite(inviteId: string) {
    await revokeInviteMutation.mutateAsync(inviteId);
  }

  if (!workspace) {
    return (
      <div className="flex justify-center py-16">
        <span
          className="material-symbols-outlined animate-spin text-[32px] text-primary"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          aria-hidden="true"
        >
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="border-b border-outline-variant pb-3">
        <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Settings — Members
        </h2>
      </div>

      <MembersPanel
        members={members}
        pendingInvites={pendingInvites}
        currentUserId={user?.id ?? ''}
        currentUserRole={currentUserRole}
        isLoadingMembers={isLoadingMembers}
        isLoadingInvites={isLoadingInvites}
        onInvite={handleInvite}
        isInviting={createInviteMutation.isPending}
        inviteError={inviteError}
        onRoleChange={handleRoleChange}
        onRemove={handleRemove}
        onRevokeInvite={handleRevokeInvite}
      />
    </div>
  );
}
