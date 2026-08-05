'use client';

// apps/web/src/app/(auth)/callback/page.tsx
// Landing target for any flow where Supabase sets its own session
// directly (email confirmation today; OAuth once real providers are
// wired up). detectSessionInUrl (on by default in createBrowserClient)
// has already exchanged whatever's in the URL by the time this mounts —
// getSession() just reads the result. We then hand those tokens to the
// backend via hydrateSession() so the app's Zustand store — the actual
// source of truth for client-side auth state — gets populated the same
// way it would after a normal login()/signup() call.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth, useAuthStore } from '@/hooks/useAuth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { hydrateSession } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        setError('This link is invalid or has expired.');
        return;
      }

      try {
        await hydrateSession(session.access_token, session.refresh_token);
        if (cancelled) return;

        // Hard navigation, same rationale as login-form.tsx / signup-form.tsx:
        // sidesteps any race between the store update and a client-side nav
        // reading stale state.
        const { user } = useAuthStore.getState();
        window.location.href = user?.is_onboarded === false ? '/onboarding' : '/dashboard';
      } catch {
        if (!cancelled) setError('Could not sign you in. Please try logging in.');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [hydrateSession]);

  if (error) {
    return (
      <div className="space-y-6 text-center">
        <p className="text-on-surface-variant">{error}</p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="font-headline text-lg text-primary underline underline-offset-8"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
    </div>
  );
}
