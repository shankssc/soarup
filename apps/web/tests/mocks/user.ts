//apps/web/test/mocks/user.ts

import type { AuthTokens, UserProfile } from '@/hooks/useAuth';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';
import type { Digest, DigestItem } from '@/hooks/useDigests';
import { WorkspaceResponse } from '@/hooks/useWorkspace';

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

export const MOCK_WORKSPACE: WorkspaceResponse = {
  id: 'workspace-123',
  name: 'Acme Engineering',
  slug: 'acme-engineering',
  owner_id: 'user-123',
  plan: 'free',
  created_at: new Date().toISOString(),
  digest_enabled: false,
  digest_send_time: '09:00',
  digest_timezone: null,
  digest_days: '1,2,3,4,5',
};

export const MOCK_WORKSPACE_MEMBER: WorkspaceMember = {
  user_id: 'user-123',
  role: 'member',
  joined_at: new Date().toISOString(),
  full_name: 'Jane Doe',
  avatar_url: null,
};

export const MOCK_DIGEST_ITEM: DigestItem = {
  id: 'item-123',
  update_id: 'update-123',
  author_name: 'Jane Doe',
  summary_snapshot: 'Worked on the digest pipeline and fixed a Redis issue.',
};

export const MOCK_DIGEST: Digest = {
  id: 'digest-123',
  workspace_id: 'workspace-123',
  digest_date: '2026-06-07',
  summary:
    'Strong day overall. The digest pipeline shipped and a Redis race condition was resolved.',
  status: 'sent',
  update_count: 2,
  email_sent_at: '2026-06-07T09:00:00Z',
  created_at: '2026-06-07T09:00:00Z',
  items: [MOCK_DIGEST_ITEM],
};

export const MOCK_DIGEST_PENDING: Digest = {
  ...MOCK_DIGEST,
  id: 'digest-456',
  summary: null,
  status: 'pending',
  update_count: 0,
  email_sent_at: null,
  items: [],
};

export const MOCK_DIGEST_PROCESSING: Digest = {
  ...MOCK_DIGEST,
  id: 'digest-789',
  summary: null,
  status: 'processing',
  email_sent_at: null,
  items: [],
};
