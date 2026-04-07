import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OAuthButtons } from "@/components/domain/auth/oauth-buttons";

const meta = {
  title: "Domain/Auth/OAuthButtons",
  component: OAuthButtons,
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
} satisfies Meta<typeof OAuthButtons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="w-80 p-8">
        <Story />
      </div>
    ),
  ],
};

export const Disabled: Story = {
  args: { disabled: true },
  decorators: [
    (Story) => (
      <div className="w-80 p-8">
        <Story />
      </div>
    ),
  ],
};

export const OnLightBackground: Story = {
  parameters: { backgrounds: { default: "light" } },
  decorators: [
    (Story) => (
      <div className="w-80 p-8">
        <Story />
      </div>
    ),
  ],
};
