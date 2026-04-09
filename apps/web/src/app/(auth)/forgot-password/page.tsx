export const dynamic = "force-dynamic";

import { ForgotPasswordForm } from "@/components/domain/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-1 mb-2">
        <h1 className="font-headline italic text-3xl md:text-4xl text-on-surface leading-tight">
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
