'apps/web/src/app/(auth)/login/page.tsx';

export const dynamic = 'force-dynamic';

import * as React from 'react';
import { LoginForm } from '@/components/domain/auth/login-form';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Server Component — no auth check needed here (handled by middleware).
// The LoginForm inside is a Client Component that owns all interactivity.

export default async function LoginPage() {
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
        <h1 className="font-headline text-4xl italic leading-tight text-on-surface md:text-5xl">
          Welcome back
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Sign in to your workspace
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
