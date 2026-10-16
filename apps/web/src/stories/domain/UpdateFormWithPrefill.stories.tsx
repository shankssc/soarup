// apps/web/src/stories/domain/UpdateFormWithPrefill.stories.tsx
// Visual snapshots of the UpdateForm's GitHub prefill button in different states.
// Uses static rendering so we can force each visual state without live hooks.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Loader2 } from 'lucide-react';

// ─── Shell ────────────────────────────────────────────────────────────────────

function DashboardShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto flex max-w-[800px] flex-col gap-8">
        <div className="border-b border-outline-variant pb-3">
          <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
            Today — Monday, 18 May
          </h2>
        </div>
        <Story />
      </div>
    </div>
  );
}

// ─── Static prefill form snapshot ─────────────────────────────────────────────

function PrefillFormSnapshot({
  showPrefillButton,
  prefillLoading,
  textareaContent,
}: {
  showPrefillButton: boolean;
  prefillLoading: boolean;
  textareaContent: string;
}) {
  return (
    <form className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          What did you work on?
        </label>
        {showPrefillButton && (
          <button
            type="button"
            disabled={prefillLoading}
            className="flex items-center gap-1.5 self-start font-label text-[10px] uppercase tracking-[0.08em] text-primary transition-opacity hover:opacity-70 disabled:opacity-40"
          >
            {prefillLoading && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            )}
            Fill from GitHub activity →
          </button>
        )}
      </div>

      <textarea
        readOnly
        value={textareaContent}
        placeholder="Share what you worked on…"
        rows={5}
        className="w-full resize-none border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface outline-none placeholder:text-outline"
      />

      <div className="flex items-center justify-between">
        <span className="font-label text-[10px] text-outline">
          {textareaContent.length} / 1000
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="font-label text-xs uppercase tracking-[0.15em] text-on-surface-variant hover:text-on-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="asymmetric-btn text-on-primary bg-primary px-4 py-1.5 font-label text-xs uppercase tracking-[0.15em]"
          >
            Submit →
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Updates/UpdateFormWithPrefill',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/dashboard' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const NoGitHubConnected: Story = {
  name: 'No GitHub Connected — Button Hidden (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  render: () => (
    <PrefillFormSnapshot
      showPrefillButton={false}
      prefillLoading={false}
      textareaContent=""
    />
  ),
};

export const PrefillAvailable: Story = {
  name: 'GitHub Connected — Button Visible (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  render: () => (
    <PrefillFormSnapshot
      showPrefillButton={true}
      prefillLoading={false}
      textareaContent=""
    />
  ),
};

export const PrefillLoading: Story = {
  name: 'Fetching GitHub Activity — Spinner (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  render: () => (
    <PrefillFormSnapshot
      showPrefillButton={true}
      prefillLoading={true}
      textareaContent=""
    />
  ),
};

export const PrefillFilled: Story = {
  name: 'Prefill Applied — Textarea Populated (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  render: () => (
    <PrefillFormSnapshot
      showPrefillButton={true}
      prefillLoading={false}
      textareaContent={
        'Merged: Fix auth token refresh race condition (org/api)\nClosed: Sidebar nav shows wrong active state (org/web)\n3 commit(s) across 2 repo(s)'
      }
    />
  ),
};

export const PrefillEmpty: Story = {
  name: 'Prefill Returned Empty — Button Still Visible (Dark)',
  parameters: { theme: 'dark' },
  decorators: [DashboardShell],
  render: () => (
    <PrefillFormSnapshot
      showPrefillButton={true}
      prefillLoading={false}
      textareaContent=""
    />
  ),
};
