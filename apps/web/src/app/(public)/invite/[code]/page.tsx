'use client';

// apps/web/src/app/(public)/invite/[code]/page.tsx
// Public invite acceptance page — no auth required to view.
//
// Flow:
//   Unauthenticated:
//     1. Store code in localStorage (soarup_pending_invite)
//     2. Redirect to /signup (new user) or /login (existing user)
//     3. After auth, user is returned here via ?accept=1 OR lands
//        in onboarding where the code is pre-filled (new user path)
//
//   Authenticated:
//     1. Call POST /invites/{code}/accept immediately on CTA click
//     2. On success → clear localStorage → redirect to /dashboard
//
//   Edge cases handled:
//     - Email mismatch: warned but not blocked (code-based acceptance)
//     - Already a member: show message + link to dashboard
//     - Expired/used: show expired state
//     - Not found: show not found state

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useInviteDetails, useAcceptInvite } from '@/hooks/useInviteMembers';
import { PENDING_INVITE_KEY } from '@/components/domain/auth/onboarding-form';

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

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = typeof params.code === 'string' ? params.code : '';

  const { isAuthenticated, user } = useAuth();
  const { data: details, isLoading, isError } = useInviteDetails(code);
  const acceptMutation = useAcceptInvite();

  const [acceptError, setAcceptError] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);
  const [alreadyMember, setAlreadyMember] = React.useState(false);

  const shouldAutoAccept = searchParams.get('accept') === '1';

  React.useEffect(() => {
    if (!shouldAutoAccept || !isAuthenticated || !details?.is_valid || accepted) return;
    void handleAccept();
  }, [shouldAutoAccept, isAuthenticated, details?.is_valid]); // eslint-disable-line react-hooks/exhaustive-deps

  function storeInviteCode() {
    try {
      localStorage.setItem(PENDING_INVITE_KEY, code);
    } catch {
      // localStorage unavailable — silently continue
    }
  }

  function clearInviteCode() {
    try {
      localStorage.removeItem(PENDING_INVITE_KEY);
    } catch {
      // silently continue
    }
  }

  async function handleAccept() {
    if (!isAuthenticated) {
      storeInviteCode();
      const next = `/invite/${code}?accept=1`;
      router.push(`/signup?next=${encodeURIComponent(next)}`);
      return;
    }

    setAcceptError(null);
    try {
      await acceptMutation.mutateAsync(code);
      clearInviteCode();
      setAccepted(true);
      setTimeout(() => {
        router.replace('/dashboard');
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      if (
        message.toLowerCase().includes('already a member') ||
        message.toLowerCase().includes('already_member')
      ) {
        clearInviteCode();
        setAlreadyMember(true);
        return;
      }
      setAcceptError(message);
    }
  }

  function handleLoginInstead() {
    storeInviteCode();
    const next = `/invite/${code}?accept=1`;
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex justify-center">
          <Spinner />
        </div>
      </PageShell>
    );
  }

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

  if (alreadyMember) {
    return (
      <PageShell>
        <span
          className="material-symbols-outlined mb-4 text-[40px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
          aria-hidden="true"
        >
          check_circle
        </span>
        <h1 className="mb-3 font-headline text-3xl italic text-on-surface">
          You&apos;re already in!
        </h1>
        <p className="mb-8 font-body text-[15px] text-on-surface-variant">
          You&apos;re already a member of {details.workspace_name}.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/dashboard')}
          className="font-label text-[13px] text-primary underline-offset-2 hover:underline"
        >
          Go to dashboard
        </button>
      </PageShell>
    );
  }

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

  return (
    <PageShell>
      <p className="mb-1 font-label text-[10px] font-medium uppercase tracking-[0.08em] text-outline">
        You&apos;ve been invited
      </p>
      <h1 className="mb-2 font-headline text-4xl italic leading-tight text-on-surface">
        Join {details.workspace_name}
      </h1>

      {details.invited_by_name && (
        <p className="mb-6 font-body text-[15px] text-on-surface-variant">
          {details.invited_by_name} has invited you to join their workspace on SoarUp.
        </p>
      )}

      {/* Email mismatch warning */}
      {isAuthenticated &&
        user?.email &&
        details.email &&
        user.email.toLowerCase() !== details.email.toLowerCase() && (
          <div className="mb-6 border border-outline-variant bg-surface-high px-4 py-3">
            <p className="font-label text-[12px] text-on-surface-variant">
              This invite was sent to{' '}
              <span className="text-on-surface">{details.email}</span>. You&apos;re
              signed in as <span className="text-on-surface">{user.email}</span>. You
              can still accept — the invite is not locked to the original email.
            </p>
          </div>
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
              : 'Sign up to accept'}
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

      {!isAuthenticated && (
        <p className="mt-4 text-center font-body text-[14px] text-on-surface-variant">
          Already have an account?{' '}
          <button
            type="button"
            onClick={handleLoginInstead}
            className="text-primary underline-offset-2 hover:underline"
          >
            Sign in instead
          </button>
        </p>
      )}

      <p className="mt-4 font-label text-[11px] text-on-surface-variant">
        By accepting, you agree to SoarUp&apos;s terms of service.
      </p>
    </PageShell>
  );
}
