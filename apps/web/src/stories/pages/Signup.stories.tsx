import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { SignupForm } from '@/components/domain/auth/signup-form';
import AuthLayout from '@/app/(auth)/layout';

const meta = {
  title: 'Pages/Auth/Signup',
  component: SignupForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SignupForm>;

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
          'Create your account',
        ),
        React.createElement(
          'p',
          {
            className: 'font-label text-[10px] uppercase tracking-[0.2em] text-outline',
          },
          'Join SoarUp in under 60 seconds',
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
