// apps/web/src/components/domain/updates/empty-state.tsx
'use client';

import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onSubmitClick: () => void;
}

export function EmptyState({ onSubmitClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-8 border border-dashed border-outline-variant bg-surface-lowest py-16">
      {/* Dot grid illustration */}
      <div className="dot-grid h-32 w-64 opacity-30" aria-hidden="true" />

      {/* Copy */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="font-headline text-3xl italic text-on-surface">
          Nothing here yet.
        </h2>
        <p className="font-body text-sm text-on-surface-variant">
          Submit your update for today to get started.
        </p>
      </div>

      {/* CTA */}
      <Button variant="primary" size="md" asymmetric onClick={onSubmitClick}>
        Submit update →
      </Button>
    </div>
  );
}
