// apps/web/src/components/domain/dashboard/pending-members-row.tsx

import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';
import Image from 'next/image';

interface PendingMembersRowProps {
  members: WorkspaceMember[];
}

const MAX_VISIBLE = 4;

export function PendingMembersRow({ members }: PendingMembersRowProps) {
  if (members.length === 0) return null;

  const visible = members.slice(0, MAX_VISIBLE);
  const overflow = members.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-3 border-b border-outline-variant bg-surface-high px-4 py-3">
      <div className="flex items-center -space-x-2">
        {visible.map((member) => (
          <MemberAvatar key={member.user_id} member={member} />
        ))}
        {overflow > 0 && (
          <span className="z-10 flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface-highest text-xs font-medium text-on-surface-variant">
            +{overflow}
          </span>
        )}
      </div>
      <p className="text-sm text-on-surface-variant">
        {members.length === 1
          ? "1 person hasn't submitted yet"
          : `${members.length} people haven't submitted yet`}
      </p>
    </div>
  );
}

function MemberAvatar({ member }: { member: WorkspaceMember }) {
  const initials = (member.full_name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (member.avatar_url) {
    return (
      <Image
        src={member.avatar_url}
        alt={member.full_name ?? 'Member'}
        title={member.full_name ?? member.user_id}
        width={32}
        height={32}
        className="rounded-full border-2 border-surface object-cover"
      />
    );
  }

  return (
    <span
      title={member.full_name ?? member.user_id}
      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary-container text-xs font-semibold text-primary-on-container"
    >
      {initials}
    </span>
  );
}
