// apps/web/src/components/ui/seperator.tsx

import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils/cn';

// ─── Separator ────────────────────────────────────────────────────────────────
//
// Used between OAuth buttons and the email/password form section.
// Supports an optional centered label ("or continue with").
//
// Usage:
//   <Separator />
//   <Separator label="or" />

interface SeparatorProps extends React.ComponentPropsWithoutRef<
  typeof SeparatorPrimitive.Root
> {
  label?: string;
}

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  SeparatorProps
>(
  (
    { className, orientation = 'horizontal', decorative = true, label, ...props },
    ref,
  ) => {
    if (label) {
      return (
        <div className="flex items-center gap-4">
          <div className="bg-outline-variant/30 h-px flex-1" aria-hidden="true" />
          <span className="whitespace-nowrap font-label text-[10px] uppercase tracking-[0.2em] text-outline">
            {label}
          </span>
          <div className="bg-outline-variant/30 h-px flex-1" aria-hidden="true" />
        </div>
      );
    }

    return (
      <SeparatorPrimitive.Root
        ref={ref}
        decorative={decorative}
        orientation={orientation}
        className={cn(
          'bg-outline-variant/30 shrink-0',
          orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
          className,
        )}
        {...props}
      />
    );
  },
);

Separator.displayName = SeparatorPrimitive.Root.displayName;

// ─── FormMessage ──────────────────────────────────────────────────────────────
//
// Top-level form-level error message (not field-level).
// Used for API errors: "Invalid email or password", "Account not found", etc.
// Rendered above the submit button, below the fields.
//
// Usage:
//   <FormMessage message={apiError} />
//   <FormMessage message="Your account has been created." variant="success" />

interface FormMessageProps {
  message?: string | null;
  variant?: 'error' | 'success' | 'info';
  className?: string;
}

function FormMessage({ message, variant = 'error', className }: FormMessageProps) {
  if (!message) return null;

  const variantStyles = {
    error: 'bg-error-container/20 border-error/30 text-error',
    success: 'bg-tertiary-container/10 border-tertiary/30 text-tertiary',
    info: 'bg-primary-container/10 border-primary-container/30 text-on-surface',
  };

  const icons = {
    error: 'error',
    success: 'check_circle',
    info: 'info',
  };

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3',
        'border-l-2 px-4 py-3',
        variantStyles[variant],
        className,
      )}
    >
      <span
        className="material-symbols-outlined mt-px shrink-0 text-[16px]"
        style={{ fontVariationSettings: "'FILL' 1, 'wght' 400" }}
        aria-hidden="true"
      >
        {icons[variant]}
      </span>
      <p className="font-body text-sm leading-snug">{message}</p>
    </div>
  );
}

export { Separator, FormMessage };
