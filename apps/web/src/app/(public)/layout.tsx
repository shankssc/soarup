// apps/web/src/app/(public)/layout.tsx
// Minimal layout for public routes (invite acceptance, etc.).
// No AppShell, no auth guard, no sidebar.
// Root layout (app/layout.tsx) already provides ThemeProvider,
// QueryProvider, fonts, and globals — nothing to add here.

export const runtime = 'edge';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background">{children}</div>;
}
