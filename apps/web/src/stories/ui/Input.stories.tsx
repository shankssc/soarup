import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Input } from "@/components/ui/input";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "UI/Input",
  component: Input,
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

// ─── Playground ───────────────────────────────────────────────────────────────

export const Playground: Story = {
  args: {
    label:       "Email",
    placeholder: "you@soarup.app",
    type:        "email",
  },
  decorators: [
    (Story) => (
      <div className="w-80 p-8">
        <Story />
      </div>
    ),
  ],
};

// ─── All States ───────────────────────────────────────────────────────────────

export const AllStates: Story = {
  render: () => (
    <div className="w-80 space-y-10 p-8">
      <Input
        label="Default"
        placeholder="curator@soarup.app"
        type="email"
      />
      <Input
        label="With value"
        defaultValue="suyash@soarup.app"
        type="email"
      />
      <Input
        label="With hint"
        placeholder="curator@soarup.app"
        hint="We'll never share your email with anyone."
        type="email"
      />
      <Input
        label="With error"
        defaultValue="not-an-email"
        error="Please enter a valid email address."
        type="email"
      />
      <Input
        label="Disabled"
        defaultValue="suyash@soarup.app"
        disabled
        type="email"
      />
    </div>
  ),
};

// ─── Password Field ───────────────────────────────────────────────────────────
// Shows the built-in visibility toggle.

export const PasswordField: Story = {
  render: () => (
    <div className="w-80 space-y-8 p-8">
      <Input
        label="Password"
        placeholder="••••••••"
        type="password"
        hint="At least 8 characters."
      />
      <Input
        label="Password (error)"
        defaultValue="short"
        type="password"
        error="Password must be at least 8 characters."
      />
    </div>
  ),
};

// ─── Auth Form Fields ─────────────────────────────────────────────────────────
// Exactly as they appear on the login/signup pages.

export const AuthFormFields: Story = {
  render: () => (
    <div className="w-80 space-y-6 p-8">
      <p className="font-label text-[10px] uppercase tracking-widest text-outline">
        Login form fields
      </p>
      <Input
        label="Identity / Email"
        placeholder="curator@soarup.app"
        type="email"
      />
      <Input
        label="Cipher / Password"
        placeholder="••••••••"
        type="password"
      />
    </div>
  ),
};

// ─── With Icons ───────────────────────────────────────────────────────────────

export const WithIcons: Story = {
  render: () => (
    <div className="w-80 space-y-8 p-8">
      <Input
        label="Search"
        placeholder="Search updates..."
        leadingIcon={
          <span className="material-symbols-outlined text-[18px]">search</span>
        }
      />
      <Input
        label="Workspace slug"
        placeholder="my-team"
        trailingIcon={
          <span className="material-symbols-outlined text-[18px]">link</span>
        }
        hint="Used in invite links: soarup.app/join/my-team"
      />
    </div>
  ),
};

// ─── Light Background ─────────────────────────────────────────────────────────

export const OnLightBackground: Story = {
  parameters: {
    backgrounds: { default: "light" },
  },
  render: () => (
    <div className="w-80 space-y-8 p-8">
      <Input
        label="Email"
        placeholder="curator@soarup.app"
        type="email"
      />
      <Input
        label="Password"
        placeholder="••••••••"
        type="password"
      />
      <Input
        label="Email (error)"
        defaultValue="bad-email"
        error="Please enter a valid email address."
        type="email"
      />
    </div>
  ),
};
