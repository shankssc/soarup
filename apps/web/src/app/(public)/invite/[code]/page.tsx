'use client';

// apps/web/src/app/(public)/invite/[code]/page.tsx
// Public invite acceptance page — no auth required to view.
//
// States:
//   loading     — fetching invite details from GET /invites/{code}
//   invalid     — code not found or expired (is_valid: false)
//   ready       — valid invite, show workspace info + CTA
//   accepting   — POST /invites/{code}/accept in flight
//   success     — accepted, redirecting to dashboard
//   error       — acceptance failed (already member, expired race, etc.)
//
// Auth flow:
//   Unauthenticated → CTA redirects to /login?next=/invite/{code}
//   After login, user lands back here and acceptance fires automatically.
//   Authenticated → acceptance fires immediately on CTA click.

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useInviteDetails, useAcceptInvite } from '@/hooks/useInviteMembers';

// ─── Loading spinner ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      className="material-symbols-outlined animate-spin text-[32px] text-primary"
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
      aria-hidden="true"
    >
      progress_activity
    </span>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-[440px]">
        {/* Logo / wordmark */}
        <p className="mb-12 font-label text-[12px] font-medium uppercase tracking-[0.12em] text-primary">
          SoarUp
        </p>
        {children}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = typeof params.code === 'string' ? params.code : '';

  const { isAuthenticated } = useAuth();
  const { data: details, isLoading, isError } = useInviteDetails(code);
  const acceptMutation = useAcceptInvite();

  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);

  // Auto-accept after redirect back from login
  // If user was sent to /login?next=/invite/{code} and came back authenticated
  const autoAccept = searchParams.get('accept') === '1';

  React.useEffect(() => {
    if (!autoAccept || !isAuthenticated || !details?.is_valid || accepted) return;
    handleAccept();
  }, [autoAccept, isAuthenticated, details?.is_valid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept() {
    if (!isAuthenticated) {
      // Not logged in — redirect to login with return URL
      router.push(`/login?next=/invite/${code}?accept=1`);
      return;
    }

    setAcceptError(null);
    try {
      await acceptMutation.mutateAsync(code);
      setAccepted(true);
      // Brief pause so the success state is visible before redirect
      setTimeout(() => {
        router.replace(`/dashboard`);
      }, 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setAcceptError(message);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex justify-center">
          <Spinner />
        </div>
      </PageShell>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────

  if (isError || !details) {
    return (
      <PageShell>
        <h1 className="mb-3 font-headline text-3xl italic text-on-surface">
          Invite not found
        </h1>
        <p className="mb-8 font-body text-[15px] text-on-surface-variant">
          This invite link is invalid or has been removed.
        </p>
        <a
          href="/"
          className="font-label text-[13px] text-primary underline-offset-2 hover:underline"
        >
          Go to homepage
        </a>
      </PageShell>
    );
  }

  // ── Expired or used ───────────────────────────────────────────────────────

  if (!details.is_valid) {
    return (
      <PageShell>
        <h1 className="mb-3 font-headline text-3xl italic text-on-surface">
          Invite expired
        </h1>
        <p className="mb-8 font-body text-[15px] text-on-surface-variant">
          This invite link has expired or has already been used. Ask an admin to send
          you a new one.
        </p>
        <a
          href="/"
          className="font-label text-[13px] text-primary underline-offset-2 hover:underline"
        >
          Go to homepage
        </a>
      </PageShell>
    );
  }

  // ── Accepted — redirecting ────────────────────────────────────────────────

  if (accepted) {
    return (
      <PageShell>
        <div className="flex flex-col items-start gap-4">
          <span
            className="material-symbols-outlined text-[40px] text-primary"
            style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
            aria-hidden="true"
          >
            check_circle
          </span>
          <h1 className="font-headline text-3xl italic text-on-surface">
            You&apos;re in!
          </h1>
          <p className="font-body text-[15px] text-on-surface-variant">
            Redirecting you to {details.workspace_name}…
          </p>
        </div>
      </PageShell>
    );
  }

  // ── Valid invite — ready to accept ────────────────────────────────────────

  return (
    <PageShell>
      <p className="mb-1 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-outline">
        You&apos;ve been invited
      </p>
      <h1 className="mb-2 font-headline text-4xl italic leading-tight text-on-surface">
        Join {details.workspace_name}
      </h1>

      {details.invited_by_name && (
        <p className="mb-8 font-body text-[15px] text-on-surface-variant">
          {details.invited_by_name} has invited you to join their workspace on SoarUp.
        </p>
      )}

      {/* Email mismatch warning */}
      {isAuthenticated && (
        <p className="mb-6 font-label text-[12px] text-on-surface-variant">
          This invite was sent to{' '}
          <span className="text-on-surface">{details.email}</span>. You can still accept
          with a different account.
        </p>
      )}

      {acceptError && (
        <p className="mb-4 font-label text-[13px] text-error">{acceptError}</p>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={acceptMutation.isPending}
        className={[
          'h-12 w-full px-6',
          'flex items-center justify-between',
          'font-label text-[14px] font-bold uppercase tracking-[0.06em]',
          'bg-primary text-primary-on shadow-electric-sm hover:shadow-electric',
          'asymmetric-btn',
          'transition-all duration-150',
          'disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      >
        <span>
          {acceptMutation.isPending
            ? 'Joining…'
            : isAuthenticated
              ? 'Accept invite'
              : 'Sign in to accept'}
        </span>
        {!acceptMutation.isPending && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        )}
      </button>

      <p className="mt-4 font-label text-[11px] text-on-surface-variant">
        By accepting, you agree to SoarUp&apos;s terms of service.
      </p>
    </PageShell>
  );
}
