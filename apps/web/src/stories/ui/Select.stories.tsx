// apps/web/src/components/ui/Select.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { SelectField } from '@/components/ui/select';
import { getGroupedTimezones } from '@/lib/utils/timezones';

// ─── Shared data ──────────────────────────────────────────────────────────────

const TIMEZONE_GROUPS = getGroupedTimezones().map((g) => ({
  label: g.region,
  items: g.timezones.map((tz) => ({ value: tz.value, label: tz.label })),
}));

const SIMPLE_GROUPS = [
  {
    label: 'Roles',
    items: [
      { value: 'owner', label: 'Owner' },
      { value: 'admin', label: 'Admin' },
      { value: 'member', label: 'Member' },
    ],
  },
];

// ─── Controlled wrapper ───────────────────────────────────────────────────────

function ControlledSelect(
  props: Omit<React.ComponentProps<typeof SelectField>, 'value' | 'onValueChange'> & {
    defaultValue?: string;
  },
) {
  const [value, setValue] = useState(props.defaultValue ?? '');
  return <SelectField {...props} value={value} onValueChange={setValue} />;
}

// ─── Theme wrapper ────────────────────────────────────────────────────────────
// Provides a padded surface card so the select is visible in both themes.
// Theme switching is handled by parameters.theme which ThemeProvider reads
// via preview.ts — do not manipulate document.documentElement here.

function Surface(Story: React.ComponentType) {
  return (
    <div className="w-[400px] border border-outline-variant bg-surface-high p-8">
      <Story />
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'UI/SelectField',
  component: SelectField,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  // Required props at meta level so stories using render() satisfy type inference
  args: {
    label: 'Select',
    value: '',
    onValueChange: () => {},
    groups: SIMPLE_GROUPS,
  },
} satisfies Meta<typeof SelectField>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const SimpleGroupDark: Story = {
  name: 'Simple Group (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Role"
      placeholder="Select a role..."
      groups={SIMPLE_GROUPS}
    />
  ),
};

export const SimpleGroupLight: Story = {
  name: 'Simple Group (Light)',
  parameters: { theme: 'light' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Role"
      placeholder="Select a role..."
      groups={SIMPLE_GROUPS}
    />
  ),
};

export const WithValueDark: Story = {
  name: 'Pre-selected Value (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect label="Role" defaultValue="admin" groups={SIMPLE_GROUPS} />
  ),
};

export const WithValueLight: Story = {
  name: 'Pre-selected Value (Light)',
  parameters: { theme: 'light' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect label="Role" defaultValue="admin" groups={SIMPLE_GROUPS} />
  ),
};

export const WithErrorDark: Story = {
  name: 'Error State (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Role"
      placeholder="Select a role..."
      groups={SIMPLE_GROUPS}
      error="Please select a role."
    />
  ),
};

export const WithErrorLight: Story = {
  name: 'Error State (Light)',
  parameters: { theme: 'light' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Role"
      placeholder="Select a role..."
      groups={SIMPLE_GROUPS}
      error="Please select a role."
    />
  ),
};

export const DisabledDark: Story = {
  name: 'Disabled (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Role"
      defaultValue="member"
      groups={SIMPLE_GROUPS}
      disabled
    />
  ),
};

export const DisabledLight: Story = {
  name: 'Disabled (Light)',
  parameters: { theme: 'light' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Role"
      defaultValue="member"
      groups={SIMPLE_GROUPS}
      disabled
    />
  ),
};

export const SearchableTimezonesDark: Story = {
  name: 'Searchable Timezones (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Timezone"
      placeholder="Select timezone..."
      searchable
      searchPlaceholder="Search timezones..."
      groups={TIMEZONE_GROUPS}
      defaultValue="America/New_York"
    />
  ),
};

export const SearchableTimezonesLight: Story = {
  name: 'Searchable Timezones (Light)',
  parameters: { theme: 'light' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Timezone"
      placeholder="Select timezone..."
      searchable
      searchPlaceholder="Search timezones..."
      groups={TIMEZONE_GROUPS}
      defaultValue="America/New_York"
    />
  ),
};

export const SearchableEmptyState: Story = {
  name: 'Searchable — No Results (Dark)',
  parameters: { theme: 'dark' },
  decorators: [Surface],
  render: () => (
    <ControlledSelect
      label="Timezone"
      placeholder="Select timezone..."
      searchable
      searchPlaceholder="Search timezones..."
      groups={[]}
    />
  ),
};
