import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import React from "react";
import { LoginForm } from "@/components/domain/auth/login-form";
import AuthLayout from "@/app/(auth)/layout";

const meta = {
  title: "Pages/Auth/Login",
  component: LoginForm,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/login" },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wraps the form in the real auth layout shell so the story
// matches the actual page exactly — without importing the async page.tsx
function PageShell(Story: React.ComponentType) {
  return React.createElement(
    AuthLayout,
    null,
    React.createElement(
      "div",
      { className: "space-y-8" },
      React.createElement(
        "div",
        { className: "space-y-1 mb-2" },
        React.createElement(
          "h1",
          { className: "font-headline italic text-4xl md:text-5xl text-on-surface leading-tight" },
          "Welcome back"
        ),
        React.createElement(
          "p",
          { className: "font-label text-[10px] uppercase tracking-[0.2em] text-outline" },
          "Sign in to your workspace"
        )
      ),
      React.createElement(Story)
    )
  );
}

export const Dark: Story = {
  parameters: { theme: "dark" },
  decorators: [PageShell],
};

export const Light: Story = {
  parameters: { theme: "light" },
  decorators: [PageShell],
};

export const MobileDark: Story = {
  parameters: {
    theme: "dark",
    viewport: { defaultViewport: "mobile1" },
  },
  decorators: [PageShell],
};

export const MobileLight: Story = {
  parameters: {
    theme: "light",
    viewport: { defaultViewport: "mobile1" },
  },
  decorators: [PageShell],
};
