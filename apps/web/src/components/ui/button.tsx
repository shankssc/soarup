"use client";

// apps/web/src/components/ui/button.tsx

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

// ─── Variant definitions ──────────────────────────────────────────────────────
//
// Electric Atelier button system. All variants share:
//   - font-label (Space Grotesk) uppercase tracking
//   - 0px border-radius (overridden only for `pill` size)
//   - active:scale-[0.97] micro-interaction
//   - transition-all for smooth hover states
//
// Variant map:
//   primary   — electric cyan fill, dark text. Main CTA.
//   secondary — transparent + outline-variant border. Subdued actions.
//   ghost     — no border, subtle hover bg. Nav/inline actions.
//   danger    — error fill. Destructive confirmations only.
//   link      — no bg, no border, underline on hover. Inline text actions.
//
// Size map:
//   sm   — compact, for table rows and inline actions
//   md   — default, for most use cases
//   lg   — form submit buttons, primary page CTAs
//   icon — square, for icon-only buttons (mic, send, etc.)
//
// The `asymmetric` prop applies the Stitch .asymmetric-btn radius pattern
// (top-left/bottom-right: 1.5rem, top-right/bottom-left: 0.5rem) — used
// exclusively on primary auth CTAs. Not a separate variant to avoid
// combinatorial explosion with size.

const buttonVariants = cva(
  // Base styles applied to every button regardless of variant/size
  [
    "relative inline-flex items-center justify-center gap-2",
    "font-label font-bold uppercase tracking-[0.12em]",
    "border border-transparent",
    "transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.97]",
    "select-none",
  ],
  {
    variants: {
      variant: {
        // ── Primary ─────────────────────────────────────────────────────────
        // Electric cyan fill. Used for: login, signup, submit update, invite.
        primary: [
          "bg-primary-container text-on-primary-container",
          "hover:shadow-[0_0_20px_rgba(6,182,212,0.35)]",
          "hover:brightness-105",
        ],

        // ── Secondary ───────────────────────────────────────────────────────
        // Outlined. Used for: cancel, secondary actions, mode switches.
        secondary: [
          "bg-transparent text-on-surface",
          "border-outline-variant",
          "hover:bg-surface-container hover:border-outline",
        ],

        // ── Ghost ───────────────────────────────────────────────────────────
        // No border. Used for: nav items, icon-adjacent text actions, dropdowns.
        ghost: [
          "bg-transparent text-on-surface-variant",
          "hover:bg-surface-container hover:text-on-surface",
        ],

        // ── Danger ──────────────────────────────────────────────────────────
        // Error fill. Used for: delete workspace, remove member. Rare.
        danger: [
          "bg-error text-on-error",
          "hover:brightness-90",
        ],

        // ── Link ────────────────────────────────────────────────────────────
        // Inline text style. Used for: "Forgot password?", "Sign up instead".
        link: [
          "bg-transparent text-primary",
          "underline-offset-4 hover:underline",
          "border-none tracking-normal normal-case font-body font-normal",
          "active:scale-100", // no scale on link buttons
        ],

        // ── OAuth ───────────────────────────────────────────────────────────
        // Special variant for Google/GitHub OAuth buttons.
        // White-ish surface in light, container surface in dark.
        oauth: [
          "bg-surface-container-lowest text-on-surface",
          "border-outline-variant",
          "hover:bg-surface-container hover:border-outline",
          "normal-case tracking-normal font-body font-medium",
        ],
      },

      size: {
        sm:   "h-8  px-4  text-[10px]",
        md:   "h-10 px-6  text-xs",
        lg:   "h-14 px-8  text-sm",
        icon: "h-10 w-10  p-0 text-base",
        "icon-sm": "h-8 w-8 p-0 text-sm",
        "icon-lg": "h-14 w-14 p-0 text-lg",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, renders the button's child element directly using Radix Slot.
   * Use this to render a Next.js <Link> with button styling:
   *
   *   <Button asChild variant="primary">
   *     <Link href="/dashboard">Go to dashboard</Link>
   *   </Button>
   */
  asChild?: boolean;

  /**
   * Applies the asymmetric border-radius from the Stitch auth design.
   * Only use on primary CTA buttons (login submit, signup submit).
   * top-left/bottom-right: 1.5rem, top-right/bottom-left: 0.5rem
   */
  asymmetric?: boolean;

  /**
   * Shows a loading spinner and disables the button.
   * Preserves button width to prevent layout shift.
   */
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      asymmetric = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          buttonVariants({ variant, size }),
          asymmetric && "asymmetric-btn",
          className
        )}
        {...props}
      >
        {loading ? (
          <>
            <LoadingSpinner />
            {/* Visually hidden original children to preserve width */}
            <span className="invisible absolute">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";

// ─── Loading spinner ──────────────────────────────────────────────────────────
// Minimal CSS-only spinner. Matches current variant text color via currentColor.

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Button, buttonVariants };
