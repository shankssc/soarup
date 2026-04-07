import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@/components/ui/input";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    label:    { control: "text" },
    error:    { control: "text" },
    hint:     { control: "text" },
    disabled: { control: "boolean" },
    type: {
      control: "select",
      options: ["text", "email", "password"],
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add("dark");
  return (
    <div className="bg-surface p-8 w-80">
      <Story />
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove("dark");
  return (
    <div className="bg-[#ebfdfc] p-8 w-80">
      <Story />
    </div>
  );
};

// ─── Playground ───────────────────────────────────────────────────────────────

export const Playground: Story = {
  args: {
    label: "Email",
    placeholder: "you@soarup.app",
    type: "email",
  },
  decorators: [dark],
};

// ─── All states — dark ────────────────────────────────────────────────────────

export const AllStatesDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-8">
      <Input label="Default" placeholder="you@soarup.app" type="email" />
      <Input label="With value" defaultValue="suyash@soarup.app" type="email" />
      <Input label="With hint" placeholder="you@soarup.app" hint="We'll never share your email." type="email" />
      <Input label="With error" defaultValue="not-an-email" error="Please enter a valid email address." type="email" />
      <Input label="Disabled" defaultValue="suyash@soarup.app" disabled type="email" />
    </div>
  ),
};

// ─── All states — light ───────────────────────────────────────────────────────

export const AllStatesLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-8">
      <Input label="Default" placeholder="you@soarup.app" type="email" />
      <Input label="With value" defaultValue="suyash@soarup.app" type="email" />
      <Input label="With hint" placeholder="you@soarup.app" hint="We'll never share your email." type="email" />
      <Input label="With error" defaultValue="not-an-email" error="Please enter a valid email address." type="email" />
      <Input label="Disabled" defaultValue="suyash@soarup.app" disabled type="email" />
    </div>
  ),
};

// ─── Password — dark ──────────────────────────────────────────────────────────

export const PasswordDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-8">
      <Input label="Password" placeholder="••••••••" type="password" hint="At least 8 characters." />
      <Input label="Password error" defaultValue="short" type="password" error="Password must be at least 8 characters." />
    </div>
  ),
};

// ─── Password — light ─────────────────────────────────────────────────────────

export const PasswordLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-8">
      <Input label="Password" placeholder="••••••••" type="password" hint="At least 8 characters." />
      <Input label="Password error" defaultValue="short" type="password" error="Password must be at least 8 characters." />
    </div>
  ),
};

// ─── Auth fields — dark ───────────────────────────────────────────────────────

export const AuthFieldsDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-6">
      <Input label="Identity / Email" placeholder="you@soarup.app" type="email" />
      <Input label="Cipher / Password" placeholder="••••••••" type="password" />
    </div>
  ),
};

// ─── Auth fields — light ──────────────────────────────────────────────────────

export const AuthFieldsLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-6">
      <Input label="Identity / Email" placeholder="you@soarup.app" type="email" />
      <Input label="Cipher / Password" placeholder="••••••••" type="password" />
    </div>
  ),
};
