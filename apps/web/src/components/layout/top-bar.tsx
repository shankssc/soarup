// apps/web/src/components/layout/top-bar.tsx
'use client';

import Image from 'next/image';

import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils/cn';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/history': 'History',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return title;
  }
  return 'SoarUp';
}

export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const title = getPageTitle(pathname);

  return (
    <header className="bg-background/90 sticky top-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant px-8 backdrop-blur">
      {/* Page title */}
      <h1 className="font-headline text-2xl leading-none text-on-surface">{title}</h1>

      {/* Right side controls */}
      <div className="flex items-center gap-2">
        <ThemeToggle />

        {/* Avatar — decorative at this stage, links to settings in M4 */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-outline-variant bg-surface-high',
          )}
          aria-hidden="true"
        >
          {user?.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt=""
              width={32}
              height={32}
              className="h-full w-full object-cover"
              aria-hidden
            />
          ) : (
            <span className="font-label text-xs font-bold uppercase text-on-surface-variant">
              {(user?.full_name ?? user?.email ?? '?')[0].toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
