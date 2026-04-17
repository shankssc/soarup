'apps/web/src/app/(auth)/signup/page.tsx';

export const dynamic = 'force-dynamic';

import { SignupForm } from '@/components/domain/auth/signup-form';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function SignupPage() {
  // Redirect if already authenticated — no point showing signup to logged-in users
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-8">
      <div className="mb-2 space-y-1">
        <h1 className="font-headline text-3xl italic leading-tight text-on-surface md:text-4xl">
          Create your account
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Join SoarUp in under 60 seconds
        </p>
      </div>

      <SignupForm />
    </div>
  );
}
