// apps/web/tests/unit/voice-recorder.test.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoiceRecorder } from '@/components/domain/updates/voice-recorder';
import { useAuthStore } from '@/hooks/useAuth';
import { MOCK_TOKENS, MOCK_USER } from '../mocks/user';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_WORKSPACE_ID = 'workspace-123';
const MOCK_UPDATE_DATE = '2026-05-21';
const MOCK_AUDIO_KEY = 'audio/workspace-123/user-123/abc123.webm';
const MOCK_UPLOAD_URL =
  'http://localhost:9000/soarup-local/audio/workspace-123/user-123/abc123.webm?X-Amz-Signature=fake';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useAudio', () => ({
  useRequestUploadUrl: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({
      upload_url: MOCK_UPLOAD_URL,
      object_key: MOCK_AUDIO_KEY,
      expires_in: 900,
    }),
    isPending: false,
  })),
  uploadAudioBlob: vi.fn().mockResolvedValue(undefined),
}));

// ─── Fake MediaRecorder ────────────────────────────────────────────────────────

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);

  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';

  start = vi.fn(() => {
    this.state = 'recording';
  });

  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const mockGetUserMedia = vi.fn();

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);

  // Preserve the real URL constructor so jsdom internals still work,
  // but stub out the object URL methods that jsdom doesn't implement.
  const OriginalURL = globalThis.URL;
  vi.stubGlobal(
    'URL',
    Object.assign(
      function URL(...args: ConstructorParameters<typeof OriginalURL>) {
        return new OriginalURL(...args);
      },
      OriginalURL,
      {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
      },
    ),
  );

  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  mockGetUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  });

  useAuthStore.setState({
    user: MOCK_USER,
    tokens: MOCK_TOKENS,
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, tokens: null, isLoading: false, error: null });
});

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderVoiceRecorder(
  props: Partial<{
    workspaceId: string;
    updateDate: string;
    onSuccess: (audioKey: string, durationSeconds: number, blob: Blob) => void;
    onCancel: () => void;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const defaultProps = {
    workspaceId: MOCK_WORKSPACE_ID,
    updateDate: MOCK_UPDATE_DATE,
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <VoiceRecorder {...defaultProps} {...props} />
    </QueryClientProvider>,
  );
}

// Helper: advance to recording state
async function startRecording() {
  fireEvent.click(screen.getByLabelText('Start recording'));
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeInTheDocument(),
  );
}

// Helper: advance to preview state
async function advanceToPreview() {
  await startRecording();
  fireEvent.click(screen.getByLabelText('Stop recording'));
  await waitFor(() => expect(screen.getByText(/submit update/i)).toBeInTheDocument());
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VoiceRecorder — idle state', () => {
  it('renders idle state with record button', () => {
    renderVoiceRecorder();
    expect(screen.getByLabelText('Start recording')).toBeInTheDocument();
    expect(screen.getByText(/tap to record/i)).toBeInTheDocument();
  });

  it('renders cancel button in idle state', () => {
    renderVoiceRecorder();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('cancel button calls onCancel in idle state', () => {
    const onCancel = vi.fn();
    renderVoiceRecorder({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('VoiceRecorder — recording flow', () => {
  it('requests microphone permission on record click', async () => {
    renderVoiceRecorder();
    fireEvent.click(screen.getByLabelText('Start recording'));
    await waitFor(() => expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true }));
  });

  it('transitions to recording state after permission granted', async () => {
    renderVoiceRecorder();
    fireEvent.click(screen.getByLabelText('Start recording'));
    await waitFor(() => {
      expect(screen.getByLabelText('Stop recording')).toBeInTheDocument();
      expect(screen.getByText(/recording/i)).toBeInTheDocument();
    });
  });

  it('shows stop button in recording state', async () => {
    renderVoiceRecorder();
    await startRecording();
    expect(screen.getByLabelText('Stop recording')).toBeInTheDocument();
  });

  it('hides start button while recording', async () => {
    renderVoiceRecorder();
    await startRecording();
    expect(screen.queryByLabelText('Start recording')).not.toBeInTheDocument();
  });
});

describe('VoiceRecorder — preview state', () => {
  it('transitions to preview state after stop', async () => {
    renderVoiceRecorder();
    await advanceToPreview();
    expect(screen.getByText(/submit update/i)).toBeInTheDocument();
    expect(screen.getByText(/re-record/i)).toBeInTheDocument();
  });

  it('shows cancel button in preview state', async () => {
    renderVoiceRecorder();
    await advanceToPreview();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('re-record returns to idle state', async () => {
    renderVoiceRecorder();
    await advanceToPreview();
    fireEvent.click(screen.getByText(/re-record/i));
    await waitFor(() => {
      expect(screen.getByLabelText('Start recording')).toBeInTheDocument();
    });
  });

  it('cancel button calls onCancel from preview state', async () => {
    const onCancel = vi.fn();
    renderVoiceRecorder({ onCancel });
    await advanceToPreview();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('VoiceRecorder — submit', () => {
  it('submit calls onSuccess with audioKey, duration, and blob', async () => {
    const onSuccess = vi.fn();
    renderVoiceRecorder({ onSuccess });
    await advanceToPreview();
    fireEvent.click(screen.getByText(/submit update/i));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        MOCK_AUDIO_KEY,
        expect.any(Number),
        expect.any(Blob),
      );
    });
  });

  it('upload failure shows error state', async () => {
    const { uploadAudioBlob } = await import('@/hooks/useAudio');
    vi.mocked(uploadAudioBlob).mockRejectedValueOnce(
      new Error('Upload failed with status 403'),
    );

    renderVoiceRecorder();
    await advanceToPreview();
    fireEvent.click(screen.getByText(/submit update/i));

    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
    });
  });
});

describe('VoiceRecorder — error states', () => {
  it('shows error on microphone permission denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );

    renderVoiceRecorder();
    fireEvent.click(screen.getByLabelText('Start recording'));

    await waitFor(() => {
      expect(screen.getByText(/microphone permission denied/i)).toBeInTheDocument();
    });
  });

  it('shows try again button on permission denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );

    renderVoiceRecorder();
    fireEvent.click(screen.getByLabelText('Start recording'));

    await waitFor(() => {
      // Use getByRole to target only the button, not the error message text
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('shows generic error message on non-permission getUserMedia failure', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Device not found'));

    renderVoiceRecorder();
    fireEvent.click(screen.getByLabelText('Start recording'));

    await waitFor(() => {
      expect(screen.getByText(/could not access microphone/i)).toBeInTheDocument();
    });
  });

  it('try again from error state returns to idle', async () => {
    mockGetUserMedia.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );

    renderVoiceRecorder();
    fireEvent.click(screen.getByLabelText('Start recording'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument(),
    );

    // Reset mock so next attempt succeeds
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Start recording')).toBeInTheDocument();
    });
  });

  it('cancel button calls onCancel in error state', async () => {
    const onCancel = vi.fn();
    mockGetUserMedia.mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    );

    renderVoiceRecorder({ onCancel });
    fireEvent.click(screen.getByLabelText('Start recording'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
