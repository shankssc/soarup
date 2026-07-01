// apps/web/src/stories/settings/SlackSettingsPage.stories.tsx
// Page-level story for Slack integration settings.
// SlackSettingsPage uses hooks directly (no view component split)
// so we render the UI statically here using the same layout as ProfilePage.stories.tsx.

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[800px]">
            <Story />
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Static Slack settings form ───────────────────────────────────────────────

function SlackSettingsForm({
  connected,
  webhookHint,
  digestEnabled,
  updatesEnabled,
  isDirty,
  isSaving,
  isSendingTest,
  testResult,
  showRemoveConfirm,
}: {
  connected: boolean;
  webhookHint: string | null;
  digestEnabled: boolean;
  updatesEnabled: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isSendingTest: boolean;
  testResult: { success: boolean; message: string } | null;
  showRemoveConfirm: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* Page header */}
      <div className="border-b border-outline-variant pb-3">
        <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Settings — Slack
        </h2>
      </div>

      <div className="max-w-lg space-y-8">
        {/* Connection status banner */}
        {connected ? (
          <div className="flex items-center gap-2 border border-outline-variant bg-surface-high px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-label text-xs text-on-surface-variant">
              Connected · webhook ending in{' '}
              <code className="text-primary">{webhookHint}</code>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 border border-outline-variant bg-surface-high px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="font-label text-xs text-on-surface-variant">
              Not connected
            </span>
          </div>
        )}

        {/* Webhook URL section */}
        <div className="space-y-2">
          <label className="block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
            Webhook URL
          </label>
          <input
            type="url"
            readOnly
            placeholder={
              connected
                ? 'Enter new URL to replace existing'
                : 'https://hooks.slack.com/services/...'
            }
            className="w-full border-b border-outline-variant bg-transparent pb-2 text-sm text-on-surface outline-none placeholder:text-outline"
          />
          <p className="font-label text-[10px] text-outline">
            Create an incoming webhook in your Slack workspace settings and paste the
            URL here.{' '}
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {'How to set this up →'}
            </a>
          </p>
        </div>

        {/* Notification toggles */}
        <div className="space-y-4">
          <label className="block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
            Notifications
          </label>

          {[
            {
              key: 'digest',
              label: 'Send daily digest to Slack',
              description: 'Posts the team digest to your channel after email delivery',
              enabled: digestEnabled,
            },
            {
              key: 'updates',
              label: 'Send update notifications',
              description: "Posts a message when a team member's standup is processed",
              enabled: updatesEnabled,
            },
          ].map(({ key, label, description, enabled }) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-sm text-on-surface">{label}</p>
                <p className="mt-0.5 font-label text-[11px] text-outline">
                  {description}
                </p>
              </div>
              <button
                type="button"
                disabled={!connected}
                role="switch"
                aria-checked={enabled}
                aria-label={label}
                className={[
                  'relative h-6 w-12 flex-shrink-0 overflow-hidden rounded-full transition-colors',
                  'disabled:opacity-40',
                  enabled ? 'bg-primary' : 'bg-surface-highest',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute bottom-1 top-1 w-4 rounded-full bg-white transition-all duration-200',
                    enabled ? 'left-auto right-1' : 'left-1 right-auto',
                  ].join(' ')}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Test + Save */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!connected || isSendingTest}
            className="border border-outline-variant px-4 py-2 font-label text-xs uppercase tracking-[0.15em] text-on-surface-variant disabled:opacity-40"
          >
            {isSendingTest ? 'Sending...' : 'Send test message'}
          </button>

          {isDirty && (
            <button
              type="button"
              disabled={isSaving}
              className="asymmetric-btn text-on-primary bg-primary px-6 py-2 font-label text-xs uppercase tracking-[0.15em] disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save settings →'}
            </button>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <p
            className={[
              'font-label text-xs',
              testResult.success ? 'text-emerald-400' : 'text-error',
            ].join(' ')}
          >
            {testResult.message}
          </p>
        )}

        {/* Danger zone */}
        {connected && (
          <div className="space-y-3 border-t border-outline-variant pt-6">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
              Danger zone
            </p>
            {!showRemoveConfirm ? (
              <button
                type="button"
                className="font-label text-xs text-error hover:underline"
              >
                Remove Slack integration
              </button>
            ) : (
              <div className="space-y-2">
                <p className="font-body text-sm text-on-surface-variant">
                  This will clear your webhook URL and disable all Slack notifications.
                  Are you sure?
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="font-label text-xs text-error hover:underline"
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    className="font-label text-xs text-outline hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Settings/Slack',
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/settings/slack' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const NotConnectedDark: Story = {
  name: 'Not Connected (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={false}
      webhookHint={null}
      digestEnabled={false}
      updatesEnabled={false}
      isDirty={false}
      isSaving={false}
      isSendingTest={false}
      testResult={null}
      showRemoveConfirm={false}
    />
  ),
};

export const NotConnectedLight: Story = {
  name: 'Not Connected (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  render: NotConnectedDark.render,
};

export const ConnectedDark: Story = {
  name: 'Connected — Toggles Enabled (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={true}
      webhookHint="...8Y5TV0HJ"
      digestEnabled={true}
      updatesEnabled={true}
      isDirty={false}
      isSaving={false}
      isSendingTest={false}
      testResult={null}
      showRemoveConfirm={false}
    />
  ),
};

export const ConnectedLight: Story = {
  name: 'Connected — Toggles Enabled (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  render: ConnectedDark.render,
};

export const DirtyDark: Story = {
  name: 'Unsaved Webhook URL (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={true}
      webhookHint="...8Y5TV0HJ"
      digestEnabled={true}
      updatesEnabled={false}
      isDirty={true}
      isSaving={false}
      isSendingTest={false}
      testResult={null}
      showRemoveConfirm={false}
    />
  ),
};

export const SavingDark: Story = {
  name: 'Saving State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={true}
      webhookHint="...8Y5TV0HJ"
      digestEnabled={true}
      updatesEnabled={true}
      isDirty={true}
      isSaving={true}
      isSendingTest={false}
      testResult={null}
      showRemoveConfirm={false}
    />
  ),
};

export const TestSuccessDark: Story = {
  name: 'Test Message — Success (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={true}
      webhookHint="...8Y5TV0HJ"
      digestEnabled={true}
      updatesEnabled={true}
      isDirty={false}
      isSaving={false}
      isSendingTest={false}
      testResult={{
        success: true,
        message: 'Test message sent successfully. Check your Slack channel.',
      }}
      showRemoveConfirm={false}
    />
  ),
};

export const TestFailureDark: Story = {
  name: 'Test Message — Failure (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={true}
      webhookHint="...8Y5TV0HJ"
      digestEnabled={true}
      updatesEnabled={true}
      isDirty={false}
      isSaving={false}
      isSendingTest={false}
      testResult={{
        success: false,
        message:
          'Failed to send test message. Check that the webhook URL is correct and the Slack app is still installed in your workspace.',
      }}
      showRemoveConfirm={false}
    />
  ),
};

export const RemoveConfirmDark: Story = {
  name: 'Remove Confirm — Danger Zone Open (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  render: () => (
    <SlackSettingsForm
      connected={true}
      webhookHint="...8Y5TV0HJ"
      digestEnabled={false}
      updatesEnabled={false}
      isDirty={false}
      isSaving={false}
      isSendingTest={false}
      testResult={null}
      showRemoveConfirm={true}
    />
  ),
};
