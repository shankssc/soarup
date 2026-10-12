'use client';

// apps/web/src/app/(auth)/callback/page.tsx
// Landing target for any flow where Supabase issues a session via URL.
//
// Handles two flows:
//
// 1. PKCE (OAuth — Google, GitHub)
//    Supabase redirects to /callback?code=<code> after the provider
//    grants access. We exchange the code for a session via
//    supabase.auth.exchangeCodeForSession(code), which handles the
//    PKCE verifier internally and returns tokens directly.
//
// 2. Implicit (email confirmation)
//    Tokens arrive in the URL hash fragment (#access_token=...&refresh_token=...).
//    createBrowserClient does not reliably auto-detect these (confirmed via
//    DevTools: no Supabase network calls, no onAuthStateChange event, getSession()
//    found nothing), so we parse the hash ourselves and call setSession() explicitly.
//
// In both cases, after obtaining a session we call hydrateSession() to populate
// the Zustand store, then navigate based on is_onboarded.

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth, useAuthStore } from '@/hooks/useAuth';

/*
Returns a Map rather than a plain object — CodeQL flags
`result[key] = value` as a prototype-pollution sink whenever `key`
comes from user-controlled input (here, the URL hash). A Map has no
prototype chain to pollute, so this removes the sink pattern
entirely rather than suppressing the warning.
*/
function parseHashParams(hash: string): Map<string, string> {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const result = new Map<string, string>();
  params.forEach((value, key) => {
    result.set(key, value);
  });
  return result;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { hydrateSession } = useAuth();
  const [error, setError] = React.useState<string | null>(null);
  const hasRun = React.useRef(false);

  React.useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    let cancelled = false;

    async function run() {
      // ── Check for OAuth/PKCE flow first (?code= in query params) ──────────
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      const queryError = searchParams.get('error');
      const queryErrorDescription = searchParams.get('error_description');

      if (queryError) {
        // Expected — user declined provider consent. Not sent to Sentry;
        // this isn't actionable, just normal behavior.
        const message = queryErrorDescription
          ? decodeURIComponent(queryErrorDescription)
          : 'Authentication was cancelled or denied.';
        if (!cancelled) setError(message);
        return;
      }

      if (code) {
        // PKCE path — exchange code for session
        // Supabase handles the PKCE verifier internally and sets its own
        // cookie session as a side effect of exchangeCodeForSession().
        try {
          const supabase = createClient();
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          // Strip ?code= from the URL immediately — it's single-use and
          // shouldn't linger in browser history.
          window.history.replaceState(null, '', window.location.pathname);

          if (exchangeError || !data.session) {
            // The exchange can fail here even after a *prior* successful exchange —
            // e.g. a duplicate navigation to this same URL (observed with Chrome
            // speculative prerendering) re-attempts the already-consumed code and
            // verifier. Before treating this as a hard failure, check whether a
            // valid session already exists from that earlier successful exchange.
            const { data: existing } = await supabase.auth.getSession();
            if (existing.session) {
              const { access_token, refresh_token } = existing.session;
              await hydrateSession(access_token, refresh_token);
              if (cancelled) return;
              const { user } = useAuthStore.getState();
              window.location.href =
                user?.is_onboarded === false ? '/onboarding' : '/dashboard';
              return;
            }

            // Real exchange failure — no prior successful session to recover.
            // No code/token material in the payload, just enough to investigate.
            Sentry.captureException(new Error('oauth_code_exchange_failed'), {
              tags: { flow: 'pkce' },
              extra: {
                supabaseErrorMessage: exchangeError?.message ?? 'no session returned',
              },
            });

            if (!cancelled) setError('Could not complete sign in. Please try again.');
            return;
          }

          const { access_token, refresh_token } = data.session;

          await hydrateSession(access_token, refresh_token);

          if (cancelled) return;

          const { user } = useAuthStore.getState();
          window.location.href =
            user?.is_onboarded === false ? '/onboarding' : '/dashboard';
        } catch (err) {
          Sentry.captureException(err, { tags: { flow: 'pkce' } });
          if (!cancelled) setError('Could not sign you in. Please try logging in.');
        }
        return;
      }

      // ── Implicit flow (email confirmation) — existing path unchanged ───────
      const hashParams = parseHashParams(window.location.hash);
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashError = hashParams.get('error_description');

      window.history.replaceState(null, '', window.location.pathname);

      if (hashError) {
        // Expected — expired/invalid confirmation link.
        if (!cancelled) setError(decodeURIComponent(hashError));
        return;
      }

      if (!accessToken || !refreshToken) {
        Sentry.captureMessage('oauth_callback_missing_tokens', {
          level: 'warning',
          tags: { flow: 'implicit' },
        });
        if (!cancelled) setError('This link is invalid or has expired.');
        return;
      }

      try {
        const supabase = createClient();
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
