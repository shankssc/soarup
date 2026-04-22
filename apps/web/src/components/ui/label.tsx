'use client';

// apps/web/src/components/ui/label.tsx

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

// ─── Variants ─────────────────────────────────────────────────────────────────
//
// Two label styles matching the Stitch design:
//
//   field  — the 10px uppercase tracking label above inputs.
//             "IDENTITY / EMAIL", "PASSWORD", "WORKSPACE NAME"
//             This is the dominant pattern across all auth + settings forms.
//
//   inline — standard label size, for checkbox/radio inline labels.
//             "Remember me", "Enable email digests"

const labelVariants = cva(
  // Base: always Space Grotesk, cursor respects disabled peer
  [
    'font-label',
    'leading-none',
    'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      variant: {
        field: [
          'block',
          'text-[10px] uppercase tracking-[0.15em]',
          'text-outline',
          'mb-1',
        ],
        inline: ['text-sm', 'text-on-surface-variant', 'cursor-pointer'],
      },
    },
    defaultVariants: {
      variant: 'field',
    },
  },
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelProps
  extends
    React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

// ─── Component ────────────────────────────────────────────────────────────────

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, variant, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants({ variant }), className)}
    {...props}
  />
));

Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants };
