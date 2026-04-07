"use client";

"apps/web/src/components/ui/checkbox.tsx"

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cn } from "@/lib/utils/cn";

// ─── Component ────────────────────────────────────────────────────────────────
//
// Wraps @radix-ui/react-checkbox. Handles:
//  - Keyboard navigation (Space to toggle)
//  - Indeterminate state (for "select all" patterns)
//  - ARIA: checked, disabled, required states propagated automatically
//
// Styling:
//  - 16x16px square (no border-radius — matches Electric Atelier sharp aesthetic)
//  - outline-variant border at rest
//  - primary-container fill + white checkmark when checked
//  - Focus ring uses primary-container color

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Size + shape
      "h-4 w-4 shrink-0",
      // Border — square, no radius
      "border border-outline-variant",
      // Background transitions
      "bg-transparent",
      "data-[state=checked]:bg-primary-container data-[state=checked]:border-primary-container",
      // Focus ring
      "focus-visible:outline-none focus-visible:ring-2",
      "focus-visible:ring-primary-container focus-visible:ring-offset-2",
      "focus-visible:ring-offset-background",
      // Disabled
      "disabled:cursor-not-allowed disabled:opacity-40",
      // Transition
      "transition-colors duration-150",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-on-primary-container">
      {/* Checkmark icon */}
      <svg
        className="h-3 w-3"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M2 6L5 9L10 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;

// ─── CheckboxField ────────────────────────────────────────────────────────────
//
// Composed component: Checkbox + inline Label.
// Use this for form fields like "Remember me", "Accept terms".
// The label is always clickable (htmlFor wired automatically).

interface CheckboxFieldProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label: string;
  id?: string;
}

const CheckboxField = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxFieldProps
>(({ label, id, className, ...props }, ref) => {
  // useId always called unconditionally — never after a conditional return
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Checkbox ref={ref} id={fieldId} {...props} />
      <label
        htmlFor={fieldId}
        className={cn(
          "font-label text-xs text-on-surface-variant",
          "cursor-pointer select-none",
          "hover:text-on-surface transition-colors duration-150",
          props.disabled && "cursor-not-allowed opacity-40"
        )}
      >
        {label}
      </label>
    </div>
  );
});

CheckboxField.displayName = "CheckboxField";

export { Checkbox, CheckboxField };
