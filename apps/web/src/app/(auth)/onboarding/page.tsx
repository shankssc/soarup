'use client';

// apps/web/src/app/(auth)/onboarding/page.tsx
// Session guard + onboarding form.
// AuthLayout provides header, background, dot-grid, footer.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { OnboardingForm } from '@/components/domain/auth/onboarding-form';
import { useAuth } from '@/hooks/useAuth';
import { useHydrated } from '@/hooks/useHydrated';

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, needsOnboarding, isLoading } = useAuth();
  const hydrated = useHydrated();

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
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  return <OnboardingForm />;
}
