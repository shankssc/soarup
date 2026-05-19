// apps/web/src/components/layout/app-shell.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { useWorkspace } from '@/hooks/useWorkspace';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const { isAuthenticated, needsOnboarding, isLoading: authLoading } = useAuth();
  const { data: workspace, isLoading: workspaceLoading } = useWorkspace();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [isAuthenticated, needsOnboarding, authLoading, router]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span
          className="material-symbols-outlined animate-spin text-[32px] text-primary"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          aria-hidden="true"
        >
          progress_activity
        </span>
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
