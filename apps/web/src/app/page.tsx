//apps/web/src/app/page.tsx

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  redirect(session ? '/dashboard' : '/login');
}
