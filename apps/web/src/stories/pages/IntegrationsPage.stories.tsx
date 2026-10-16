// apps/web/src/stories/pages/IntegrationsPage.stories.tsx
// Page-level story for GitHub integrations settings.
// Uses static rendering — no real hooks — matching the SlackSettingsPage pattern.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 px-6 py-10">
          <div className="mx-auto max-w-lg">
            <Story />
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Static integrations page view ────────────────────────────────────────────

interface StoryInstallation {
  id: string;
  account_login: string;
  account_type: string;
  status: string;
}

function IntegrationsPageView({
  isLoading,
  installations,
}: {
  isLoading: boolean;
  installations: StoryInstallation[];
}) {
  const connected = installations.length > 0;

  return (
    <div>
      <h1 className="mb-8 font-serif text-3xl text-on-surface">Integrations</h1>

      <div className="space-y-6">
        <h2 className="border-b border-outline-variant pb-2 font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          GitHub
        </h2>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="font-body text-sm text-on-surface-variant">Loading…</span>
          </div>
        ) : !connected ? (
          <div className="space-y-3 rounded border border-outline-variant bg-surface-high p-6">
            <p className="font-body text-sm text-on-surface">Connect GitHub</p>
            <p className="font-label text-[11px] text-on-surface-variant">
              Link your GitHub account to auto-fill your standup from today&apos;s
              commits, pull requests, and closed issues.
            </p>
            <button
              type="button"
              className="asymmetric-btn text-on-primary bg-primary px-4 py-1.5 font-label text-xs uppercase tracking-[0.15em]"
            >
              Connect GitHub →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {installations.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between rounded border border-outline-variant bg-surface-high px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {inst.status === 'active' ? (
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-body text-sm text-on-surface">
                      {inst.account_login}
                    </p>
                    <p className="font-label text-[11px] text-on-surface-variant">
                      {inst.status === 'active'
                        ? inst.account_type
                        : 'Pending org admin approval'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="font-label text-[11px] uppercase tracking-[0.08em] text-error hover:underline"
                >
                  Disconnect
                </button>
              </div>
            ))}
            <button
              type="button"
              className="font-label text-[11px] text-primary hover:underline"
            >
              + Add another account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Settings/Integrations',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/settings/integrations' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const NotConnected: Story = {
  name: 'Not Connected (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => <IntegrationsPageView isLoading={false} installations={[]} />,
};

export const NotConnectedLight: Story = {
  name: 'Not Connected (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  render: NotConnected.render,
};

export const ConnectedPersonal: Story = {
  name: 'Connected — Personal Account (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <IntegrationsPageView
      isLoading={false}
      installations={[
        {
          id: 'row-1',
          account_login: 'suyash15122',
          account_type: 'User',
          status: 'active',
        },
      ]}
    />
  ),
};

export const ConnectedOrg: Story = {
  name: 'Connected — Org Account (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <IntegrationsPageView
      isLoading={false}
      installations={[
        {
          id: 'row-2',
          account_login: 'soarup-hq',
          account_type: 'Organization',
          status: 'active',
        },
      ]}
    />
  ),
};

export const PendingApproval: Story = {
  name: 'Pending Org Approval (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <IntegrationsPageView
      isLoading={false}
      installations={[
        {
          id: 'row-3',
          account_login: 'acme-corp',
          account_type: 'Organization',
          status: 'pending_approval',
        },
      ]}
    />
  ),
};

export const MultipleInstallations: Story = {
  name: 'Multiple Installations (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <IntegrationsPageView
      isLoading={false}
      installations={[
        {
          id: 'row-1',
          account_login: 'suyash15122',
          account_type: 'User',
          status: 'active',
        },
        {
          id: 'row-2',
          account_login: 'soarup-hq',
          account_type: 'Organization',
          status: 'active',
        },
      ]}
    />
  ),
};

export const Loading: Story = {
  name: 'Loading State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => <IntegrationsPageView isLoading={true} installations={[]} />,
};
