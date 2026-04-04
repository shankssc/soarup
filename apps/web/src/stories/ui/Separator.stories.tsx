import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Separator, FormMessage } from "@/components/ui/seperator";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "UI/Separator",
  component: Separator,
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
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Separator Variants ───────────────────────────────────────────────────────

export const AllSeparators: Story = {
  render: () => (
    <div className="w-80 space-y-10 p-8">
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-4">
          Plain
        </p>
        <Separator />
      </div>
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-4">
          With label — auth page divider
        </p>
        <Separator label="or continue with" />
      </div>
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-4">
          Short label
        </p>
        <Separator label="or" />
      </div>
    </div>
  ),
};

// ─── In Auth Context ──────────────────────────────────────────────────────────
// Shows the separator between OAuth buttons and email/password form.

export const InAuthContext: Story = {
  render: () => (
    <div className="w-80 space-y-4 p-8">
      {/* OAuth buttons */}
      <button className="w-full h-12 border border-outline-variant font-label text-xs uppercase tracking-widest text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-3">
        Continue with Google
      </button>
      <button className="w-full h-12 border border-outline-variant font-label text-xs uppercase tracking-widest text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-3">
        Continue with GitHub
      </button>

      {/* Separator */}
      <div className="py-2">
        <Separator label="or" />
      </div>

      {/* Email field placeholder */}
      <div className="border-b border-outline-variant py-3">
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-1">
          Email
        </p>
        <p className="font-body text-on-surface-variant/50 text-sm">
          you@soarup.app
        </p>
      </div>
    </div>
  ),
};

// ─── FormMessage ──────────────────────────────────────────────────────────────

export const FormMessages: Story = {
  render: () => (
    <div className="w-96 space-y-4 p-8">
      <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-6">
        FormMessage — API-level feedback
      </p>

      <FormMessage
        variant="error"
        message="Incorrect email or password. Please try again."
      />
      <FormMessage
        variant="error"
        message="An account with this email already exists."
      />
      <FormMessage
        variant="success"
        message="Account created! Check your email to confirm."
      />
      <FormMessage
        variant="info"
        message="Password reset link sent to your inbox."
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
      <Separator label="or" />
      <FormMessage
        variant="error"
        message="Incorrect email or password."
      />
      <FormMessage
        variant="success"
        message="Account created successfully."
      />
    </div>
  ),
};
