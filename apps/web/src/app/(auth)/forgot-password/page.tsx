export const dynamic = 'force-dynamic';

import { ForgotPasswordForm } from '@/components/domain/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="mb-2 space-y-1">
        <h1 className="font-headline text-3xl leading-tight text-on-surface md:text-4xl">
          Forgot password?
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          We`ll send a reset link to your inbox
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
