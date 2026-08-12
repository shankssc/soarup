'use client';

// apps/web/src/app/(auth)/callback/page.tsx
// Landing target for any flow where Supabase issues a session directly
// via URL (email confirmation today; OAuth once real providers are
// wired up).
//
// IMPORTANT: this project's confirmation links use the implicit flow —
// tokens arrive in the URL hash fragment (#access_token=...&refresh_
// token=...), not the PKCE `?code=` query-param style. createBrowserClient
// here is configured with bare defaults, and in practice detectSessionInUrl
// was not picking up these hash-fragment tokens (confirmed via DevTools:
// zero Supabase network calls, no onAuthStateChange event ever fired,
// getSession() found nothing). So we parse the hash ourselves and call
// setSession() explicitly rather than relying on SDK auto-detection.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth, useAuthStore } from '@/hooks/useAuth';

function parseHashParams(hash: string): Record<string, string> {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { hydrateSession } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const hashParams = parseHashParams(window.location.hash);
      const accessToken = hashParams['access_token'];
      const refreshToken = hashParams['refresh_token'];
      const hashError = hashParams['error_description'];

      // Strip tokens out of the visible URL immediately regardless of
      // outcome — they shouldn't linger in browser history either way.
      window.history.replaceState(null, '', window.location.pathname);

      if (hashError) {
        if (!cancelled) setError(decodeURIComponent(hashError));
        return;
      }

      if (!accessToken || !refreshToken) {
        if (!cancelled) setError('This link is invalid or has expired.');
        return;
      }

      try {
        const supabase = createClient();
        // Sets Supabase's own cookie session too, so createServerSupabaseClient()
        // in Server Components / middleware reads consistently afterward.
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        await hydrateSession(accessToken, refreshToken);
        if (cancelled) return;

        const { user } = useAuthStore.getState();
        window.location.href =
          user?.is_onboarded === false ? '/onboarding' : '/dashboard';
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
