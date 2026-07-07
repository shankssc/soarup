// apps/web/src/hooks/useProfileSettings.ts

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiClient, ApiRequestError } from '@/lib/api/client';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export function useUpdateProfile() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: (data: {
      full_name?: string;
      timezone?: string;
      username?: string;
      bio?: string;
      tagline?: string;
      profile_public?: boolean;
    }) =>
      apiClient.patch<{
        full_name: string;
        timezone: string;
        username: string | null;
        bio: string | null;
        tagline: string | null;
        profile_public: boolean;
      }>('/auth/profile', data, tokens?.access_token),
    onSuccess: (updated) => {
      if (user) setUser({ ...user, ...updated });
    },
  });
}

export function useUploadAvatar() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/auth/profile/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens?.access_token}` },
        body: formData,
      });
      if (!res.ok) {
        throw new ApiRequestError('upload_failed', 'Upload failed', res.status);
      }
      return res.json() as Promise<{ avatar_url: string }>;
    },
    onSuccess: (updated) => {
      if (user) setUser({ ...user, avatar_url: updated.avatar_url });
    },
  });
}

export function useDeleteAvatar() {
  const { tokens, setUser, user } = useAuth();
  return useMutation({
    mutationFn: () => apiClient.delete('/auth/profile/avatar', tokens?.access_token),
    onSuccess: () => {
      if (user) setUser({ ...user, avatar_url: null });
    },
  });
}
