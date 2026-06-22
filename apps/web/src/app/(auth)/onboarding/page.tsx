'use client';

// apps/web/src/app/(auth)/onboarding/page.tsx
// Session guard + onboarding form.
// AuthLayout provides header, background, dot-grid, footer.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingForm } from '@/components/domain/auth/onboarding-form';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/hooks/useAuth';

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, needsOnboarding, isLoading } = useAuth();
  const [hydrated, setHydrated] = React.useState(false);

  // Wait for Zustand persist to rehydrate from localStorage
  React.useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    // If already hydrated (fast path)
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  React.useEffect(() => {
    if (!hydrated || isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (!needsOnboarding) {
      router.replace('/dashboard');
    }
  }, [hydrated, isAuthenticated, needsOnboarding, isLoading, router]);

  // Show spinner while hydrating or auth resolves
  if (!hydrated || isLoading || !isAuthenticated || !needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-[32px] text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return <OnboardingForm />;
}
