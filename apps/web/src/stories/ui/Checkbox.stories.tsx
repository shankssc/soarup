import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark",  value: "#0e0e10" },
        { name: "light", value: "#ebfdfc" },
      ],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Playground ───────────────────────────────────────────────────────────────

export const Playground: Story = {
  args: {
    disabled: false,
  },
};

// ─── All States ───────────────────────────────────────────────────────────────

export const AllStates: Story = {
  render: () => (
    <div className="space-y-6 p-8">
      <Row label="unchecked">
        <Checkbox />
      </Row>
      <Row label="checked">
        <Checkbox defaultChecked />
      </Row>
      <Row label="disabled unchecked">
        <Checkbox disabled />
      </Row>
      <Row label="disabled checked">
        <Checkbox disabled defaultChecked />
      </Row>
    </div>
  ),
};

// ─── CheckboxField (composed) ─────────────────────────────────────────────────

export const CheckboxFields: Story = {
  render: () => (
    <div className="space-y-4 p-8">
      <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-6">
        CheckboxField — composed with label
      </p>
      <CheckboxField label="Remember me" />
      <CheckboxField label="Enable email digests" defaultChecked />
      <CheckboxField label="Receive Slack notifications" />
      <CheckboxField label="Make my profile public" disabled />
      <CheckboxField label="Accept terms and conditions" disabled defaultChecked />
    </div>
  ),
};

// ─── In a Form Context ────────────────────────────────────────────────────────
// Shows how CheckboxField sits within the auth login form.

export const InFormContext: Story = {
  render: () => (
    <div className="w-80 p-8">
      <div className="flex items-center justify-between">
        <CheckboxField label="Remember me" />
        <button className="font-label text-[10px] uppercase tracking-widest text-primary hover:text-secondary transition-colors">
          Forgot password?
        </button>
      </div>
    </div>
  ),
};

// ─── Light Background ─────────────────────────────────────────────────────────

export const OnLightBackground: Story = {
  parameters: {
    backgrounds: { default: "light" },
  },
  render: () => (
    <div className="space-y-4 p-8">
      <CheckboxField label="Remember me" />
      <CheckboxField label="Enable email digests" defaultChecked />
    </div>
  ),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="font-label text-[10px] uppercase tracking-widest text-outline w-36 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}
