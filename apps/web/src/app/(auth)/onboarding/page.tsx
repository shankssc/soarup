'use client';

// apps/web/src/app/(auth)/onboarding/page.tsx
// Session guard + onboarding form.
// AuthLayout provides header, background, dot-grid, footer.

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

  // Render nothing while auth resolves or redirect is pending
  if (isLoading || !isAuthenticated || !needsOnboarding) {
    return null;
  }

  return <OnboardingForm />;
}
