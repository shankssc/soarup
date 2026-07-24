export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/domain/auth/reset-password-form';

export const runtime = 'edge';

// Suspense boundary is required because ResetPasswordForm uses
// useSearchParams() — Next.js requires this for static rendering compatibility.
function ResetPasswordContent() {
  return (
    <div className="space-y-8">
      <div className="mb-2 space-y-1">
        <h1 className="font-headline text-3xl leading-tight text-on-surface md:text-4xl">
          Reset password
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Choose a new password for your account
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="mb-2 space-y-1">
            <h1 className="font-headline text-3xl leading-tight text-on-surface md:text-4xl">
              Reset password
            </h1>
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
              Verifying your reset link...
            </p>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
