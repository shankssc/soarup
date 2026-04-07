import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LoginForm } from "@/components/domain/auth/login-form";

// next/navigation is automatically mocked by @storybook/nextjs-vite
// useAuth reads from Zustand store — initial state has no error, not loading

const meta = {
  title: "Domain/Auth/LoginForm",
  component: LoginForm,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark",  value: "#0e0e10" },
        { name: "light", value: "#ebfdfc" },
      ],
    },
    // Prevent actual navigation in stories
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/login",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[420px] p-10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Default (empty form) ─────────────────────────────────────────────────────

export const Default: Story = {};

// ─── Light background ─────────────────────────────────────────────────────────

export const OnLightBackground: Story = {
  parameters: {
    backgrounds: { default: "light" },
  },
};
