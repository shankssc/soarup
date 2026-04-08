"apps/web/src/app/(auth)/layout.tsx"

import * as React from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "min-h-screen flex flex-col",
        "bg-[#ebfdfc] dark:bg-[#0e0e10]",
        "text-[#0e1e1e] dark:text-[#f9f5f8]",
        "dot-grid",
      ].join(" ")}
      style={{ color: "rgba(118, 117, 119, 0.12)" }}
    >
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <span className="font-headline italic text-2xl text-primary">
          SoarUp
        </span>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className={[
            "w-full max-w-lg",
            "bg-white dark:bg-[#1f1f22]",
            "border border-outline-variant/30",
            "px-8 py-10 md:px-12 md:py-12",
            "dark:shadow-[0_0_60px_rgba(83,221,252,0.04)]",
          ].join(" ")}
        >
          {children}
        </div>
      </main>

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
