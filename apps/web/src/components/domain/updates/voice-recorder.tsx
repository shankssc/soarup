// apps/web/src/components/domain/updates/voice-recorder.tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useRequestUploadUrl, uploadAudioBlob } from '@/hooks/useAudio';

// ── Types ─────────────────────────────────────────────────────────────────────

type RecorderState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'preview'
  | 'uploading'
  | 'error';

interface VoiceRecorderProps {
  workspaceId: string;
  updateDate: string;
  onSuccess: (audioKey: string, durationSeconds: number, blob: Blob) => void;
  onCancel: () => void;
}

const MAX_DURATION_SECONDS = 300; // 5 minutes

const SUPPORTED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function getSupportedMimeType(): string {
  for (const type of SUPPORTED_MIME_TYPES) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/webm';
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Animated waveform bars (CSS animation, not real audio data) ───────────────

function WaveformBars() {
  return (
    <div className="flex h-8 items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-sm bg-primary"
          style={{
            height: `${20 + Math.random() * 60}%`,
            animation: `pulse ${0.6 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
            animationDelay: `${(i * 0.08).toFixed(2)}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoiceRecorder({
  workspaceId,
  onSuccess,
  onCancel,
}: VoiceRecorderProps) {
  const [recorderState, setRecorderState] = React.useState<RecorderState>('idle');
  const [duration, setDuration] = React.useState(0);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const durationIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const requestUploadUrl = useRequestUploadUrl(workspaceId);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [audioUrl]);

  async function startRecording() {
    setError(null);
    setRecorderState('requesting_permission');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecorderState('preview');
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100); // collect chunks every 100ms
      setRecorderState('recording');
      setDuration(0);

      durationIntervalRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= MAX_DURATION_SECONDS - 1) {
            stopRecording();
            return MAX_DURATION_SECONDS;
          }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access and try again.'
          : 'Could not access microphone. Please check your device settings.';
      setError(message);
      setRecorderState('error');
    }
  }

  function stopRecording() {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    mediaRecorderRef.current?.stop();
  }

  function reRecord() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setError(null);
    setRecorderState('idle');
  }

  async function handleSubmit() {
    if (!audioBlob) return;
    setRecorderState('uploading');
    setUploadProgress(0);

    try {
      // 1. Request pre-signed PUT URL
      const { upload_url, object_key } = await requestUploadUrl.mutateAsync({
        content_type: audioBlob.type,
        file_size_bytes: audioBlob.size,
      });

      // 2. Upload directly to Minio/R2 — no FastAPI involvement
      await uploadAudioBlob(upload_url, audioBlob, setUploadProgress);

      // 3. Hand off to parent — parent calls useSubmitUpdate
      onSuccess(object_key, duration, audioBlob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setRecorderState('error');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'shadow-card flex flex-col gap-6 border bg-surface-high p-6',
        recorderState === 'error' ? 'border-error' : 'border-outline-variant',
      )}
    >
      {/* ── IDLE ── */}
      {recorderState === 'idle' && (
        <div
          className="flex flex-col items-center gap-4 py-4"
          data-testid="voice-recorder-idle"
        >
          <button
            onClick={startRecording}
            className={cn(
              'flex h-20 w-20 items-center justify-center',
              'rounded-full bg-primary-container text-primary-on-container',
              'transition-all hover:shadow-electric hover:brightness-105',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-2',
            )}
            aria-label="Start recording"
            data-testid="record-btn"
          >
            <span
              className="material-symbols-outlined text-[36px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              mic
            </span>
          </button>
          <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
            Tap to record
          </span>
        </div>
      )}

      {/* ── REQUESTING PERMISSION ── */}
      {recorderState === 'requesting_permission' && (
        <div
          className="flex flex-col items-center gap-3 py-4"
          data-testid="voice-recorder-requesting-permission"
        >
          <div className="h-20 w-20 animate-pulse rounded-full border border-outline-variant bg-surface-highest" />
          <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
            Requesting microphone...
          </span>
        </div>
      )}

      {/* ── RECORDING ── */}
      {recorderState === 'recording' && (
        <div
          className="flex flex-col items-center gap-4 py-4"
          data-testid="voice-recorder-recording"
        >
          {/* Pulsing ring + stop button */}
          <div className="relative flex items-center justify-center">
            <div className="absolute h-24 w-24 animate-ping rounded-full border-2 border-error opacity-20" />
            <div className="absolute h-20 w-20 rounded-full border border-error opacity-40" />
            <button
              onClick={stopRecording}
              className={cn(
                'relative flex h-20 w-20 items-center justify-center',
                'rounded-full bg-error text-error-on',
                'transition-all hover:brightness-90',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2',
              )}
              aria-label="Stop recording"
              data-testid="stop-btn"
            >
              <span
                className="material-symbols-outlined text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                stop
              </span>
            </button>
          </div>

          {/* Duration counter */}
          <span className="font-mono text-3xl tabular-nums text-on-surface">
            {formatDuration(duration)}
          </span>

          {/* Waveform */}
          <WaveformBars />

          {/* Recording label */}
          <span className="animate-pulse font-label text-[10px] uppercase tracking-[0.15em] text-error">
            Recording
          </span>

          {/* Max duration warning */}
          {duration >= MAX_DURATION_SECONDS - 30 && (
            <span className="font-label text-[10px] uppercase tracking-[0.08em] text-amber-400">
              {MAX_DURATION_SECONDS - duration}s remaining
            </span>
          )}
        </div>
      )}

      {/* ── PREVIEW ── */}
      {recorderState === 'preview' && audioUrl && (
        <div className="flex flex-col gap-4" data-testid="voice-recorder-preview">
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
              Preview
            </span>
            <span className="font-label text-[10px] tabular-nums text-outline">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Native audio player */}
          <audio
            src={audioUrl}
            controls
            className="h-10 w-full"
            style={{ colorScheme: 'dark' }}
          />

          {/* CTAs */}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              asymmetric
              onClick={handleSubmit}
              className="flex-1"
              data-testid="submit-voice-btn"
            >
              Submit update
              <span
                className="material-symbols-outlined text-[18px]"
                aria-hidden="true"
              >
                arrow_forward
              </span>
            </Button>
            <Button variant="secondary" onClick={reRecord} data-testid="rerecord-btn">
              Re-record
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── UPLOADING ── */}
      {recorderState === 'uploading' && (
        <div
          className="flex flex-col gap-4 py-4"
          data-testid="voice-recorder-uploading"
        >
          <div className="flex items-center justify-between">
            <span className="font-label text-[10px] uppercase tracking-[0.15em] text-on-surface-variant">
              Uploading...
            </span>
            <span className="font-label text-[10px] tabular-nums text-outline">
              {uploadProgress}%
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-0.5 w-full overflow-hidden bg-surface-highest">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {recorderState === 'error' && (
        <div className="flex flex-col items-center gap-4 py-4">
          <span
            className="material-symbols-outlined text-[36px] text-error"
            aria-hidden="true"
          >
            mic_off
          </span>
          <p className="text-center font-label text-[10px] uppercase tracking-[0.08em] text-error">
            {error}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reRecord}>
              Try again
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Cancel affordance for non-error states ── */}
      {!['error', 'preview', 'uploading'].includes(recorderState) && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
