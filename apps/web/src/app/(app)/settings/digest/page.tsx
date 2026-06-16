// apps/web/src/app/(app)/settings/digest/page.tsx
// Thin data wrapper — wires useWorkspace + useUpdateDigestSettings +
// useDigestPreview into DigestSettingsPanel.

'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDigestSettings, useDigestPreview } from '@/hooks/useDigests';
import { useWorkspace, workspaceKeys } from '@/hooks/useWorkspace';
import {
  DigestSettingsPanel,
  type DigestSettingsValues,
} from '@/components/domain/digests/digest-settings-panel';

export default function DigestSettingsPage() {
  const { data: workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? '';

  const updateSettings = useUpdateDigestSettings(workspaceId);
  const digestPreview = useDigestPreview(workspaceId);
  const queryClient = useQueryClient();

  // Local form state — initialised from workspace once loaded
  const [values, setValues] = React.useState<DigestSettingsValues>({
    digest_enabled: false,
    digest_send_time: '09:00',
    digest_timezone: null,
    digest_days: '1,2,3,4,5',
  });
  const [isDirty, setIsDirty] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);

  // Sync form state from workspace once it loads
  React.useEffect(() => {
    if (!workspace) return;
    setValues({
      digest_enabled: workspace.digest_enabled ?? false,
      digest_send_time: workspace.digest_send_time ?? '09:00',
      digest_timezone: workspace.digest_timezone ?? null,
      digest_days: workspace.digest_days ?? '1,2,3,4,5',
    });
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]); // only re-sync on workspace change, not on every render

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

  if (!workspace) {
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
          Settings — Digest
        </h2>
      </div>

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
  );
}
