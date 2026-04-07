import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OAuthButtons } from "@/components/domain/auth/oauth-buttons";

const meta = {
  title: "Domain/Auth/OAuthButtons",
  component: OAuthButtons,
  parameters: {
    layout: "centered",
    nextjs: { appDirectory: true },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof OAuthButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {
  decorators: [
    (Story) => {
      document.documentElement.classList.add("dark");
      return <div className="bg-surface p-8 w-80"><Story /></div>;
    },
  ],
};

export const Light: Story = {
  decorators: [
    (Story) => {
      document.documentElement.classList.remove("dark");
      return <div className="bg-[#ebfdfc] p-8 w-80"><Story /></div>;
    },
  ],
};

export const Disabled: Story = {
  args: { disabled: true },
  decorators: [
    (Story) => {
      document.documentElement.classList.add("dark");
      return <div className="bg-surface p-8 w-80"><Story /></div>;
    },
  ],
};
