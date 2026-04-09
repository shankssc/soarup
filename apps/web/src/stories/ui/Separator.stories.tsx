import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Separator, FormMessage } from "@/components/ui/separator";

const meta = {
  title: "UI/Separator",
  component: Separator,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

const dark = (Story: React.ComponentType) => {
  document.documentElement.classList.add("dark");
  return <div className="bg-surface p-8 w-80"><Story /></div>;
};

const light = (Story: React.ComponentType) => {
  document.documentElement.classList.remove("dark");
  return <div className="bg-[#ebfdfc] p-8 w-80"><Story /></div>;
};

// ─── Separator variants ───────────────────────────────────────────────────────

export const SeparatorsDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-3">plain</p>
        <Separator />
      </div>
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-3">with label</p>
        <Separator label="or" />
      </div>
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-3">long label</p>
        <Separator label="or continue with" />
      </div>
    </div>
  ),
};

export const SeparatorsLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-3">plain</p>
        <Separator />
      </div>
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-3">with label</p>
        <Separator label="or" />
      </div>
      <div>
        <p className="font-label text-[10px] uppercase tracking-widest text-outline mb-3">long label</p>
        <Separator label="or continue with" />
      </div>
    </div>
  ),
};

// ─── FormMessage variants ─────────────────────────────────────────────────────

export const FormMessagesDark: Story = {
  decorators: [dark],
  render: () => (
    <div className="space-y-4 w-96">
      <FormMessage variant="error" message="Incorrect email or password. Please try again." />
      <FormMessage variant="error" message="An account with this email already exists." />
      <FormMessage variant="success" message="Account created! Check your email to confirm." />
      <FormMessage variant="info" message="Password reset link sent to your inbox." />
    </div>
  ),
};

export const FormMessagesLight: Story = {
  decorators: [light],
  render: () => (
    <div className="space-y-4 w-96">
      <FormMessage variant="error" message="Incorrect email or password. Please try again." />
      <FormMessage variant="error" message="An account with this email already exists." />
      <FormMessage variant="success" message="Account created! Check your email to confirm." />
      <FormMessage variant="info" message="Password reset link sent to your inbox." />
    </div>
  ),
};
