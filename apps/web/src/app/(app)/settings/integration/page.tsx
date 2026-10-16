'use client';

import { Loader2, CheckCircle2, Clock } from 'lucide-react';
import {
  useGitHubConnectionStatus,
  useStartGitHubConnect,
  useDisconnectGitHub,
} from '@/hooks/useGitHubIntegration';
import { Button } from '@/components/ui/button';

export default function IntegrationsPage() {
  const statusQuery = useGitHubConnectionStatus();
  const connect = useStartGitHubConnect();
  const disconnect = useDisconnectGitHub();

  if (statusQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>
    );
  }

  const installations = statusQuery.data?.installations ?? [];

  return (
    <div className="max-w-lg px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl text-on-surface">Integrations</h1>

      <div className="mb-8">
        <label className="mb-4 block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          GitHub
        </label>

        {installations.length === 0 ? (
          /* Empty state — no installations connected */
          <div className="flex items-center justify-between border border-outline-variant bg-surface-high p-4">
            <div>
              <p className="font-body text-sm text-on-surface">Connect GitHub</p>
              <p className="mt-0.5 font-label text-[11px] text-outline">
                Pre-fill your daily update from merged PRs, closed issues, and commits.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              asymmetric
              onClick={() => connect.mutate()}
              loading={connect.isPending}
            >
              Connect →
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {installations.map((installation) => (
              <div
                key={installation.id}
                className="flex items-start justify-between border border-outline-variant bg-surface-high p-4"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-on-surface">
                      {installation.account_login}
                    </span>
                    <span className="font-label text-[10px] text-outline">
                      {installation.account_type}
                    </span>
                    {installation.status === 'active' ? (
                      <span className="flex items-center gap-1 font-label text-[10px] text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 font-label text-[10px] text-amber-400">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Pending approval
                      </span>
                    )}
                  </div>
                  {installation.status === 'pending_approval' && (
                    <p className="font-label text-[11px] text-outline">
                      Waiting for an admin at {installation.account_login} to approve
                      this installation.
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnect.mutate(installation.id)}
                  loading={disconnect.isPending}
                >
                  Disconnect
                </Button>
              </div>
            ))}

            {/* Add another account */}
            <button
              type="button"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="self-start font-label text-[10px] uppercase tracking-[0.1em] text-outline transition-colors hover:text-primary disabled:opacity-40"
            >
              + Add another account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
