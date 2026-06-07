import type { AuthTokens, UserProfile } from '@/hooks/useAuth';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';

export const MOCK_USER: UserProfile = {
  id: 'user-123',
  email: 'jane@example.com',
  full_name: 'Jane Doe',
  avatar_url: null,
  timezone: 'UTC',
  email_verified: true,
  is_onboarded: true,
  created_at: new Date().toISOString(),
};

export const MOCK_TOKENS: AuthTokens = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Date.now() + 3600 * 1000,
};

export const MOCK_WORKSPACE_MEMBER: WorkspaceMember = {
  user_id: 'user-123',
  role: 'member',
  joined_at: new Date().toISOString(),
  full_name: 'Jane Doe',
  avatar_url: null,
};
