import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ForgotPasswordForm } from '@/components/domain/auth/forgot-password-form';
import AuthLayout from '@/app/(auth)/layout';

const meta = {
  title: 'Pages/Auth/ForgotPassword',
  component: ForgotPasswordForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/forgot-password' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ForgotPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

function PageShell(Story: React.ComponentType) {
  return React.createElement(
    AuthLayout,
    null,
    React.createElement(
      'div',
      { className: 'space-y-8' },
      React.createElement(
        'div',
        { className: 'space-y-1 mb-2' },
        React.createElement(
          'h1',
          {
            className:
              'font-headline italic text-3xl md:text-4xl text-on-surface leading-tight',
          },
          'Forgot password?',
        ),
        React.createElement(
          'p',
          {
            className: 'font-label text-[10px] uppercase tracking-[0.2em] text-outline',
          },
          "We'll send a reset link to your inbox",
        ),
      ),
      React.createElement(Story),
    ),
  );
}

export const Dark: Story = {
  parameters: { theme: 'dark' },
  decorators: [PageShell],
};

export const Light: Story = {
  parameters: { theme: 'light' },
  decorators: [PageShell],
};

export const MobileDark: Story = {
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
};

export const MobileLight: Story = {
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell],
};
