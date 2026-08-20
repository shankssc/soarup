// apps/web/src/stories/settings/DigestSettingsPage.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import {
  DigestSettingsPanel,
  type DigestSettingsValues,
} from '@/components/domain/digests/digest-settings-panel';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DISABLED_VALUES: DigestSettingsValues = {
  digest_enabled: false,
  digest_send_time: '09:00',
  digest_timezone: null,
  digest_days: '1,2,3,4,5',
};

const ENABLED_VALUES: DigestSettingsValues = {
  digest_enabled: true,
  digest_send_time: '09:00',
  digest_timezone: 'America/New_York',
  digest_days: '1,2,3,4,5',
};

const CUSTOM_DAYS_VALUES: DigestSettingsValues = {
  digest_enabled: true,
  digest_send_time: '14:30',
  digest_timezone: 'Europe/London',
  digest_days: '1,3,5',
};

const noop = () => {};
const asyncNoop = async () => {};

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-1 flex-col md:ml-64">
        <main className="flex-1 p-8">
          <div className="mx-auto max-w-[800px]">
            <div className="mb-8 flex flex-col gap-8">
              <div className="border-b border-outline-variant pb-3">
                <h2 className="font-label text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
                  Settings — Digest
                </h2>
              </div>
              <Story />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Settings/Digest',
  component: DigestSettingsPanel,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/settings/digest' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DigestSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const DisabledDark: Story = {
  name: 'Disabled State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    values: DISABLED_VALUES,
    isSaving: false,
    isDirty: false,
    previewHtml: null,
    isLoadingPreview: false,
    onToggleEnabled: noop,
    onSendTimeChange: noop,
    onTimezoneChange: noop,
    onDaysChange: noop,
    onSave: noop,
    onPreview: asyncNoop,
  },
};

export const DisabledLight: Story = {
  name: 'Disabled State (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  args: { ...DisabledDark.args },
};

export const EnabledDark: Story = {
  name: 'Enabled State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...DisabledDark.args,
    values: ENABLED_VALUES,
    isDirty: false,
  },
};

export const EnabledLight: Story = {
  name: 'Enabled State (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell],
  args: { ...EnabledDark.args },
};

export const EnabledDirtyDark: Story = {
  name: 'Enabled — Unsaved Changes (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...DisabledDark.args,
    values: ENABLED_VALUES,
    isDirty: true,
  },
};

export const CustomScheduleDark: Story = {
  name: 'Custom Schedule — Mon/Wed/Fri, 2:30pm London (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...DisabledDark.args,
    values: CUSTOM_DAYS_VALUES,
    isDirty: false,
  },
};

export const SavingDark: Story = {
  name: 'Saving State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...DisabledDark.args,
    values: ENABLED_VALUES,
    isSaving: true,
    isDirty: true,
  },
};

export const LoadingPreviewDark: Story = {
  name: 'Loading Preview (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell],
  args: {
    ...DisabledDark.args,
    values: ENABLED_VALUES,
    isLoadingPreview: true,
  },
};

export const MobileEnabledDark: Story = {
  name: 'Mobile — Enabled (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
  args: {
    ...DisabledDark.args,
    values: ENABLED_VALUES,
  },
};
