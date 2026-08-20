'use client';

// apps/web/src/app/(public)/unsubscribe/invalid/page.tsx
// Public failure page — the backend redirects here when the unsubscribe
// token fails verification (malformed, tampered, or signed with a
// different/rotated key). Deliberately vague about *why* it failed —
// see app/lib/unsubscribe.py: verify_unsubscribe_token() returns None
// uniformly on any failure so a forged-token attempt can't distinguish
// "wrong signature" from "malformed" from "expired key" by probing.

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

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

export default function UnsubscribeInvalidPage() {
  return (
    <PageShell>
      <AlertTriangle className="mb-4 h-10 w-10 text-error" aria-hidden="true" />
      <h1 className="mb-3 font-headline text-3xl italic text-on-surface">
        This link isn&apos;t working
      </h1>
      <p className="mb-2 font-body text-[15px] text-on-surface-variant">
        This unsubscribe link is invalid or may be out of date. Nothing was changed on
        your account.
      </p>
      <p className="mb-8 font-body text-[13px] text-on-surface-variant">
        If you&apos;re trying to stop digest emails from a workspace, sign in and turn
        them off from that workspace&apos;s settings instead.
      </p>
      <Link
        href="/"
        className="font-label text-[13px] text-primary underline-offset-2 hover:underline"
      >
        Go to SoarUp
      </Link>
    </PageShell>
  );
}
