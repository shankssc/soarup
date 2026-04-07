"use client";

"apps/web/src/components/ui/input.tsx"

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Label } from "@/components/ui/label";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label text rendered above the input using the field Label variant */
  label?: string;

  /**
   * Error message. When present:
   *  - underline turns error red
   *  - error text appears below the input
   *  - aria-invalid + aria-describedby wired automatically
   */
  error?: string;

  /**
   * Helper text rendered below the input when there is no error.
   * Disappears when error is present (error takes precedence).
   */
  hint?: string;

  /**
   * Icon rendered on the left side of the input.
   * Accepts any React node — typically a Material Symbol span.
   */
  leadingIcon?: React.ReactNode;

  /**
   * Icon rendered on the right side of the input.
   * If type="password" is set, this prop is ignored — the password
   * toggle button is rendered instead.
   */
  trailingIcon?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Electric Atelier input pattern:
//  - No box border. Only a bottom border (outline-variant).
//  - On focus: an animated cyan underline slides in from left (CSS transition
//    on the ::after pseudo-element, implemented as an absolutely positioned div
//    since Tailwind can't animate pseudo-elements reliably).
//  - Error state: bottom border + underline switch to error color.
//  - The wrapper div is the focus group — the underline animation is driven by
//    `group-focus-within` on the wrapper.

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      error,
      hint,
      leadingIcon,
      trailingIcon,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    // All hooks unconditionally at the top — no conditionals before this block
    const generatedId = React.useId();
    const [showPassword, setShowPassword] = React.useState(false);

    // Derived values computed after hooks
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const isPassword = type === "password";
    const resolvedType = isPassword ? (showPassword ? "text" : "password") : type;
    const hasError = Boolean(error);
    const hasHint = Boolean(hint) && !hasError;

    return (
      <div className="w-full space-y-1">
        {/* Label */}
        {label && (
          <Label htmlFor={inputId} variant="field">
            {label}
          </Label>
        )}

        {/* Input wrapper — group for focus-within underline animation */}
        <div className="relative group">
          {/* Leading icon */}
          {leadingIcon && (
            <div className="absolute left-0 bottom-3 text-outline pointer-events-none">
              {leadingIcon}
            </div>
          )}

          {/* The actual input */}
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? errorId : hasHint ? hintId : undefined
            }
            className={cn(
              // Layout
              "w-full bg-transparent",
              "py-3 px-0",
              leadingIcon && "pl-6",
              (trailingIcon || isPassword) && "pr-8",

              // Typography
              "font-body text-base text-on-surface",
              "placeholder:text-outline-variant/50",

              // Border — bottom only, no box
              "border-0 border-b",
              hasError ? "border-error" : "border-outline-variant",

              // Remove browser focus ring — we handle focus ourselves
              "focus:outline-none focus:ring-0",

              // Transition for border color
              "transition-colors duration-200",

              // Disabled
              "disabled:cursor-not-allowed disabled:opacity-40",

              className
            )}
            {...props}
          />

          {/* Animated focus underline — slides in from left on focus */}
          <div
            className={cn(
              "absolute bottom-0 left-0 h-[2px]",
              "w-0 group-focus-within:w-full",
              "transition-all duration-500 ease-out",
              hasError ? "bg-error" : "bg-primary-container",
            )}
            aria-hidden="true"
          />

          {/* Trailing icon or password toggle */}
          {isPassword ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className={cn(
                "absolute right-0 bottom-2.5",
                "text-outline hover:text-on-surface",
                "transition-colors duration-150",
                "focus:outline-none",
              )}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
              >
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          ) : trailingIcon ? (
            <div className="absolute right-0 bottom-3 text-outline pointer-events-none">
              {trailingIcon}
            </div>
          ) : null}
        </div>

        {/* Error message */}
        {hasError && (
          <p
            id={errorId}
            role="alert"
            className="font-label text-[10px] uppercase tracking-[0.1em] text-error mt-1"
          >
            {error}
          </p>
        )}

        {/* Hint text */}
        {hasHint && (
          <p
            id={hintId}
            className="font-label text-[10px] text-outline mt-1"
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
