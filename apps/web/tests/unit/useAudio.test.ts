// apps/web/tests/unit/useAudio.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useRequestUploadUrl,
  useAudioPlaybackUrl,
  uploadAudioBlob,
} from '@/hooks/useAudio';
import { useAuthStore } from '@/hooks/useAuth';
import { apiClient } from '@/lib/api/client';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'workspace-123';
const MOCK_UPDATE_ID = 'update-voice-abc';
const MOCK_AUDIO_KEY = 'audio/workspace-123/user-123/abc123.webm';
const MOCK_UPLOAD_URL =
  'http://localhost:9000/soarup-local/audio/workspace-123/user-123/abc123.webm?X-Amz-Signature=fake';
const MOCK_PLAYBACK_URL =
  'http://localhost:9000/soarup-local/audio/workspace-123/user-123/abc123.webm?X-Amz-Signature=fake2';

// ─── Wrapper ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'TestQueryWrapper';
  return { wrapper: Wrapper, queryClient };
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.setState({
    user: MOCK_USER,
    tokens: MOCK_TOKENS,
    isLoading: false,
    error: null,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
  vi.restoreAllMocks();
});

// ─── useRequestUploadUrl ──────────────────────────────────────────────────────

describe('useRequestUploadUrl', () => {
  it('calls correct endpoint with content_type and file_size_bytes', async () => {
    const mockResponse = {
      upload_url: MOCK_UPLOAD_URL,
      object_key: MOCK_AUDIO_KEY,
      expires_in: 900,
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRequestUploadUrl(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        content_type: 'audio/webm',
        file_size_bytes: 1024 * 100,
      });
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/audio/upload-url`,
      { content_type: 'audio/webm', file_size_bytes: 1024 * 100 },
      MOCK_TOKENS.access_token,
    );
  });

  it('returns upload_url, object_key, and expires_in on success', async () => {
    const mockResponse = {
      upload_url: MOCK_UPLOAD_URL,
      object_key: MOCK_AUDIO_KEY,
      expires_in: 900,
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRequestUploadUrl(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    let response: typeof mockResponse | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        content_type: 'audio/webm',
        file_size_bytes: 1024,
      });
    });

    expect(response?.upload_url).toBe(MOCK_UPLOAD_URL);
    expect(response?.object_key).toBe(MOCK_AUDIO_KEY);
    expect(response?.expires_in).toBe(900);
  });

  it('passes access token to apiClient', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      upload_url: MOCK_UPLOAD_URL,
      object_key: MOCK_AUDIO_KEY,
      expires_in: 900,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRequestUploadUrl(MOCK_WORKSPACE_ID), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        content_type: 'audio/webm',
        file_size_bytes: 1024,
      });
    });

    const callArgs = vi.mocked(apiClient.post).mock.calls[0];
    expect(callArgs[2]).toBe('mock-access-token');
  });
});

// ─── useAudioPlaybackUrl ──────────────────────────────────────────────────────

describe('useAudioPlaybackUrl', () => {
  it('does not fetch when enabled=false', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAudioPlaybackUrl(MOCK_WORKSPACE_ID, MOCK_UPDATE_ID, false),
      { wrapper },
    );

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('fetches when enabled=true and token is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      playback_url: MOCK_PLAYBACK_URL,
      expires_in: 900,
      duration_seconds: 47,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAudioPlaybackUrl(MOCK_WORKSPACE_ID, MOCK_UPDATE_ID, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiClient.get).toHaveBeenCalledWith(
      `/workspaces/${MOCK_WORKSPACE_ID}/updates/${MOCK_UPDATE_ID}/audio`,
      MOCK_TOKENS.access_token,
    );
    expect(result.current.data?.playback_url).toBe(MOCK_PLAYBACK_URL);
  });

  it('returns duration_seconds from API response', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      playback_url: MOCK_PLAYBACK_URL,
      expires_in: 900,
      duration_seconds: 47,
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAudioPlaybackUrl(MOCK_WORKSPACE_ID, MOCK_UPDATE_ID, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.duration_seconds).toBe(47);
  });

  it('does not fetch when access_token is absent', () => {
    useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });

    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAudioPlaybackUrl(MOCK_WORKSPACE_ID, MOCK_UPDATE_ID, true),
      { wrapper },
    );

    expect(apiClient.get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('staleTime prevents immediate refetch on re-render', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      playback_url: MOCK_PLAYBACK_URL,
      expires_in: 900,
      duration_seconds: 47,
    });

    const { wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      () => useAudioPlaybackUrl(MOCK_WORKSPACE_ID, MOCK_UPDATE_ID, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const callCount = vi.mocked(apiClient.get).mock.calls.length;

    rerender();
    expect(vi.mocked(apiClient.get).mock.calls.length).toBe(callCount);
  });
});

// ─── uploadAudioBlob ──────────────────────────────────────────────────────────

describe('uploadAudioBlob', () => {
  // Shared XHR mock setup
  let mockXHR: {
    open: ReturnType<typeof vi.fn>;
    setRequestHeader: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    upload: { onprogress: ((e: ProgressEvent) => void) | null };
    onload: (() => void) | null;
    onerror: (() => void) | null;
    status: number;
  };

  beforeEach(() => {
    mockXHR = {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      upload: { onprogress: null },
      onload: null,
      onerror: null,
      status: 200,
    };
    vi.stubGlobal(
      'XMLHttpRequest',
      vi.fn(() => mockXHR),
    );
  });

  it('sends PUT request with correct URL and blob', async () => {
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob);

    mockXHR.onload?.();
    await promise;

    expect(mockXHR.open).toHaveBeenCalledWith('PUT', MOCK_UPLOAD_URL);
    expect(mockXHR.send).toHaveBeenCalledWith(blob);
  });

  it('sets Content-Type header to blob.type', async () => {
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob);

    mockXHR.onload?.();
    await promise;

    expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'audio/webm');
  });

  it('calls onProgress with upload percentage', async () => {
    const onProgress = vi.fn();
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob, onProgress);

    mockXHR.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    } as ProgressEvent);

    mockXHR.onload?.();
    await promise;

    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it('does not call onProgress when lengthComputable is false', async () => {
    const onProgress = vi.fn();
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob, onProgress);

    mockXHR.upload.onprogress?.({
      lengthComputable: false,
      loaded: 50,
      total: 100,
    } as ProgressEvent);

    mockXHR.onload?.();
    await promise;

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('resolves on 2xx status', async () => {
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob);

    mockXHR.status = 200;
    mockXHR.onload?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects on non-2xx status', async () => {
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob);

    mockXHR.status = 403;
    mockXHR.onload?.();

    await expect(promise).rejects.toThrow('Upload failed with status 403');
  });

  it('rejects on network error', async () => {
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob);

    mockXHR.onerror?.();

    await expect(promise).rejects.toThrow('Network error during upload');
  });

  it('works without onProgress callback', async () => {
    const blob = new Blob(['audio data'], { type: 'audio/webm' });
    const promise = uploadAudioBlob(MOCK_UPLOAD_URL, blob); // no onProgress

    mockXHR.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });
});
