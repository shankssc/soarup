import * as React from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// ─── Layout ───────────────────────────────────────────────────────────────────
//
// Shared layout for all auth routes:
//   /login, /signup, /forgot-password, /reset-password,
//   /onboarding, /invite/[token]
//
// Structure:
//   - Full-height page with dot-grid texture
//   - Top bar: wordmark (left) + theme toggle (right)
//   - Centered content card (children)
//   - Footer: copyright + legal links
//
// The dot-grid and background colors are theme-aware via Tailwind dark: variants.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        // Full viewport, flex column
        "min-h-screen flex flex-col",
        // Theme-aware background
        "bg-surface dark:bg-surface",
        "text-on-surface",
        // Dot grid texture — color matches outline-variant at low opacity
        "dot-grid",
      ].join(" ")}
      // Dot grid color via CSS custom property so it's theme-aware
      style={{ color: "rgba(118, 117, 119, 0.12)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        {/* Wordmark */}
        <span className="font-headline italic text-2xl text-primary">
          SoarUp
        </span>

        {/* Theme toggle — top-right, consistent with app shell position */}
        <ThemeToggle />
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        {/*
          Auth card — white/dark surface, sharp corners (Electric Atelier),
          subtle border. Max width constrains the form to a readable column.
        */}
        <div
          className={[
            "w-full max-w-md",
            "bg-surface-container-lowest dark:bg-container",
            "border border-outline-variant/30",
            "px-8 py-10 md:px-12 md:py-12",
            // Subtle glow on the card in dark mode
            "dark:shadow-[0_0_60px_rgba(83,221,252,0.04)]",
          ].join(" ")}
        >
          {children}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="flex items-center justify-between px-6 py-4 md:px-10">
        <span className="font-label text-[10px] uppercase tracking-[0.15em] text-outline">
          © {new Date().getFullYear()} SoarUp
        </span>
        <div className="flex items-center gap-6">
          <a
            href="/terms"
            className="font-label text-[10px] uppercase tracking-[0.15em] text-outline hover:text-primary transition-colors"
          >
            Terms
          </a>
          <a
            href="/privacy"
            className="font-label text-[10px] uppercase tracking-[0.15em] text-outline hover:text-primary transition-colors"
          >
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
