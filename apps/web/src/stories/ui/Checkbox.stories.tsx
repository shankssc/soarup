import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';

const meta = {
  title: 'UI/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add('dark');
  return (
    <div className="bg-surface p-8">
      <Story />
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove('dark');
  return (
    <div className="bg-[#ebfdfc] p-8">
      <Story />
    </div>
  );
};

export const Playground: Story = {
  args: { disabled: false },
  decorators: [dark],
};

export const AllStatesDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-5">
      <Row label="unchecked">
        <Checkbox />
      </Row>
      <Row label="checked">
        <Checkbox defaultChecked />
      </Row>
      <Row label="disabled">
        <Checkbox disabled />
      </Row>
      <Row label="disabled checked">
        <Checkbox disabled defaultChecked />
      </Row>
    </div>
  ),
};

export const AllStatesLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-5">
      <Row label="unchecked">
        <Checkbox />
      </Row>
      <Row label="checked">
        <Checkbox defaultChecked />
      </Row>
      <Row label="disabled">
        <Checkbox disabled />
      </Row>
      <Row label="disabled checked">
        <Checkbox disabled defaultChecked />
      </Row>
    </div>
  ),
};

export const CheckboxFieldsDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-4">
      <CheckboxField label="Remember me" />
      <CheckboxField label="Enable email digests" defaultChecked />
      <CheckboxField label="Receive Slack notifications" />
      <CheckboxField label="Disabled field" disabled />
    </div>
  ),
};

export const CheckboxFieldsLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-4">
      <CheckboxField label="Remember me" />
      <CheckboxField label="Enable email digests" defaultChecked />
      <CheckboxField label="Receive Slack notifications" />
      <CheckboxField label="Disabled field" disabled />
    </div>
  ),
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-32 shrink-0 font-label text-[10px] uppercase tracking-widest text-outline">
        {label}
      </span>
      {children}
    </div>
  );
}
