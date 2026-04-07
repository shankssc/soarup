"apps/web/src/components/ui/theme-toggle.tsx"

import * as React from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ThemeToggleProps {
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Icon-only toggle button. Uses Material Symbols:
//   dark mode  → shows "light_mode" icon  (click to go light)
//   light mode → shows "dark_mode" icon   (click to go dark)
//
// Placed top-right on auth pages, and in the app shell nav once logged in.
// The tooltip via aria-label is sufficient — no visible text needed here.

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        // Slightly muted at rest, full color on hover
        "text-on-surface-variant hover:text-primary",
        "transition-all duration-200",
        className
      )}
    >
      <span
        className="material-symbols-outlined text-[20px]"
        style={{
          fontVariationSettings: "'FILL' 0, 'wght' 300",
        }}
        aria-hidden="true"
      >
        {isDark ? "light_mode" : "dark_mode"}
      </span>
    </Button>
  );
}
