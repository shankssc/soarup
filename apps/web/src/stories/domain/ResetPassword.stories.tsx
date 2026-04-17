import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ResetPasswordForm } from '@/components/domain/auth/reset-password-form';

const meta = {
  title: 'Domain/Auth/ResetPasswordForm',
  component: ResetPasswordForm,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/reset-password' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ResetPasswordForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {
  parameters: { theme: 'dark' },
  decorators: [
    (Story) => (
      <div className="w-[420px] bg-surface p-10">
        <Story />
      </div>
    ),
  ],
};

export const Light: Story = {
  parameters: { theme: 'light' },
  decorators: [
    (Story) => (
      <div className="w-[420px] border border-outline-variant bg-surface-lowest p-10">
        <Story />
      </div>
    ),
  ],
};

// Shows the invalid token state — what users see if they
// visit the page without a valid token in the URL
export const InvalidToken: Story = {
  parameters: {
    theme: 'dark',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/reset-password',
        // No access_token in search params — triggers invalid token state
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[420px] bg-surface p-10">
        <Story />
      </div>
    ),
  ],
};
