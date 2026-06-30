// apps/web/src/components/layout/sidebar.tsx
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocketStore } from '@/stores/websocket-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { WorkspaceResponse } from '@/hooks/useWorkspace';

interface SidebarProps {
  workspace: WorkspaceResponse | null;
  workspaceLoading: boolean;
}

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/history', label: 'History', icon: 'summarize' },
  {
    href: '/settings/members',
    label: 'Settings',
    icon: 'settings',
    activePrefix: '/settings',
  },
];

const SETTINGS_LINKS = [
  { href: '/settings/profile', label: 'Profile', icon: 'person' },
  { href: '/settings/members', label: 'Members', icon: 'group' },
  { href: '/settings/digest', label: 'Digest', icon: 'mail' },
  { href: '/settings/slack', label: 'Slack', icon: 'tag' },
  { href: '/settings/workspace', label: 'Workspace', icon: 'business' },
];

function NavIcon({ icon, filled }: { icon: string; filled?: boolean }) {
  return (
    <span
      className={cn('material-symbols-outlined text-[18px]', filled && 'filled')}
      style={{
        fontVariationSettings: filled ? "'FILL' 1, 'wght' 400" : "'FILL' 0, 'wght' 300",
      }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

// ── Connection indicator ──────────────────────────────────────────────────────

function ConnectionIndicator() {
  const status = useWebSocketStore((s) => s.status);

  const PILL_STYLES = {
    connected: {
      pill: 'bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
      text: 'text-emerald-800',
      label: 'Live',
      pulse: false,
    },
    idle: {
      pill: 'bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
      text: 'text-emerald-800',
      label: 'Live',
      pulse: false,
    },
    connecting: {
      pill: 'bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
      text: 'text-amber-800',
      label: 'Connecting',
      pulse: true,
    },
    reconnecting: {
      pill: 'bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
      text: 'text-amber-800',
      label: 'Reconnecting...',
      pulse: true,
    },
    disconnected: null,
    error: null,
  } as const;

  const config = PILL_STYLES[status as keyof typeof PILL_STYLES];

  if (status === 'disconnected' || status === 'error') {
    return (
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 transition-opacity hover:opacity-80"
        aria-label="Connection lost — click to reconnect"
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
        <span className="font-label text-[10px] font-medium uppercase tracking-[0.08em] text-red-800">
          Connection lost · Reconnect
        </span>
      </button>
    );
  }

  if (!config) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5',
        config.pill,
      )}
      aria-label={config.label}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          config.dot,
          config.pulse && 'animate-pulse',
        )}
      />
      <span
        className={cn(
          'font-label text-[10px] font-medium uppercase tracking-[0.08em]',
          config.text,
        )}
      >
        {config.label}
      </span>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function Sidebar({ workspace, workspaceLoading }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const planLabel = workspace?.plan ?? 'free';

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <nav
        className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-outline-variant bg-surface-low md:flex"
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className="flex h-16 items-center border-b border-outline-variant px-6">
          <span className="font-label text-sm font-bold uppercase tracking-[0.12em] text-primary">
            SoarUp
          </span>
        </div>

        {/* Workspace info */}
        <div className="border-b border-outline-variant px-6 py-4">
          {workspaceLoading ? (
            <div className="h-4 w-32 animate-pulse rounded bg-surface-high" />
          ) : (
            <>
              <p className="font-body text-sm font-medium text-on-surface">
                {workspace?.name ?? '—'}
              </p>
              <p className="mt-1 font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
                {planLabel} plan
              </p>
            </>
          )}
        </div>

        {/* Nav links */}
        <div className="flex flex-1 flex-col gap-1 py-4">
          {NAV_LINKS.map(({ href, label, icon, activePrefix }) => {
            const isActive =
              pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (activePrefix ? pathname.startsWith(activePrefix) : false);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-6 py-2.5 font-label text-sm font-bold uppercase tracking-[0.06em] transition-colors',
                  isActive
                    ? 'shadow-card border-l-2 border-primary bg-surface-high text-primary'
                    : 'border-l-2 border-transparent text-on-surface-variant hover:bg-surface-high hover:text-on-surface',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <NavIcon icon={icon} filled={isActive} />
                {label}
              </Link>
            );
          })}

          {/* Settings sub-links — shown when on any /settings/* route */}
          {pathname.startsWith('/settings') && (
            <div className="flex flex-col gap-0.5 px-3 py-1">
              {SETTINGS_LINKS.map(({ href, label, icon }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 rounded px-3 py-2 font-label text-xs uppercase tracking-[0.06em] transition-colors',
                      isActive
                        ? 'border-l-2 border-primary pl-2.5 text-primary'
                        : 'border-l-2 border-transparent pl-2.5 text-on-surface-variant hover:text-on-surface',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <NavIcon icon={icon} filled={isActive} />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Connection indicator */}
        <div className="border-t border-outline-variant px-6 py-3">
          <ConnectionIndicator />
        </div>

        {/* User + sign out */}
        <div className="border-t border-outline-variant px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-outline-variant bg-surface-high">
              {user?.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name ?? user.email ?? 'Avatar'}
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-label text-xs font-bold uppercase text-on-surface-variant">
                  {(user?.full_name ?? user?.email ?? '?')[0].toUpperCase()}
                </span>
              )}
            </div>

            {/* Name + email */}
            <div className="min-w-0 flex-1">
              <p className="truncate font-body text-sm font-medium text-on-surface">
                {user?.full_name ?? user?.email}
              </p>
              {user?.full_name && (
                <p className="truncate font-label text-[10px] tracking-[0.08em] text-on-surface-variant">
                  {user.email}
                </p>
              )}
            </div>

            {/* Sign out */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={logout}
              aria-label="Sign out"
              className="shrink-0 text-on-surface-variant hover:text-error"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                aria-hidden="true"
              >
                logout
              </span>
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom nav ────────────────────────────────────────────── */}
      <nav
        className="bg-surface-lowest/90 fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant px-4 pb-4 pt-2 backdrop-blur-xl md:hidden"
        aria-label="Mobile navigation"
      >
        {NAV_LINKS.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 p-2 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <NavIcon icon={icon} filled={isActive} />
              <span className="font-label text-[10px] uppercase tracking-[0.08em]">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
