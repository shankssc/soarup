// apps/web/tests/unit/audio-player.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AudioPlayer } from '@/components/ui/audio-player';
import { useAuthStore } from '@/hooks/useAuth';
import { useAudioPlaybackUrl } from '@/hooks/useAudio';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useAudio', () => ({
  useAudioPlaybackUrl: vi.fn(),
  audioKeys: {
    playback: (workspaceId: string, updateId: string) => [
      'audio',
      'playback',
      workspaceId,
      updateId,
    ],
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'workspace-123';
const MOCK_UPDATE_ID = 'update-voice-abc';
const MOCK_PLAYBACK_URL =
  'http://localhost:9000/soarup-local/audio/workspace-123/user-123/abc123.webm?X-Amz-Signature=fake2';

// ─── Render helper ────────────────────────────────────────────────────────────

function renderAudioPlayer(
  props: Partial<{
    workspaceId: string;
    updateId: string;
    durationSeconds: number | null;
    className: string;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const defaultProps = {
    workspaceId: MOCK_WORKSPACE_ID,
    updateId: MOCK_UPDATE_ID,
    durationSeconds: 107,
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <AudioPlayer {...defaultProps} {...props} />
    </QueryClientProvider>,
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.setState({
    user: MOCK_USER,
    tokens: MOCK_TOKENS,
    isLoading: false,
    error: null,
  });

  // Default: inactive state — hook returns no data, not loading, no error
  vi.mocked(useAudioPlaybackUrl).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useAudioPlaybackUrl>);
});

afterEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
});

// ─── Duration formatting ──────────────────────────────────────────────────────

describe('AudioPlayer — duration formatting', () => {
  it('shows formatted duration in inactive state', () => {
    renderAudioPlayer({ durationSeconds: 107 });
    expect(screen.getByText('1:47')).toBeInTheDocument();
  });

  it('shows play button alongside duration', () => {
    renderAudioPlayer({ durationSeconds: 107 });
    expect(screen.getByLabelText('Play audio update')).toBeInTheDocument();
  });

  it('formats 0 seconds as 0:00', () => {
    renderAudioPlayer({ durationSeconds: 0 });
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('formats 65 seconds as 1:05', () => {
    renderAudioPlayer({ durationSeconds: 65 });
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('formats 107 seconds as 1:47', () => {
    renderAudioPlayer({ durationSeconds: 107 });
    expect(screen.getByText('1:47')).toBeInTheDocument();
  });

  it('does not show duration text when durationSeconds is null', () => {
    renderAudioPlayer({ durationSeconds: null });
    expect(screen.queryByText(/\d:\d\d/)).not.toBeInTheDocument();
  });

  it('does not show duration text when durationSeconds is undefined', () => {
    renderAudioPlayer({ durationSeconds: undefined as unknown as null });
    expect(screen.queryByText(/\d:\d\d/)).not.toBeInTheDocument();
  });
});

// ─── Play button behaviour ────────────────────────────────────────────────────

describe('AudioPlayer — play button', () => {
  it('renders play button in inactive state', () => {
    renderAudioPlayer();
    expect(screen.getByLabelText('Play audio update')).toBeInTheDocument();
  });

  it('clicking play passes enabled=true to useAudioPlaybackUrl', () => {
    renderAudioPlayer();
    fireEvent.click(screen.getByLabelText('Play audio update'));
    expect(useAudioPlaybackUrl).toHaveBeenLastCalledWith(
      MOCK_WORKSPACE_ID,
      MOCK_UPDATE_ID,
      true,
    );
  });

  it('initially passes enabled=false to useAudioPlaybackUrl', () => {
    renderAudioPlayer();
    expect(useAudioPlaybackUrl).toHaveBeenLastCalledWith(
      MOCK_WORKSPACE_ID,
      MOCK_UPDATE_ID,
      false,
    );
  });

  it('play button is disabled while loading', () => {
    vi.mocked(useAudioPlaybackUrl).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useAudioPlaybackUrl>);

    renderAudioPlayer();
    expect(screen.getByLabelText('Play audio update')).toBeDisabled();
  });

  it('play button hidden when audio element is active', async () => {
    vi.mocked(useAudioPlaybackUrl).mockReturnValue({
      data: { playback_url: MOCK_PLAYBACK_URL, expires_in: 900, duration_seconds: 107 },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAudioPlaybackUrl>);

    renderAudioPlayer();
    fireEvent.click(screen.getByLabelText('Play audio update'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Play audio update')).not.toBeInTheDocument();
    });
  });
});

// ─── Audio element ────────────────────────────────────────────────────────────

describe('AudioPlayer — audio element', () => {
  it('renders audio element with src when playback URL is available', async () => {
    vi.mocked(useAudioPlaybackUrl).mockReturnValue({
      data: { playback_url: MOCK_PLAYBACK_URL, expires_in: 900, duration_seconds: 107 },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAudioPlaybackUrl>);

    renderAudioPlayer();
    fireEvent.click(screen.getByLabelText('Play audio update'));

    await waitFor(() => {
      const audio = document.querySelector('audio');
      expect(audio).toBeTruthy();
      expect(audio?.src).toBe(MOCK_PLAYBACK_URL);
    });
  });

  it('does not render audio element before activation', () => {
    renderAudioPlayer();
    expect(document.querySelector('audio')).toBeNull();
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('AudioPlayer — error state', () => {
  it('shows error message when URL fetch fails', () => {
    vi.mocked(useAudioPlaybackUrl).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useAudioPlaybackUrl>);

    renderAudioPlayer();
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('still shows play button in error state', () => {
    vi.mocked(useAudioPlaybackUrl).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useAudioPlaybackUrl>);

    renderAudioPlayer();
    expect(screen.getByLabelText('Play audio update')).toBeInTheDocument();
  });
});
