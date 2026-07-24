'use client';

// apps/web/src/app/(public)/unsubscribe/success/page.tsx
// Public confirmation page — the backend's /digests/unsubscribe/{token}
// endpoint redirects here after successfully verifying the token, whether
// or not a live membership was actually flipped (see app/routers/unsubscribe.py:
// a stale/already-removed membership still redirects here as a no-op
// success, since from the recipient's perspective there's nothing left to
// unsubscribe from — that's itself a successful outcome, not an error).
//
// ?workspace={workspace_id} is present only on the real-flip path, absent
// on the stale-membership no-op path — used here purely to decide which
// copy to show, not to make any further API calls that could fail and
// block this page from rendering.

import * as React from 'react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-[440px]">
        <p className="mb-12 font-label text-[12px] font-medium uppercase tracking-[0.12em] text-primary">
          SoarUp
        </p>
        {children}
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary during static prerendering —
// Next.js can't know the query string at build time, so this inner component
// is deferred behind Suspense while the static shell around it still
// prerenders normally.
function UnsubscribeSuccessContent() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace');

  return (
    <>
      <CheckCircle2 className="mb-4 h-10 w-10 text-primary" aria-hidden="true" />
      <h1 className="mb-3 font-headline text-3xl italic text-on-surface">
        You&apos;re unsubscribed
      </h1>

      {workspaceId ? (
        <>
          <p className="mb-2 font-body text-[15px] text-on-surface-variant">
            You won&apos;t receive daily digest emails from this workspace anymore.
          </p>
          {/* Deliberately generic — no workspace-name lookup here yet.
              If a public "get workspace by id" endpoint/hook exists,
              swap this paragraph for one that names the workspace
              directly (e.g. "...from Rocket Team anymore"), which reads
              more concretely and reassures the person exactly what
              changed. Left generic for now rather than guessing at a
              hook that may not exist. */}
        </>
      ) : (
        <p className="mb-2 font-body text-[15px] text-on-surface-variant">
          You&apos;re no longer subscribed — there was nothing to change, but you
          won&apos;t receive digest emails from this link going forward.
        </p>
      )}

      <p className="mb-8 font-body text-[13px] text-on-surface-variant">
        This only affects this one workspace — any other SoarUp workspaces you&apos;re
        part of are unaffected. You can turn digest emails back on anytime from that
        workspace&apos;s settings.
      </p>
      <a
        href="/"
        className="font-label text-[13px] text-primary underline-offset-2 hover:underline"
      >
        Go to SoarUp
      </a>
    </>
  );
}

export default function UnsubscribeSuccessPage() {
  return (
    <PageShell>
      <Suspense fallback={null}>
        <UnsubscribeSuccessContent />
      </Suspense>
    </PageShell>
  );
}
