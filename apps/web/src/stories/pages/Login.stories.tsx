import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ThemeProvider } from "@/components/providers/theme-provider";
import AuthLayout from "@/app/(auth)/layout";
import LoginPage from "@/app/(auth)/login/page";

const meta = {
  title: "Pages/Auth/Login",
  component: LoginPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/login" },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

function withProviders(Story: React.ComponentType, dark: boolean) {
  if (dark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  return (
    <ThemeProvider>
      <AuthLayout>
        <Story />
      </AuthLayout>
    </ThemeProvider>
  );
}

export const Dark: Story = {
  decorators: [(Story) => withProviders(Story, true)],
};

export const Light: Story = {
  decorators: [(Story) => withProviders(Story, false)],
};

export const MobileDark: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  decorators: [(Story) => withProviders(Story, true)],
};

export const MobileLight: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  decorators: [(Story) => withProviders(Story, false)],
};
