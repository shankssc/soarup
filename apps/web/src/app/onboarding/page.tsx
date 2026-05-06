'use client';

// apps/web/src/app/onboarding/page.tsx
// Session guard + onboarding form page.
// Redirects to /login if unauthenticated, /dashboard if already onboarded.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingForm } from '@/components/domain/auth/onboarding-form';
import { useAuth } from '@/hooks/useAuth';

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, needsOnboarding, isLoading } = useAuth();

  React.useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (!needsOnboarding) {
      // Already onboarded — skip to dashboard
      router.replace('/dashboard');
    }
  }, [isAuthenticated, needsOnboarding, isLoading, router]);

  // While auth state is resolving, show nothing (avoids flash)
  if (isLoading || !isAuthenticated || !needsOnboarding) {
    return null;
  }

  return <OnboardingForm />;
}
