// apps/web/src/components/ui/toast.tsx
// Minimal toast for the public profile empty state.
// Not a full toast system — scoped to M9 only.

'use client';

import * as React from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number; // ms, default 6000
}

export function Toast({ message, onDismiss, duration = 6000 }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      className="shadow-card fixed bottom-6 left-1/2 z-50 mx-4 flex w-full max-w-sm -translate-x-1/2 items-center gap-3 rounded-card border border-outline-variant bg-surface-highest px-5 py-3"
      role="status"
      aria-live="polite"
    >
      <p className="flex-1 font-body text-sm text-on-surface-variant">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 text-outline transition-colors hover:text-on-surface"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
