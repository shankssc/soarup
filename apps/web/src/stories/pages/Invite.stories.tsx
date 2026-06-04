// apps/web/src/stories/pages/Invite.stories.tsx
// Invite acceptance page states: loading, valid (unauthed), valid (authed),
// expired/used, accepted/redirecting, error.
//
// Strategy:
//   - useInviteDetails is driven by React Query cache seeding
//   - useAuth state injected via useAuthStore.setState in withAuthStore
//   - useAcceptInvite is a mutation — seeded as idle; interactive states
//     shown via args (not actually firing the mutation)
//   - useParams mocked via nextjs.navigation.params

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/hooks/useAuth';
import type { UserProfile, AuthTokens } from '@/hooks/useAuth';
import type { InviteDetails } from '@/hooks/useInviteMembers';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_CODE = 'testinvitecode123';

const MOCK_USER: UserProfile = {
  id: 'user-123',
  email: 'jane@example.com',
  full_name: 'Jane Doe',
  avatar_url: null,
  email_verified: true,
  is_onboarded: true,
  created_at: new Date().toISOString(),
};

const MOCK_TOKENS: AuthTokens = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600 * 1000,
};

const VALID_INVITE: InviteDetails = {
  workspace_name: 'Acme Corp',
  workspace_slug: 'acme-corp',
  invited_by_name: 'Alice Owner',
  email: 'jane@example.com',
  expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  is_valid: true,
};

const EXPIRED_INVITE: InviteDetails = {
  ...VALID_INVITE,
  is_valid: false,
  expires_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
};

// ─── Query key — must match useInviteDetails exactly ─────────────────────────
// inviteKeys.details(code) = ['invites', 'details', code]

function inviteQueryKey(code: string) {
  return ['invites', 'details', code];
}

// ─── Decorators ───────────────────────────────────────────────────────────────

function withAuthStore(authenticated: boolean) {
  return function Decorator(Story: React.ComponentType) {
    function StoreSeeder() {
      useEffect(() => {
        if (authenticated) {
          useAuthStore.setState({
            user: MOCK_USER,
            tokens: MOCK_TOKENS,
            isLoading: false,
            error: null,
          });
        } else {
          useAuthStore.setState({
            user: null,
            tokens: null,
            isLoading: false,
            error: null,
          });
        }
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

function withQueryCache(invite: InviteDetails | null, loading: boolean) {
  return function Decorator(Story: React.ComponentType) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });

    if (!loading && invite !== null) {
      queryClient.setQueryData(inviteQueryKey(MOCK_CODE), invite);
    }

    return (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    );
  };
}

// ─── Page shell ───────────────────────────────────────────────────────────────

function PageShell(Story: React.ComponentType) {
  return (
    <div className="min-h-screen bg-background">
      <Story />
    </div>
  );
}

// ─── Import the actual page ───────────────────────────────────────────────────
// We import the page component directly — Storybook mocks useParams via
// nextjs.navigation.params, so [code] resolves to MOCK_CODE.

import InvitePage from '@/app/(public)/invite/[code]/page';

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Pages/Invite/InvitePage',
  component: InvitePage,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/invite/${MOCK_CODE}`,
        params: { code: MOCK_CODE },
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof InvitePage>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Loading ──────────────────────────────────────────────────────────────────
// Query is in-flight — spinner shown

export const LoadingDark: Story = {
  name: 'Loading (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withQueryCache(null, true), withAuthStore(false)],
};

export const LoadingLight: Story = {
  name: 'Loading (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withQueryCache(null, true), withAuthStore(false)],
};

// ─── Valid invite — unauthenticated ───────────────────────────────────────────
// CTA reads "Sign in to accept" — clicking redirects to /login

export const ValidUnauthenticatedDark: Story = {
  name: 'Valid Invite — Unauthenticated (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withQueryCache(VALID_INVITE, false), withAuthStore(false)],
};

export const ValidUnauthenticatedLight: Story = {
  name: 'Valid Invite — Unauthenticated (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withQueryCache(VALID_INVITE, false), withAuthStore(false)],
};

// ─── Valid invite — authenticated ─────────────────────────────────────────────
// CTA reads "Accept invite" — clicking fires POST /invites/{code}/accept

export const ValidAuthenticatedDark: Story = {
  name: 'Valid Invite — Authenticated (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withQueryCache(VALID_INVITE, false), withAuthStore(true)],
};

export const ValidAuthenticatedLight: Story = {
  name: 'Valid Invite — Authenticated (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withQueryCache(VALID_INVITE, false), withAuthStore(true)],
};

// ─── Expired / used ───────────────────────────────────────────────────────────
// is_valid: false — shows "Invite expired" state

export const ExpiredDark: Story = {
  name: 'Expired Invite (Dark)',
  parameters: { theme: 'dark' },
  decorators: [PageShell, withQueryCache(EXPIRED_INVITE, false), withAuthStore(false)],
};

export const ExpiredLight: Story = {
  name: 'Expired Invite (Light)',
  parameters: { theme: 'light' },
  decorators: [PageShell, withQueryCache(EXPIRED_INVITE, false), withAuthStore(false)],
};

// ─── Not found ────────────────────────────────────────────────────────────────
// Query errored (404) — shows "Invite not found" state
// Achieved by seeding the query with an error state

export const NotFoundDark: Story = {
  name: 'Not Found (Dark)',
  parameters: { theme: 'dark' },
  decorators: [
    PageShell,
    withAuthStore(false),
    (Story) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(inviteQueryKey(MOCK_CODE), null);
      // Mark the query as errored so isError fires
      queryClient.setQueryDefaults(inviteQueryKey(MOCK_CODE), {
        queryFn: () => Promise.reject(new Error('Not found')),
      });
      return (
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
};

// ─── Mobile ───────────────────────────────────────────────────────────────────

export const MobileValidUnauthDark: Story = {
  name: 'Mobile — Valid Unauthenticated (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell, withQueryCache(VALID_INVITE, false), withAuthStore(false)],
};

export const MobileValidAuthDark: Story = {
  name: 'Mobile — Valid Authenticated (Dark)',
  parameters: {
    theme: 'dark',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [PageShell, withQueryCache(VALID_INVITE, false), withAuthStore(true)],
};
