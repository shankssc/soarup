// apps/web/src/app/(app)/layout.tsx

import { AppShell } from '@/components/layout/app-shell';

export const runtime = 'edge';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
