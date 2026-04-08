"use client";

// apps/web/src/components/ui/button.tsx

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2",
    "font-label font-bold uppercase tracking-[0.12em]",
    "border border-transparent",
    "transition-all duration-200",
    // primary-container exists in config → ring uses the CSS var automatically
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-40",
    "active:scale-[0.97]",
    "select-none",
  ],
  {
    variants: {
      variant: {
        // ── Primary ────────────────────────────────────────────────────────
        // bg-primary-container  → var(--color-primary-container)
        //   light: #06b6d4 (cyan)   dark: #21bedc (bright cyan)
        // text-primary-on-container → var(--color-on-primary-container)
        //   light: #00424f (dark teal)  dark: #00343e (darker teal)
        // Both values switch automatically via CSS variables — no dark: needed.
        primary: [
          "bg-primary-container text-primary-on-container",
          "hover:shadow-electric hover:brightness-105",
        ],

        // ── Secondary ──────────────────────────────────────────────────────
        // text-on-surface and border-outline-variant both switch via CSS vars.
        secondary: [
          "bg-transparent text-on-surface",
          "border-outline-variant",
          "hover:bg-surface-high hover:border-outline",
        ],

        // ── Ghost ──────────────────────────────────────────────────────────
        ghost: [
          "bg-transparent text-on-surface-variant",
          "hover:bg-surface-high hover:text-on-surface",
        ],

        // ── Danger ─────────────────────────────────────────────────────────
        // error.on → text-error-on
        danger: [
          "bg-error text-error-on",
          "hover:brightness-90",
        ],

        // ── Link ───────────────────────────────────────────────────────────
        link: [
          "bg-transparent text-primary",
          "underline-offset-4 hover:underline",
          "border-none tracking-normal normal-case font-body font-normal",
          "active:scale-100",
        ],

        // ── OAuth ──────────────────────────────────────────────────────────
        // surface-high:    light=#daeceb  dark=#1f1f22  — visible card bg
        // surface-highest: light=#d4e6e5  dark=#262528  — hover state
        // text-on-surface switches automatically light/dark via CSS var
        oauth: [
          "bg-surface-high text-on-surface",
          "border border-outline-variant",
          "hover:bg-surface-highest hover:border-outline",
          "normal-case tracking-normal font-body font-medium",
        ],
      },

      size: {
        sm:        "h-8  px-4  text-[10px]",
        md:        "h-10 px-6  text-xs",
        lg:        "h-14 px-8  text-sm",
        icon:      "h-10 w-10  p-0 text-base",
        "icon-sm": "h-8  w-8   p-0 text-sm",
        "icon-lg": "h-14 w-14  p-0 text-lg",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

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

export { Button, buttonVariants };
