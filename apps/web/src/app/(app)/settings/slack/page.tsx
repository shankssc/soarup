'use client';

import * as React from 'react';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  useSlackSettings,
  useUpdateSlackSettings,
  useSendSlackTest,
  useRemoveSlackIntegration,
} from '@/hooks/useSlack';

export default function SlackSettingsPage() {
  const { data: workspace } = useWorkspace();
  const { data: settings, isLoading } = useSlackSettings(workspace?.id);
  const updateSettings = useUpdateSlackSettings(workspace?.id ?? '');
  const sendTest = useSendSlackTest(workspace?.id ?? '');
  const removeIntegration = useRemoveSlackIntegration(workspace?.id ?? '');

  const [webhookUrl, setWebhookUrl] = React.useState('');
  const [isDirty, setIsDirty] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = React.useState(false);

  async function handleSave() {
    await updateSettings.mutateAsync({
      webhook_url: webhookUrl || undefined,
    });
    setIsDirty(false);
    setWebhookUrl('');
  }

  async function handleToggle(key: 'slack_digest_enabled' | 'slack_updates_enabled') {
    await updateSettings.mutateAsync({
      [key]: !settings?.[key],
    });
  }

  async function handleTest() {
    setTestResult(null);
    const result = await sendTest.mutateAsync();
    setTestResult(result);
  }

  async function handleRemove() {
    await removeIntegration.mutateAsync();
    setShowRemoveConfirm(false);
  }

  if (isLoading || !workspace) {
    return (
      <div className="flex justify-center py-16">
        <span
          className="material-symbols-outlined animate-spin text-[32px] text-primary"
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          aria-hidden="true"
        >
          progress_activity
        </span>
      </div>
    );
  }

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
        {settings?.slack_configured ? (
          <div className="flex items-center gap-2 border border-outline-variant bg-surface-high px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-label text-xs text-on-surface-variant">
              Connected · webhook ending in{' '}
              <code className="text-primary">{settings.webhook_url_hint}</code>
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
            value={webhookUrl}
            onChange={(e) => {
              setWebhookUrl(e.target.value);
              setIsDirty(true);
            }}
            placeholder={
              settings?.slack_configured
                ? 'Enter new URL to replace existing'
                : 'https://hooks.slack.com/services/...'
            }
            className="w-full border-b border-outline-variant bg-transparent pb-2 text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:border-primary"
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
              How to set this up →
            </a>
          </p>
        </div>

        {/* Notification toggles */}
        <div className="space-y-4">
          <label className="block font-label text-[10px] uppercase tracking-[0.2em] text-outline">
            Notifications
          </label>

          {(
            [
              {
                key: 'slack_digest_enabled' as const,
                label: 'Send daily digest to Slack',
                description:
                  'Posts the team digest to your channel after email delivery',
              },
              {
                key: 'slack_updates_enabled' as const,
                label: 'Send update notifications',
                description:
                  "Posts a message when a team member's standup is processed",
              },
            ] as const
          ).map(({ key, label, description }) => (
            <div key={key} className="flex items-start justify-between gap-4">
              <div>
                <p className="font-body text-sm text-on-surface">{label}</p>
                <p className="mt-0.5 font-label text-[11px] text-outline">
                  {description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggle(key)}
                disabled={!settings?.slack_configured || updateSettings.isPending}
                role="switch"
                aria-checked={settings?.[key] ?? false}
                aria-label={label}
                className={[
                  'relative h-6 w-12 flex-shrink-0 overflow-hidden rounded-full transition-colors',
                  'disabled:opacity-40',
                  settings?.[key] ? 'bg-primary' : 'bg-surface-highest',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute bottom-1 top-1 w-4 rounded-full bg-white transition-all duration-200',
                    settings?.[key] ? 'left-auto right-1' : 'left-1 right-auto',
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
            onClick={handleTest}
            disabled={!settings?.slack_configured || sendTest.isPending}
            className="border border-outline-variant px-4 py-2 font-label text-xs uppercase tracking-[0.15em] text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
          >
            {sendTest.isPending ? 'Sending...' : 'Send test message'}
          </button>

          {isDirty && (
            <button
              type="button"
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="asymmetric-btn text-on-primary bg-primary px-6 py-2 font-label text-xs uppercase tracking-[0.15em] disabled:opacity-60"
            >
              {updateSettings.isPending ? 'Saving...' : 'Save settings →'}
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
        {settings?.slack_configured && (
          <div className="space-y-3 border-t border-outline-variant pt-6">
            <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
              Danger zone
            </p>
            {!showRemoveConfirm ? (
              <button
                type="button"
                onClick={() => setShowRemoveConfirm(true)}
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
                    onClick={handleRemove}
                    disabled={removeIntegration.isPending}
                    className="font-label text-xs text-error hover:underline disabled:opacity-40"
                  >
                    {removeIntegration.isPending ? 'Removing...' : 'Yes, remove'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRemoveConfirm(false)}
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
