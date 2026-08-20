'use client';

// apps/web/src/app/(auth)/signup/check-email/page.tsx

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

function CheckEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  return (
    <div className="space-y-8 text-center">
      <div className="bg-primary/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
        <MailCheck className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="font-headline text-3xl leading-tight text-on-surface md:text-4xl">
          Check your email
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Confirmation link sent
        </p>
      </div>

      <p className="text-on-surface-variant">
        {email ? (
          <>
            We sent a confirmation link to{' '}
            <span className="font-medium text-on-surface">{email}</span>. Click it to
            activate your account.
          </>
        ) : (
          'We sent you a confirmation link. Click it to activate your account.'
        )}
      </p>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() => router.push('/login')}
      >
        Back to sign in
      </Button>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <React.Suspense fallback={null}>
      <CheckEmailContent />
    </React.Suspense>
  );
}
