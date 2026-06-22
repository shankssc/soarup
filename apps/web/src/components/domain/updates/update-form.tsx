// apps/web/src/components/domain/updates/update-form.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const MAX_CHARS = 1000;

interface UpdateFormProps {
  onSubmit: (content: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function UpdateForm({ onSubmit, onCancel, isSubmitting }: UpdateFormProps) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;
  const isEmpty = content.trim().length === 0;

  async function handleSubmit() {
    if (isEmpty || isOverLimit || isSubmitting) return;
    setError(null);
    try {
      await onSubmit(content.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to submit. Please try again.',
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter submits
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    // Escape cancels
    if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <div className="flex flex-col gap-4 border border-outline-variant bg-surface-high p-6">
      {/* Label */}
      <label
        htmlFor="update-content"
        className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant"
      >
        What did you work on today?
      </label>

      {/* Textarea with animated bottom-border */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          id="update-content"
          data-testid="update-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="I finished..."
          rows={4}
          className={cn(
            'w-full resize-none bg-transparent',
            'border-0 border-b-2 border-outline-variant px-0 py-2',
            'placeholder:text-on-surface-variant/50 font-body text-base text-on-surface',
            'transition-colors duration-200',
            'focus:border-primary focus:outline-none focus:ring-0',
            isOverLimit && 'border-error focus:border-error',
          )}
        />
      </div>

      {/* Footer: char counter + actions */}
      <div className="flex items-center justify-between">
        {/* Character counter */}
        <span
          className={cn(
            'font-label text-[10px] tabular-nums tracking-[0.08em]',
            isOverLimit
              ? 'text-error'
              : charsLeft <= 100
                ? 'text-on-surface-variant'
                : 'text-on-surface-variant/50',
          )}
        >
          {charsLeft} / {MAX_CHARS}
        </span>

        {/* Keyboard hint */}
        <span className="text-on-surface-variant/40 hidden font-label text-[10px] tracking-[0.08em] md:block">
          ⌘ + Enter to submit
        </span>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            asymmetric
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={isEmpty || isOverLimit}
            data-testid="update-submit-btn"
          >
            Submit →
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="font-label text-[10px] tracking-[0.08em] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
