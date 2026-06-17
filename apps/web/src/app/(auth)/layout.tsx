'apps/web/src/app/(auth)/layout.tsx';

import * as React from 'react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        'flex min-h-screen flex-col',
        'bg-background',
        'text-on-surface',
        'dot-grid',
      ].join(' ')}
    >
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <span className="font-headline text-2xl text-primary">SoarUp</span>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div
          className={[
            'w-full max-w-lg',
            'bg-surface-lowest dark:bg-surface-high',
            'border border-outline-variant',
            'px-8 py-10 md:px-12 md:py-12',
            'shadow-card',
            'dark:shadow-[0_0_0_1px_var(--color-outline-variant),0_0_40px_rgba(83,221,252,0.10)]',
          ].join(' ')}
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
            className="font-label text-[10px] uppercase tracking-[0.15em] text-outline transition-colors hover:text-primary"
          >
            Terms
          </a>
          <a
            href="/privacy"
            className="font-label text-[10px] uppercase tracking-[0.15em] text-outline transition-colors hover:text-primary"
          >
            Privacy
          </a>
        </div>
      </footer>
    </div>
  );
}
