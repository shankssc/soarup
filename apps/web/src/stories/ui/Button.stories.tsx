import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "UI/Button",
  component: Button,
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
};

// ─── All Variants ─────────────────────────────────────────────────────────────

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
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
        <Button variant="oauth" size="lg" className="w-64">
          <GoogleIcon />
          Continue with Google
        </Button>
      </Row>
    </div>
  ),
};

// ─── All Sizes ────────────────────────────────────────────────────────────────

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4 p-8">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Microphone">
        <MicIcon />
      </Button>
      <Button size="icon-sm" aria-label="Send">
        <SendIcon />
      </Button>
      <Button size="icon-lg" aria-label="Record">
        <MicIcon />
      </Button>
    </div>
  ),
};

// ─── Loading State ────────────────────────────────────────────────────────────

export const LoadingState: Story = {
  render: () => (
    <div className="flex gap-4 p-8">
      <Button variant="primary" loading>Sign in</Button>
      <Button variant="secondary" loading>Saving</Button>
      <Button variant="danger" loading>Deleting</Button>
    </div>
  ),
};

// ─── Disabled State ───────────────────────────────────────────────────────────

export const DisabledState: Story = {
  render: () => (
    <div className="flex gap-4 p-8">
      <Button variant="primary" disabled>Submit</Button>
      <Button variant="secondary" disabled>Cancel</Button>
      <Button variant="ghost" disabled>Learn more</Button>
    </div>
  ),
};

// ─── Asymmetric (Auth CTA) ────────────────────────────────────────────────────

export const AsymmetricCTA: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8 items-center">
      <p className="font-label text-[10px] uppercase tracking-widest text-outline">
        Auth page primary CTA — asymmetric border-radius
      </p>
      <Button variant="primary" size="lg" asymmetric className="w-80">
        Sign in to workspace
        <ArrowIcon />
      </Button>
      <Button variant="secondary" size="lg" asymmetric className="w-80">
        Create account
      </Button>
    </div>
  ),
};

// ─── OAuth Buttons ────────────────────────────────────────────────────────────

export const OAuthButtons: Story = {
  render: () => (
    <div className="flex flex-col gap-3 p-8 w-80">
      <Button variant="oauth" size="lg">
        <GoogleIcon />
        Continue with Google
      </Button>
      <Button variant="oauth" size="lg">
        <GitHubIcon />
        Continue with GitHub
      </Button>
    </div>
  ),
};

// ─── With Icons ───────────────────────────────────────────────────────────────

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-8">
      <Button variant="primary" size="md">
        <MicIcon />
        Record update
      </Button>
      <Button variant="secondary" size="md">
        Invite member
        <ArrowIcon />
      </Button>
      <Button variant="ghost" size="md">
        <span className="material-symbols-outlined text-[18px]">settings</span>
        Settings
      </Button>
    </div>
  ),
};

// ─── Light Background ─────────────────────────────────────────────────────────

export const OnLightBackground: Story = {
  parameters: {
    backgrounds: { default: "light" },
  },
  render: () => (
    <div className="flex gap-4 p-8">
      <Button variant="primary">Sign in</Button>
      <Button variant="secondary">Cancel</Button>
      <Button variant="ghost">Learn more</Button>
      <Button variant="link">Forgot password?</Button>
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
      <span className="font-label text-[10px] uppercase tracking-widest text-outline w-20 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

function MicIcon() {
  return (
    <span
      className="material-symbols-outlined text-[18px]"
      style={{ fontVariationSettings: "'FILL' 1" }}
    >
      mic
    </span>
  );
}

function SendIcon() {
  return (
    <span className="material-symbols-outlined text-[18px]">send</span>
  );
}

function ArrowIcon() {
  return (
    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}
