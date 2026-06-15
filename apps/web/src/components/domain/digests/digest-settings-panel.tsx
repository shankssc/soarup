// apps/web/src/components/domain/digests/digest-settings-panel.tsx
// Pure presentational — receives all state and callbacks as props.
// No hooks, no data fetching. Storybook testable.

'use client';

import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DigestSettingsValues {
  digest_enabled: boolean;
  digest_send_time: string; // HH:MM
  digest_timezone: string | null;
  digest_days: string; // "1,2,3,4,5"
}

export interface DigestSettingsPanelProps {
  values: DigestSettingsValues;
  isSaving: boolean;
  isDirty: boolean;
  previewHtml: string | null;
  isLoadingPreview: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSendTimeChange: (time: string) => void;
  onTimezoneChange: (tz: string) => void;
  onDaysChange: (days: string) => void;
  onSave: () => void;
  onPreview: () => void;
}

// ─── Day pills ────────────────────────────────────────────────────────────────

const DAYS = [
  { iso: '1', label: 'M' },
  { iso: '2', label: 'T' },
  { iso: '3', label: 'W' },
  { iso: '4', label: 'T' },
  { iso: '5', label: 'F' },
  { iso: '6', label: 'S' },
  { iso: '7', label: 'S' },
];

function DayPills({
  value,
  onChange,
}: {
  value: string;
  onChange: (days: string) => void;
}) {
  const active = new Set(value.split(',').filter(Boolean));

  function toggle(iso: string) {
    const next = new Set(active);
    if (next.has(iso)) {
      next.delete(iso);
    } else {
      next.add(iso);
    }
    // Keep canonical order 1–7
    const sorted = ['1', '2', '3', '4', '5', '6', '7'].filter((d) => next.has(d));
    onChange(sorted.join(','));
  }

  return (
    <div className="flex gap-1.5">
      {DAYS.map(({ iso, label }) => {
        const isActive = active.has(iso);
        return (
          <button
            key={iso}
            type="button"
            onClick={() => toggle(iso)}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-full',
              'font-label text-[12px] font-medium transition-colors duration-150',
              isActive
                ? 'bg-primary text-primary-on'
                : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary',
            ].join(' ')}
            aria-pressed={isActive}
            aria-label={`Day ${iso}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Preview modal ────────────────────────────────────────────────────────────

function DigestPreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="relative mx-4 flex h-[80vh] w-full max-w-2xl flex-col border border-outline-variant bg-surface">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <span className="font-label text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
            Digest preview
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant transition-colors hover:text-on-surface"
            aria-label="Close preview"
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
              aria-hidden="true"
            >
              close
            </span>
          </button>
        </div>

        {/* Iframe — sandboxed, never dangerouslySetInnerHTML */}
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          className="w-full flex-1 border-0"
          title="Digest email preview"
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DigestSettingsPanel({
  values,
  isSaving,
  isDirty,
  previewHtml,
  isLoadingPreview,
  onToggleEnabled,
  onSendTimeChange,
  onTimezoneChange,
  onDaysChange,
  onSave,
  onPreview,
}: DigestSettingsPanelProps) {
  const [showPreview, setShowPreview] = React.useState(false);

  // Split HH:MM for separate selects
  const [sendHour, sendMinute] = values.digest_send_time.split(':');

  function handleHourChange(h: string) {
    onSendTimeChange(`${h}:${sendMinute}`);
  }

  function handleMinuteChange(m: string) {
    onSendTimeChange(`${sendHour}:${m}`);
  }

  async function handlePreviewClick() {
    await onPreview();
    setShowPreview(true);
  }

  return (
    <div className="flex max-w-lg flex-col gap-8">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-body text-[14px] text-on-surface">Daily digest</span>
          <span className="font-body text-[12px] text-on-surface-variant">
            Send a team summary email each day when updates exist.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={values.digest_enabled}
          onClick={() => onToggleEnabled(!values.digest_enabled)}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer',
            'rounded-full border-2 border-transparent',
            'transition-colors duration-200',
            values.digest_enabled ? 'bg-primary' : 'bg-surface-high',
          ].join(' ')}
        >
          <span
            className={[
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-surface',
              'shadow ring-0 transition-transform duration-200',
              values.digest_enabled ? 'translate-x-5' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Settings — only shown when enabled */}
      {values.digest_enabled && (
        <>
          {/* Send time */}
          <div className="flex flex-col gap-2">
            <label className="font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
              Send time
            </label>
            <div className="flex items-center gap-2">
              <select
                value={sendHour}
                onChange={(e) => handleHourChange(e.target.value)}
                className={[
                  'border-b border-outline-variant bg-transparent',
                  'px-1 py-2 font-body text-[14px] text-on-surface',
                  'focus:border-primary focus:outline-none',
                  'transition-colors duration-150',
                ].join(' ')}
              >
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(
                  (h) => (
                    <option key={h} value={h} className="bg-surface">
                      {h}
                    </option>
                  ),
                )}
              </select>
              <span className="font-body text-[14px] text-on-surface-variant">:</span>
              <select
                value={sendMinute}
                onChange={(e) => handleMinuteChange(e.target.value)}
                className={[
                  'border-b border-outline-variant bg-transparent',
                  'px-1 py-2 font-body text-[14px] text-on-surface',
                  'focus:border-primary focus:outline-none',
                  'transition-colors duration-150',
                ].join(' ')}
              >
                {['00', '15', '30', '45'].map((m) => (
                  <option key={m} value={m} className="bg-surface">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Timezone */}
          <div className="flex flex-col gap-2">
            <label className="font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
              Timezone
            </label>
            <select
              value={values.digest_timezone ?? ''}
              onChange={(e) => onTimezoneChange(e.target.value)}
              className={[
                'w-full border-b border-outline-variant bg-transparent',
                'py-2 font-body text-[14px] text-on-surface',
                'focus:border-primary focus:outline-none',
                'transition-colors duration-150',
              ].join(' ')}
            >
              <option value="" className="bg-surface">
                — Use owner profile timezone —
              </option>
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz} className="bg-surface">
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {/* Days of week */}
          <div className="flex flex-col gap-2">
            <label className="font-label text-[10px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
              Send on
            </label>
            <DayPills value={values.digest_days} onChange={onDaysChange} />
          </div>

          {/* Preview button */}
          <div>
            <button
              type="button"
              onClick={handlePreviewClick}
              disabled={isLoadingPreview}
              className={[
                'flex items-center gap-2',
                'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
                'border border-outline-variant px-4 py-2',
                'text-on-surface-variant hover:border-primary hover:text-primary',
                'transition-colors duration-150',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                aria-hidden="true"
              >
                preview
              </span>
              {isLoadingPreview ? 'Generating...' : 'Preview digest'}
            </button>
          </div>
        </>
      )}

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className={[
            'relative px-6 py-2.5',
            'rounded-bl-lg rounded-br-3xl rounded-tl-3xl rounded-tr-lg',
            'bg-primary text-primary-on',
            'font-label text-[12px] font-medium uppercase tracking-[0.06em]',
            'transition-opacity duration-150',
            'disabled:cursor-not-allowed disabled:opacity-40',
          ].join(' ')}
        >
          {isSaving ? 'Saving...' : 'Save settings'}
        </button>
        {isDirty && (
          <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
        )}
      </div>

      {/* Preview modal */}
      {showPreview && previewHtml !== null && (
        <DigestPreviewModal html={previewHtml} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
