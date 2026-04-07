import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger", "link", "oauth"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg", "icon", "icon-sm", "icon-lg"],
    },
    loading:    { control: "boolean" },
    disabled:   { control: "boolean" },
    asymmetric: { control: "boolean" },
    asChild:    { table: { disable: true } },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Decorators ───────────────────────────────────────────────────────────────

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add("dark");
  return (
    <div className="bg-surface p-8 min-w-[400px]">
      <Story />
    </div>
  );
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove("dark");
  return (
    <div className="bg-[#ebfdfc] p-8 min-w-[400px]">
      <Story />
    </div>
  );
};

// ─── Playground ───────────────────────────────────────────────────────────────

export const Playground: Story = {
  args: {
    variant: "primary",
    size: "md",
    children: "Primary Action",
    loading: false,
    disabled: false,
    asymmetric: false,
  },
  decorators: [dark],
};

// ─── All variants — dark ──────────────────────────────────────────────────────

export const AllVariantsDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="flex flex-col gap-5">
      <Row label="primary">
        <Button variant="primary">Submit Update</Button>
      </Row>
      <Row label="secondary">
        <Button variant="secondary">Cancel</Button>
      </Row>
      <Row label="ghost">
        <Button variant="ghost">Learn more</Button>
      </Row>
      <Row label="danger">
        <Button variant="danger">Delete workspace</Button>
      </Row>
      <Row label="link">
        <Button variant="link">Forgot password?</Button>
      </Row>
      <Row label="oauth">
        <Button variant="oauth" size="lg" className="w-56">
          Continue with Google
        </Button>
      </Row>
    </div>
  ),
};

// ─── All variants — light ─────────────────────────────────────────────────────

export const AllVariantsLight: Story = {
  decorators: [light],
  render: () => (
    <div className="flex flex-col gap-5">
      <Row label="primary">
        <Button variant="primary">Submit Update</Button>
      </Row>
      <Row label="secondary">
        <Button variant="secondary">Cancel</Button>
      </Row>
      <Row label="ghost">
        <Button variant="ghost">Learn more</Button>
      </Row>
      <Row label="danger">
        <Button variant="danger">Delete workspace</Button>
      </Row>
      <Row label="link">
        <Button variant="link">Forgot password?</Button>
      </Row>
      <Row label="oauth">
        <Button variant="oauth" size="lg" className="w-56">
          Continue with Google
        </Button>
      </Row>
    </div>
  ),
};

// ─── Asymmetric CTA — dark ────────────────────────────────────────────────────

export const AsymmetricDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Button variant="primary" size="lg" asymmetric className="w-full">
        Sign in to workspace
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Button>
      <Button variant="secondary" size="lg" asymmetric className="w-full">
        Create account
      </Button>
    </div>
  ),
};

// ─── Asymmetric CTA — light ───────────────────────────────────────────────────

export const AsymmetricLight: Story = {
  decorators: [light],
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Button variant="primary" size="lg" asymmetric className="w-full">
        Sign in to workspace
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </Button>
      <Button variant="secondary" size="lg" asymmetric className="w-full">
        Create account
      </Button>
    </div>
  ),
};

// ─── Loading & disabled — dark ────────────────────────────────────────────────

export const StatesDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="flex flex-col gap-5">
      <Row label="loading">
        <Button variant="primary" loading>Signing in</Button>
      </Row>
      <Row label="disabled">
        <Button variant="primary" disabled>Submit</Button>
      </Row>
      <Row label="loading secondary">
        <Button variant="secondary" loading>Saving</Button>
      </Row>
      <Row label="loading danger">
        <Button variant="danger" loading>Deleting</Button>
      </Row>
    </div>
  ),
};

// ─── Loading & disabled — light ───────────────────────────────────────────────

export const StatesLight: Story = {
  decorators: [light],
  render: () => (
    <div className="flex flex-col gap-5">
      <Row label="loading">
        <Button variant="primary" loading>Signing in</Button>
      </Row>
      <Row label="disabled">
        <Button variant="primary" disabled>Submit</Button>
      </Row>
      <Row label="loading secondary">
        <Button variant="secondary" loading>Saving</Button>
      </Row>
      <Row label="loading danger">
        <Button variant="danger" loading>Deleting</Button>
      </Row>
    </div>
  ),
};

// ─── Icon sizes — dark ────────────────────────────────────────────────────────

export const IconsDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="flex items-end gap-4">
      <Button size="icon-sm" variant="ghost" aria-label="Small icon">
        <span className="material-symbols-outlined text-[16px]">mic</span>
      </Button>
      <Button size="icon" variant="ghost" aria-label="Default icon">
        <span className="material-symbols-outlined text-[18px]">mic</span>
      </Button>
      <Button size="icon-lg" variant="primary" aria-label="Large icon">
        <span className="material-symbols-outlined text-[22px]">mic</span>
      </Button>
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
    <div className="flex items-center gap-6">
      <span className="font-label text-[10px] uppercase tracking-widest text-outline w-32 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}
