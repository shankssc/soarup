// apps/web/src/app/onboarding/onboarding.stories.tsx

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import OnboardingPage from '@/app/(auth)/onboarding/page';
import AuthLayout from '@/app/(auth)/layout';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USER_NEEDS_ONBOARDING: UserProfile = {
  id: 'user-123',
  email: 'jane@example.com',
  full_name: null,
  avatar_url: null,
  email_verified: true,
  is_onboarded: false,
  timezone: 'UTC',
  username: null,
  bio: null,
  tagline: null,
  created_at: new Date().toISOString(),
  profile_public: false
};

const MOCK_USER_ALREADY_ONBOARDED: UserProfile = {
  ...MOCK_USER_NEEDS_ONBOARDING,
  is_onboarded: true,
};

const MOCK_TOKENS: AuthTokens = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600 * 1000,
};

// ─── Page shell ───────────────────────────────────────────────────────────────
// In production, Next.js applies AuthLayout automatically via the (auth) route
// group. In Storybook, routing is mocked so we apply it manually here —
// same pattern as Login.stories.tsx.

function PageShell(Story: React.ComponentType) {
  return (
    <AuthLayout>
      <Story />
    </AuthLayout>
  );
}

// ─── Store seeders ────────────────────────────────────────────────────────────

function withNeedsOnboarding(Story: React.ComponentType) {
  function StoreSeeder() {
    useEffect(() => {
      useAuthStore.setState({
        user: MOCK_USER_NEEDS_ONBOARDING,
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
}

function withAlreadyOnboarded(Story: React.ComponentType) {
  function StoreSeeder() {
    useEffect(() => {
      useAuthStore.setState({
        user: MOCK_USER_ALREADY_ONBOARDED,
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
}

function withUnauthenticated(Story: React.ComponentType) {
  function StoreSeeder() {
    useEffect(() => {
      useAuthStore.setState({
        user: null,
        tokens: null,
        isLoading: false,
        error: null,
      });
    }, []);
    return <Story />;
  }
  return <StoreSeeder />;
}

function withLoading(Story: React.ComponentType) {
  function StoreSeeder() {
    useEffect(() => {
      useAuthStore.setState({
        user: null,
        tokens: null,
        isLoading: true,
        error: null,
      });
      return () => {
        useAuthStore.setState({ isLoading: false });
      };
    }, []);
    return <Story />;
  }
  return <StoreSeeder />;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Onboarding',
  component: OnboardingPage,
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
} satisfies Meta<typeof OnboardingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Happy path ───────────────────────────────────────────────────────────────

export const Dark: Story = {
  name: 'Needs Onboarding (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withNeedsOnboarding],
};

export const Light: Story = {
  name: 'Needs Onboarding (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withNeedsOnboarding],
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileDark: Story = {
  name: 'Mobile (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell, withNeedsOnboarding],
};

export const MobileLight: Story = {
  name: 'Mobile (Light)',
  parameters: {
    theme: 'light',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell, withNeedsOnboarding],
};

// ─── Guard states — canvas intentionally blank ────────────────────────────────
// Guard stories don't use PageShell because OnboardingPage returns null before
// AuthLayout would ever render meaningful content. The blank canvas is correct.

export const GuardUnauthenticated: Story = {
  name: 'Guard — Unauthenticated (redirects to /login)',
  parameters: {
    theme: 'dark',
    docs: {
      description: {
        story:
          'Not authenticated. Page renders null and router.replace("/login") fires. ' +
          'Canvas stays blank — correct behaviour.',
      },
    },
  },
  decorators: [withUnauthenticated],
};

export const GuardAlreadyOnboarded: Story = {
  name: 'Guard — Already Onboarded (redirects to /dashboard)',
  parameters: {
    theme: 'dark',
    docs: {
      description: {
        story:
          'User has is_onboarded: true. Page renders null and router.replace("/dashboard") fires. ' +
          'Canvas stays blank — correct behaviour.',
      },
    },
  },
  decorators: [withAlreadyOnboarded],
};

export const GuardLoading: Story = {
  name: 'Guard — Auth Loading (renders null)',
  parameters: {
    theme: 'dark',
    docs: {
      description: {
        story:
          'Auth store still resolving. Page renders null to prevent flash before redirect.',
      },
    },
  },
  decorators: [withLoading],
};
