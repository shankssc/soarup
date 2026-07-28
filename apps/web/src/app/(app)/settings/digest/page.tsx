// apps/web/src/app/(app)/settings/digest/page.tsx
// Thin data wrapper — wires useWorkspace + useUpdateDigestSettings +
// useDigestPreview + useMyDigestPreference into DigestSettingsPanel.

'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  useUpdateDigestSettings,
  useDigestPreview,
  useMyDigestPreference,
  useUpdateMyDigestPreference,
} from '@/hooks/useDigests';
import { useWorkspace, workspaceKeys } from '@/hooks/useWorkspace';
import {
  DigestSettingsPanel,
  MyNotificationToggle,
  type DigestSettingsValues,
} from '@/components/domain/digests/digest-settings-panel';

export default function DigestSettingsPage() {
  const { data: workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const updateSettings = useUpdateDigestSettings(workspaceId);
  const digestPreview = useDigestPreview(workspaceId);
  const queryClient = useQueryClient();

  const myPreference = useMyDigestPreference(workspaceId || undefined);
  const updateMyPreference = useUpdateMyDigestPreference(workspaceId);

  const [values, setValues] = React.useState<DigestSettingsValues>({
    digest_enabled: false,
    digest_send_time: '09:00',
    digest_timezone: null,
    digest_days: '1,2,3,4,5',
  });
  const [isDirty, setIsDirty] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);

  // Tracks which workspace we last synced `values` from. Comparing during
  // render (not in an effect) lets us reset `values` the moment `workspace`
  // changes, without an extra render/effect round-trip. Deliberately keyed
  // on workspace.id only, not the whole `workspace` object — a background
  // refetch that returns the same workspace shouldn't stomp local edits.
  const [syncedWorkspaceId, setSyncedWorkspaceId] = React.useState<string | undefined>(
    workspace?.id,
  );

  if (workspace && workspace.id !== syncedWorkspaceId) {
    setSyncedWorkspaceId(workspace.id);
    setValues({
      digest_enabled: workspace.digest_enabled ?? false,
      digest_send_time: workspace.digest_send_time ?? '09:00',
      digest_timezone: workspace.digest_timezone ?? null,
      digest_days: workspace.digest_days ?? '1,2,3,4,5',
    });
    setIsDirty(false);
  }

  React.useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && !isDirty) {
        queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDirty, queryClient]);

  function update(patch: Partial<DigestSettingsValues>) {
    setValues((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  }

  async function handleSave() {
    await updateSettings.mutateAsync({
      digest_enabled: values.digest_enabled,
      digest_send_time: values.digest_send_time,
      digest_timezone: values.digest_timezone,
      digest_days: values.digest_days,
    });
    setIsDirty(false);
  }

  async function handlePreview() {
    const result = await digestPreview.mutateAsync();
    setPreviewHtml(result.html);
  }

  function handleToggleMyNotifications(enabled: boolean) {
    updateMyPreference.mutate(enabled);
  }

  if (!workspace) {
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

  return (
    <div className="max-w-lg px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl text-on-surface">Digest</h1>

      <div className="flex flex-col gap-8">
        <MyNotificationToggle
          emailNotifications={myPreference.data?.email_notifications}
          isLoading={myPreference.isLoading}
          isSaving={updateMyPreference.isPending}
          onToggle={handleToggleMyNotifications}
        />

        <DigestSettingsPanel
          values={values}
          isSaving={updateSettings.isPending}
          isDirty={isDirty}
          previewHtml={previewHtml}
          isLoadingPreview={digestPreview.isPending}
          onToggleEnabled={(enabled) => update({ digest_enabled: enabled })}
          onSendTimeChange={(time) => update({ digest_send_time: time })}
          onTimezoneChange={(tz) => update({ digest_timezone: tz || null })}
          onDaysChange={(days) => update({ digest_days: days })}
          onSave={handleSave}
          onPreview={handlePreview}
        />
      </div>
    </div>
  );
}
