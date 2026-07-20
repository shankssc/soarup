// apps/web/src/components/domain/members/members-panel.tsx
// Pure presentational component — no data fetching, no hooks.
// Receives all data and callbacks as props for Storybook testability.
// Rendered by a page or settings panel that wires up the hooks.

'use client';

import * as React from 'react';
import Image from 'next/image';
import { UserPlus } from 'lucide-react';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';
import type { PendingInvite } from '@/hooks/useInviteMembers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MembersPanelProps {
  members: WorkspaceMember[];
  pendingInvites: PendingInvite[];
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
  isLoadingMembers: boolean;
  isLoadingInvites: boolean;
  // Invite form
  onInvite: (email: string) => Promise<void>;
  isInviting: boolean;
  inviteError: string | null;
  // Member actions
  onRoleChange: (userId: string, role: 'admin' | 'member') => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  // Invite actions
  onRevokeInvite: (inviteId: string) => Promise<void>;
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: 'bg-primary/10 text-primary',
    admin: 'bg-secondary/10 text-secondary',
    member: 'bg-surface-high text-on-surface-variant',
  };
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5',
        'font-label text-[10px] font-medium uppercase tracking-[0.08em]',
        styles[role] ?? styles.member,
      ].join(' ')}
    >
      {role}
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?';

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name ?? 'Member'}
        width={32}
        height={32}
        className="rounded-full object-cover"
      />
    );
  }

  return (
    <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
      <span className="font-label text-[11px] font-medium text-primary">
        {initials}
      </span>
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-8 w-8 animate-pulse rounded-full bg-surface-high" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 animate-pulse bg-surface-high" />
        <div className="h-2.5 w-20 animate-pulse bg-surface-high" />
      </div>
    </div>
  );
}

// ─── Invite form ──────────────────────────────────────────────────────────────

function InviteForm({
  onInvite,
  isInviting,
  inviteError,
}: {
  onInvite: (email: string) => Promise<void>;
  isInviting: boolean;
  inviteError: string | null;
}) {
  const [email, setEmail] = React.useState('');
  const [localError, setLocalError] = React.useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed) {
      setLocalError('Email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    setLocalError(null);
    await onInvite(trimmed);
    setEmail('');
  }

  const error = localError ?? inviteError;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setLocalError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="colleague@company.com"
          disabled={isInviting}
          data-testid="invite-email-input"
          className={[
            'flex-1 bg-transparent px-0 py-2',
            'border-0 border-b',
            error ? 'border-error' : 'border-outline-variant',
            'font-body text-[14px] text-on-surface',
            'placeholder:text-on-surface-variant',
            'focus:border-primary focus:outline-none',
            'rounded-none transition-colors duration-150',
            'disabled:opacity-50',
          ].join(' ')}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isInviting || !email.trim()}
          data-testid="invite-send-btn"
          className={[
            'shrink-0 px-4 py-2',
            'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
            'bg-primary text-primary-on',
            'transition-opacity duration-150',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {isInviting ? 'Sending...' : 'Send invite'}
        </button>
      </div>
      {error && <span className="font-label text-[12px] text-error">{error}</span>}
    </div>
  );
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  currentUserId,
  currentUserRole,
  onRoleChange,
  onRemove,
}: {
  member: WorkspaceMember;
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'member';
  onRoleChange: (userId: string, role: 'admin' | 'member') => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const isSelf = member.user_id === currentUserId;
  const isOwner = member.role === 'owner';
  const canChangeRole = currentUserRole === 'owner' && !isOwner && !isSelf;
  const canRemove =
    (currentUserRole === 'owner' || currentUserRole === 'admin') &&
    !isOwner &&
    !isSelf &&
    !(currentUserRole === 'admin' && member.role === 'admin');

  return (
    <div className="flex items-center gap-3 border-b border-outline-variant py-3 last:border-0">
      <Avatar name={member.full_name} avatarUrl={member.avatar_url} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-body text-[14px] text-on-surface">
          {member.full_name ?? 'Unknown'}
          {isSelf && (
            <span className="ml-1.5 font-label text-[11px] text-on-surface-variant">
              (you)
            </span>
          )}
        </span>
        <RoleBadge role={member.role} />
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {canChangeRole && (
          <select
            value={member.role}
            onChange={(e) =>
              onRoleChange(member.user_id, e.target.value as 'admin' | 'member')
            }
            className={[
              'bg-transparent',
              'font-label text-[12px] text-on-surface-variant',
              'border border-outline-variant px-2 py-1',
              'focus:outline-none focus:ring-0',
              'cursor-pointer',
            ].join(' ')}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        )}

        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(member.user_id)}
            className={[
              'font-label text-[12px] text-error',
              'hover:underline',
              'transition-opacity duration-150',
            ].join(' ')}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Pending invite row ───────────────────────────────────────────────────────

function PendingInviteRow({
  invite,
  onRevoke,
}: {
  invite: PendingInvite;
  onRevoke: (inviteId: string) => Promise<void>;
}) {
  const expiresAt = new Date(invite.expires_at);
  const daysLeft = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div
      className="flex items-center gap-3 border-b border-outline-variant py-3 last:border-0"
      data-testid="pending-invite-row"
    >
      {/* Placeholder avatar for pending */}
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-outline-variant">
        <UserPlus
          className="h-4 w-4 text-on-surface-variant"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-body text-[14px] text-on-surface">
          {invite.email}
        </span>
        <span className="font-label text-[11px] text-on-surface-variant">
          Pending · expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onRevoke(invite.id)}
        className="shrink-0 font-label text-[12px] text-on-surface-variant transition-colors duration-150 hover:text-error"
      >
        Revoke
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MembersPanel({
  members,
  pendingInvites,
  currentUserId,
  currentUserRole,
  isLoadingMembers,
  isLoadingInvites,
  onInvite,
  isInviting,
  inviteError,
  onRoleChange,
  onRemove,
  onRevokeInvite,
}: MembersPanelProps) {
  const canInvite = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <div className="flex max-w-lg flex-col gap-8">
      {/* Invite section */}
      {canInvite && (
        <section>
          <h3 className="mb-4 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
            Invite teammate
          </h3>
          <InviteForm
            onInvite={onInvite}
            isInviting={isInviting}
            inviteError={inviteError}
          />
        </section>
      )}

      {/* Members list */}
      <section>
        <h3 className="mb-2 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
          Members · {members.length}
        </h3>
        <div>
          {isLoadingMembers ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : members.length === 0 ? (
            <p className="py-4 font-body text-[14px] text-on-surface-variant">
              No members yet.
            </p>
          ) : (
            members.map((member) => (
              <MemberRow
                key={member.user_id}
                member={member}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onRoleChange={onRoleChange}
                onRemove={onRemove}
              />
            ))
          )}
        </div>
      </section>

      {/* Pending invites */}
      {canInvite && (
        <section>
          <h3 className="mb-2 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
            Pending invites · {pendingInvites.length}
          </h3>
          <div>
            {isLoadingInvites ? (
              <SkeletonRow />
            ) : pendingInvites.length === 0 ? (
              <p className="py-4 font-body text-[14px] text-on-surface-variant">
                No pending invites.
              </p>
            ) : (
              pendingInvites.map((invite) => (
                <PendingInviteRow
                  key={invite.id}
                  invite={invite}
                  onRevoke={onRevokeInvite}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
