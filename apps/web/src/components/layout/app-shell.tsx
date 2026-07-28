// apps/web/src/components/layout/app-shell.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useHydrated } from '@/hooks/useHydrated';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { useWorkspace } from '@/hooks/useWorkspace';

interface AppShellProps {
  children: React.ReactNode;
}

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];
function isSafeNextPath(path: string): boolean {
  return !AUTH_PATHS.some((p) => path.startsWith(p)) && path !== '/onboarding';
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, needsOnboarding, isLoading: authLoading } = useAuth();
  const { data: workspace, isLoading: workspaceLoading } = useWorkspace();
  const hydrated = useHydrated();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated || authLoading) return;
    if (!isAuthenticated) {
      const loginUrl = isSafeNextPath(pathname)
        ? `/login?next=${encodeURIComponent(pathname)}`
        : '/login';
      router.replace(loginUrl);
      return;
    }
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [hydrated, isAuthenticated, needsOnboarding, authLoading, router, pathname]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!hydrated || authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar workspace={workspace ?? null} workspaceLoading={workspaceLoading} />
      <div className="flex flex-1 flex-col md:ml-64">
        <TopBar />
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[800px]">{children}</div>
        </main>
      </div>
      {/* Mobile bottom nav spacer */}
      <div className="h-20 md:hidden" aria-hidden="true" />
    </div>
  );
}
