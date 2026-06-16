// apps/web/src/components/domain/updates/update-card.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { AudioPlayer } from '@/components/ui/audio-player';
import { cn } from '@/lib/utils/cn';
import type { UpdateResponse } from '@/hooks/useUpdates';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: 'Processing...',
    color: 'text-amber-400',
    dot: 'bg-amber-400 animate-pulse',
  },
  processing: {
    label: 'Processing...',
    color: 'text-amber-400',
    dot: 'bg-amber-400 animate-pulse',
  },
  processed: {
    label: 'Summarised',
    color: 'text-emerald-400',
    dot: 'bg-primary',
  },
  failed: {
    label: 'Failed',
    color: 'text-error',
    dot: 'bg-error',
  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const config =
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 border border-current px-2 py-1',
        config.color,
      )}
    >
      <div className={cn('h-1.5 w-1.5 rounded-full', config.dot)} aria-hidden="true" />
      <span className="font-label text-[10px] uppercase tracking-[0.08em]">
        {config.label}
      </span>
    </div>
  );
}

// ── Voice badge ───────────────────────────────────────────────────────────────

function VoiceBadge() {
  return (
    <div className="flex items-center gap-1.5 border border-outline-variant px-2 py-1">
      <span
        className="material-symbols-outlined text-[12px] text-on-surface-variant"
        aria-hidden="true"
      >
        mic
      </span>
      <span className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
        Voice
      </span>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function CollapsibleSection({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-1 font-label text-[10px] uppercase tracking-[0.15em] text-outline transition-colors hover:text-on-surface"
        aria-expanded={isOpen}
      >
        <span
          className="material-symbols-outlined text-[14px] transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          expand_more
        </span>
        {label}
      </button>
      {isOpen && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const initial = (name ?? '?')[0].toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-high">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name ?? 'User avatar'}
          width={36}
          height={36}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-label text-xs font-bold text-on-surface-variant">
          {initial}
        </span>
      )}
    </div>
  );
}

// ── Three-dot menu ────────────────────────────────────────────────────────────

interface CardMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

function CardMenu({ onEdit, onDelete }: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((o) => !o)}
        aria-label="Update options"
        aria-expanded={open}
        className="text-on-surface-variant"
      >
        <span
          className="material-symbols-outlined text-[18px]"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          aria-hidden="true"
        >
          more_horiz
        </span>
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-32 border border-outline-variant bg-surface-high shadow-electric-sm">
          <button
            className="flex w-full items-center gap-2 px-3 py-2 font-label text-xs uppercase tracking-[0.08em] text-on-surface hover:bg-surface-highest"
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              edit
            </span>
            Edit
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 font-label text-xs uppercase tracking-[0.08em] text-error hover:bg-surface-highest"
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              delete
            </span>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface UpdateCardProps {
  update: UpdateResponse;
  currentUserId: string;
  onEdit: (updateId: string, content: string) => Promise<void>;
  onDelete: (updateId: string, updateDate: string) => Promise<void>;
}

export function UpdateCard({
  update,
  currentUserId,
  onEdit,
  onDelete,
}: UpdateCardProps) {
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState(update.content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isOwner = update.user_id === currentUserId;
  const isVoice = update.mode === 'voice';

  const charsLeft = 1000 - editContent.length;
  const isOverLimit = charsLeft < 0;
  const isEmpty = editContent.trim().length === 0;

  useEffect(() => {
    if (editMode) textareaRef.current?.focus();
  }, [editMode]);

  function handleCancelEdit() {
    setEditContent(update.content);
    setError(null);
    setEditMode(false);
  }

  async function handleSaveEdit() {
    if (isEmpty || isOverLimit || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onEdit(update.id, editContent.trim());
      setEditMode(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsSubmitting(true);
    try {
      await onDelete(update.id, update.update_date);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete. Please try again.',
      );
      setIsSubmitting(false);
    }
  }

  const timestamp = formatDistanceToNow(new Date(update.created_at), {
    addSuffix: true,
  });

  return (
    <div className="shadow-card card-interactive flex flex-col gap-4 border border-outline-variant bg-surface-high p-6">
      {/* Header: avatar + meta + badges + menu */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={update.author_name} avatarUrl={update.author_avatar_url} />
          <div className="flex flex-col">
            <span className="font-body text-sm font-medium text-on-surface">
              {update.author_name ?? 'Unknown'}
            </span>
            <span className="font-label text-[10px] tracking-[0.08em] text-on-surface-variant">
              {timestamp}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isVoice && <VoiceBadge />}
          <StatusBadge status={update.status} />
          {isOwner && !isVoice && (
            <CardMenu onEdit={() => setEditMode(true)} onDelete={handleDelete} />
          )}
          {isOwner && isVoice && <CardMenu onEdit={() => {}} onDelete={handleDelete} />}
        </div>
      </div>

      {/* Content area */}
      {editMode ? (
        <div className="flex flex-col gap-3 pl-12">
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            rows={4}
            className={cn(
              'w-full resize-none bg-transparent',
              'border-0 border-b-2 border-outline-variant px-0 py-2',
              'font-body text-base text-on-surface',
              'transition-colors duration-200',
              'focus:border-primary focus:outline-none focus:ring-0',
              isOverLimit && 'border-error focus:border-error',
            )}
          />
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'font-label text-[10px] tabular-nums tracking-[0.08em]',
                isOverLimit ? 'text-error' : 'text-on-surface-variant/50',
              )}
            >
              {charsLeft} / 1000
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                asymmetric
                onClick={handleSaveEdit}
                loading={isSubmitting}
                disabled={isEmpty || isOverLimit}
              >
                Save →
              </Button>
            </div>
          </div>
          {error && (
            <p
              className="font-label text-[10px] tracking-[0.08em] text-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pl-12">
          {/* Voice update — audio player */}
          {isVoice && update.audio_duration_seconds != null && (
            <AudioPlayer
              workspaceId={update.workspace_id}
              updateId={update.id}
              durationSeconds={update.audio_duration_seconds}
              className="mt-1"
            />
          )}

          {/* Text update — raw content */}
          {!isVoice && (
            <p className="font-body text-base leading-relaxed text-on-surface">
              {update.content}
            </p>
          )}

          {/* Processing skeleton — shown while Claude is working */}
          {(update.status === 'processing' || update.status === 'pending') && (
            <div
              className="mt-1 animate-pulse space-y-2"
              aria-label="Generating summary"
            >
              <div className="h-3 w-3/4 rounded-card bg-surface-highest" />
              <div className="h-3 w-1/2 rounded-card bg-surface-highest" />
            </div>
          )}

          {/* Voice update — collapsible transcript */}
          {isVoice && update.transcript && (
            <CollapsibleSection label="Transcript" defaultOpen={false}>
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                {update.transcript}
              </p>
            </CollapsibleSection>
          )}

          {/* Summary — shown for both text and voice once processed */}
          {update.status === 'processed' && update.summary && (
            <CollapsibleSection label="Summary" defaultOpen={!isVoice}>
              <div className="border-l-2 border-primary pl-3">
                <p className="font-headline text-sm italic leading-relaxed text-on-surface-variant">
                  {update.summary}
                </p>
              </div>
            </CollapsibleSection>
          )}

          {/* Failed state */}
          {update.status === 'failed' && (
            <div className="flex items-center gap-2">
              <span className="font-label text-[10px] uppercase tracking-[0.08em] text-error">
                Summary unavailable
              </span>
              <button
                disabled
                className="text-on-surface-variant/40 cursor-not-allowed font-label text-[10px] uppercase tracking-[0.08em]"
                title="Retry coming in a future update"
              >
                Retry
              </button>
            </div>
          )}

          {error && (
            <p
              className="font-label text-[10px] tracking-[0.08em] text-error"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
