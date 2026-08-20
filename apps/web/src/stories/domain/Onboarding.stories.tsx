// apps/web/src/components/domain/auth/Onboarding.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { OnboardingForm } from '@/components/domain/auth/onboarding-form';
import AuthLayout from '@/app/(auth)/layout';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile } from '@/hooks/useAuth';
import { MOCK_USER, MOCK_TOKENS } from '../../../tests/mocks/user';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER_OAUTH: UserProfile = {
  ...MOCK_USER,
  full_name: 'Jane Doe',
};

// ─── Store seeder ─────────────────────────────────────────────────────────────

function withAuthStore(user: UserProfile) {
  return function Decorator(Story: React.ComponentType) {
    function StoreSeeder() {
      useEffect(() => {
        useAuthStore.setState({
          user,
          tokens: MOCK_TOKENS,
          isLoading: false,
          error: null,
        });
        return () => {
          useAuthStore.setState({
            user: null,
            tokens: null,
            isLoading: false,
            error: null,
          });
        };
      }, []);

      return <Story />;
    }

    return <StoreSeeder />;
  };
}

// ─── Page shell ───────────────────────────────────────────────────────────────
// Wraps the form in AuthLayout so stories match the real page exactly —
// same background, dot grid, header, wordmark, ThemeToggle, and footer.
// Mirrors the PageShell pattern from Login.stories.tsx.

function PageShell(Story: React.ComponentType) {
  return (
    <AuthLayout>
      <Story />
    </AuthLayout>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Domain/Auth/OnboardingForm',
  component: OnboardingForm,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/onboarding',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof OnboardingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Step 1 ───────────────────────────────────────────────────────────────────

export const Step1Dark: Story = {
  name: 'Step 1 — Profile (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withAuthStore(MOCK_USER)],
};

export const Step1Light: Story = {
  name: 'Step 1 — Profile (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withAuthStore(MOCK_USER)],
};

export const Step1OAuthPrefillDark: Story = {
  name: 'Step 1 — OAuth Pre-fill (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withAuthStore(MOCK_USER_OAUTH)],
};

export const Step1OAuthPrefillLight: Story = {
  name: 'Step 1 — OAuth Pre-fill (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withAuthStore(MOCK_USER_OAUTH)],
};

// ─── Step 2 ───────────────────────────────────────────────────────────────────

function OnboardingFormAtStep2() {
  return (
    <div>
      <p
        style={{
          position: 'fixed',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999,
          background: '#53ddfc',
          color: '#0e0e10',
          padding: '4px 12px',
          fontSize: 11,
          fontFamily: 'Space Grotesk',
          fontWeight: 600,
          letterSpacing: '0.06em',
        }}
      >
        Fill in Display Name and click CONTINUE to reach Step 2
      </p>
      <OnboardingForm />
    </div>
  );
}

export const Step2Dark: Story = {
  name: 'Step 2 — Workspace (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withAuthStore(MOCK_USER)],
  render: () => <OnboardingFormAtStep2 />,
};

export const Step2Light: Story = {
  name: 'Step 2 — Workspace (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withAuthStore(MOCK_USER)],
  render: () => <OnboardingFormAtStep2 />,
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const Step1MobileDark: Story = {
  name: 'Step 1 — Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell, withAuthStore(MOCK_USER)],
};

export const Step1MobileLight: Story = {
  name: 'Step 1 — Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell, withAuthStore(MOCK_USER)],
};
