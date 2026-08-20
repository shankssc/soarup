// apps/web/src/hooks/useAudio.ts

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

interface PresignedUploadResponse {
  upload_url: string;
  object_key: string;
  expires_in: number;
}

interface AudioPlaybackResponse {
  playback_url: string;
  expires_in: number;
  duration_seconds: number | null;
}

export const audioKeys = {
  playback: (workspaceId: string, updateId: string) =>
    ['audio', 'playback', workspaceId, updateId] as const,
};

/**
 * Request a pre-signed PUT URL before uploading audio.
 * Called at the start of VoiceRecorder's submit flow.
 */
export function useRequestUploadUrl(workspaceId: string) {
  const { tokens } = useAuth();
  return useMutation({
    mutationFn: (data: { content_type: string; file_size_bytes: number }) =>
      apiClient.post<PresignedUploadResponse>(
        `/workspaces/${workspaceId}/audio/upload-url`,
        data,
        tokens?.access_token,
      ),
  });
}

/**
 * Upload audio blob directly to Minio/R2 via pre-signed PUT URL.
 * Bypasses the FastAPI server entirely — no auth token needed.
 * Uses XHR instead of fetch to support upload progress events.
 */
export async function uploadAudioBlob(
  uploadUrl: string,
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', blob.type);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

/**
 * Fetch a short-lived pre-signed GET URL for audio playback.
 * Only fetches when enabled=true — triggered by user activating the player.
 * staleTime is set below the 15-minute URL expiry to prevent serving expired URLs.
 */
export function useAudioPlaybackUrl(
  workspaceId: string,
  updateId: string,
  enabled: boolean = false,
) {
  const { tokens } = useAuth();
  return useQuery({
    queryKey: audioKeys.playback(workspaceId, updateId),
    queryFn: () =>
      apiClient.get<AudioPlaybackResponse>(
        `/workspaces/${workspaceId}/updates/${updateId}/audio`,
        tokens?.access_token,
      ),
    enabled: enabled && !!tokens?.access_token,
    staleTime: 10 * 60 * 1000, // 10 minutes — safely under the 15-min URL expiry
    gcTime: 15 * 60 * 1000, // Remove from cache at 15 minutes
  });
}
