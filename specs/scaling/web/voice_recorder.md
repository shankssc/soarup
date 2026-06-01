# SoarUp — Scaling & Technical Debt: Voice Recorder (Web)

# Path: specs/scaling/web/voice_recorder.md

# Status: Deferred — revisit after product has traction

# Last updated: Milestone 4

---

## Overview

This document tracks known scaling limitations, technical debt, and deferred
architectural decisions in the voice recording and audio playback layer
introduced in Milestone 4. This covers `VoiceRecorder`, `AudioPlayer`,
`useAudio`, and the `UpdateCard` voice variant. Items are ordered by expected
impact, not urgency. None of these are blockers for early-stage use.

---

## Issue 1 — VoiceRecorder Internal State Not Testable in Storybook

**Where:** `apps/web/src/components/domain/updates/voice-recorder.tsx`

**What:** `VoiceRecorder` manages all its state internally via `useState`.
States like `recording`, `preview`, `uploading`, and `error` cannot be
driven from outside the component, making it impossible to render specific
states in Storybook without real browser APIs (`MediaRecorder`, `getUserMedia`).
The M4 Storybook stories only cover `idle` and the `MicPermissionDenied`
error — the remaining states are undocumented visually.

```typescript
// Current — all state internal, no props for initial state
const [recorderState, setRecorderState] = React.useState<RecorderState>("idle");
```

**Impact:** Design review and visual regression testing are limited to idle
and error states. Recording, preview, and uploading states can only be
reviewed by manually interacting with the component in a real browser.

**Fix (post-M5 polish):** Extract a `VoiceRecorderUI` presentational component
that accepts `recorderState`, `duration`, `uploadProgress`, `audioUrl`, and
`error` as props. `VoiceRecorder` becomes a thin stateful wrapper over
`VoiceRecorderUI`. This unblocks all Storybook states and improves testability.

```typescript
// Extracted presentational component
export function VoiceRecorderUI({
  recorderState,
  duration,
  uploadProgress,
  audioUrl,
  error,
  onStartRecording,
  onStopRecording,
  onReRecord,
  onSubmit,
  onCancel,
}: VoiceRecorderUIProps) { ... }
```

**Effort:** Low — pure refactor, no behaviour change.

---

## Issue 2 — Waveform Visualisation Uses Static Random Heights

**Where:** `apps/web/src/components/domain/updates/voice-recorder.tsx`
→ `WaveformBars`

**What:** The recording state shows an animated waveform of 12 bars with
heights randomised at render time. The heights are static for the lifetime
of the component — only the CSS pulse animation gives the impression of
movement. This is not a real-time audio waveform.

```typescript
// Current — random heights computed once at render, not from audio data
style={{
  height: `${20 + Math.random() * 60}%`,
  animation: `pulse ${0.6 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
}}
```

**Impact:** Visual only — the waveform gives no feedback about actual audio
level or quality. Users cannot tell if their microphone is picking up audio
or if the recording is silent.

**Fix (post-M9 polish):** Use the Web Audio API `AnalyserNode` to read real
frequency data and update bar heights on each animation frame:

```typescript
const analyser = audioContext.createAnalyser();
stream.getAudioTracks()[0].connect(analyser);
// Read analyser.getByteFrequencyData(dataArray) in requestAnimationFrame loop
```

**Effort:** Medium — Web Audio API setup, animation frame loop, cleanup on
unmount. Adds meaningful component complexity.

---

## Issue 3 — AudioPlayer Autoplay Blocked on iOS Safari

**Where:** `apps/web/src/components/ui/audio-player.tsx`

**What:** The `AudioPlayer` attempts to auto-play via `audioRef.current.play()`
in a `useEffect` when the presigned URL becomes available. iOS Safari blocks
autoplay for any audio not directly triggered by a user gesture. Since the
URL fetch introduces an async gap between the user's click and the play call,
iOS Safari may not consider the play attempt "user-gesture-initiated" and
silently block it.

```typescript
// Current — play() called in useEffect, not directly in click handler
React.useEffect(() => {
  if (data?.playback_url && audioRef.current) {
    audioRef.current.play().catch(() => {
      // Autoplay blocked — user must press native controls
    });
  }
}, [data?.playback_url]);
```

**Impact:** Low for a standup tool — mobile Safari users will see the native
audio controls rendered but will need to manually press play. The `.catch()`
swallows the error silently so there's no broken state.

**Fix (pre-mobile launch):** Detect iOS and show a secondary tap-to-play
prompt after the URL is fetched, rather than attempting autoplay:

```typescript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
if (isIOS && data?.playback_url) {
  return <button onClick={() => audioRef.current?.play()}>Tap to play</button>;
}
```

**Effort:** Low — device detection + conditional render.

---

## Issue 4 — Expired Presigned URL Not Handled in AudioPlayer

**Where:** `apps/web/src/components/ui/audio-player.tsx`
and `apps/web/src/hooks/useAudio.ts` → `useAudioPlaybackUrl`

**What:** The playback URL is cached in React Query with `staleTime: 10min`
and `gcTime: 15min`. The presigned URL itself expires at 15 minutes. If a
user activates the player, pauses the audio, and leaves it paused for 15+
minutes, the URL expires and the audio element's `src` becomes a dead link.
Attempting to resume will fail silently — the native audio element shows an
error state but `AudioPlayer` has no handler for this.

```typescript
// Current — no error handler on audio element expiry
React.useEffect(() => {
  if (data?.playback_url && audioRef.current) {
    audioRef.current.play().catch(() => {});
  }
}, [data?.playback_url]);
```

**Impact:** Edge case — a user would need to pause audio for exactly 15+
minutes before attempting to resume. For a standup audio clip of 1-5 minutes,
this is unlikely in normal use.

**Fix:** Listen for audio element `error` events and refetch the URL when
the current src fails:

```typescript
audioRef.current.onerror = () => {
  queryClient.invalidateQueries({
    queryKey: audioKeys.playback(workspaceId, updateId),
  });
  setIsActive(false); // Reset to show play button again
};
```

**Effort:** Low — one `onerror` handler in `AudioPlayer`.

---

## Issue 5 — No Client-Side File Size Validation Before Upload

**Where:** `apps/web/src/components/domain/updates/voice-recorder.tsx`
→ `handleSubmit`

**What:** The 10MB file size limit is enforced by the API when the pre-signed
URL is requested. The frontend only discovers the file is too large after the
blob is fully recorded and the API returns a 422/413 error. There is no
client-side guard before the upload attempt.

```typescript
// Current — size checked by API, not before requesting URL
const { upload_url, object_key } = await requestUploadUrlMutation.mutateAsync({
  content_type: audioBlob.type,
  file_size_bytes: audioBlob.size, // API rejects if > 10MB
});
```

**Impact:** Low — a 5-minute recording at WebM/Opus quality is typically
2-5MB. Only extremely verbose recordings or uncompressed formats would hit
the limit. When it does happen, the user sees an error after recording
completes rather than a proactive warning.

**Fix:** Add a client-side size check in `handleSubmit` before calling
the API:

```typescript
const MAX_BLOB_SIZE = 10 * 1024 * 1024; // 10MB

async function handleSubmit() {
  if (!audioBlob) return;
  if (audioBlob.size > MAX_BLOB_SIZE) {
    setError(
      "Recording is too large (max 10MB). Please re-record a shorter update.",
    );
    setRecorderState("error");
    return;
  }
  // ... proceed with upload
}
```

**Effort:** Near-zero — three lines of code.

---

## Issue 6 — Voice Updates Cannot Be Edited After Submission

**Where:** `apps/web/src/components/domain/updates/update-card.tsx`

**What:** Voice updates disable the edit option — `CardMenu` receives
`onEdit={() => {}}` (a no-op) for voice updates. The edit form is designed
for text content and has no affordance for re-recording or editing the
transcript. A user who submits a voice update with a transcription error
has no correction path short of deleting and re-submitting.

```typescript
// Current — edit is a no-op for voice updates
{isOwner && isVoice && (
  <CardMenu onEdit={() => {}} onDelete={handleDelete} />
)}
```

**Impact:** Medium UX — transcription errors (especially for technical
vocabulary, names, or accented speech) will appear in the transcript and
summary with no correction path.

**Fix options (Milestone 5):**

Option A — Allow editing the transcript text directly (same edit form,
pre-filled with transcript text). Re-trigger summarisation after save.

Option B — Hide the edit option entirely for voice updates (remove the
menu item) so the no-op isn't confusing.

Option C — Add a "Re-record" option that deletes the current audio and
allows a new recording for the same date.

**Recommendation:** Option B immediately (remove confusing no-op),
Option A or C in a later milestone.

**Effort:** Near-zero for Option B. Medium for Options A and C.

---

## Issue 7 — Audio Duration Approximated by Client-Side Interval

**Where:** `apps/web/src/components/domain/updates/voice-recorder.tsx`

**What:** `audio_duration_seconds` sent to the API is derived from a
`setInterval` counter that increments by 1 every second, starting when
`MediaRecorder.start()` is called and stopping when `stopRecording()` is
called. This is a wall-clock approximation — the actual encoded audio
duration may differ by 1-2 seconds due to timer drift or the gap between
`MediaRecorder.start()` and actual audio data collection beginning.

```typescript
// Current — wall-clock counter, not derived from blob
durationIntervalRef.current = setInterval(() => {
  setDuration((d) => d + 1);
}, 1000);
```

**Impact:** Minor — duration shown in `AudioPlayer` before activation may
be 1-2 seconds off from what the native `<audio>` element reports after
loading. No functional impact.

**Fix (Milestone 5, backend):** The accurate duration is available from
faster-whisper's `info.duration` after transcription. Write it back to the
DB and the frontend will display it on next load. See `voice_pipeline.md`
Issue 7 for the backend fix.

**Effort:** Low on the backend side. No frontend change needed.

---

## Summary Table

| #   | Issue                                           | Impact                          | Fix Milestone  | Effort           |
| --- | ----------------------------------------------- | ------------------------------- | -------------- | ---------------- |
| 1   | VoiceRecorder state not testable in Storybook   | Low (design review only)        | Post-M5 polish | Low              |
| 2   | Waveform uses static random heights             | Visual only                     | Post-M9 polish | Medium           |
| 3   | AudioPlayer autoplay blocked on iOS Safari      | Low (manual tap required)       | Pre-mobile     | Low              |
| 4   | Expired presigned URL not handled in player     | Low (edge case timing)          | Milestone 5    | Low              |
| 5   | No client-side file size validation             | Low (rarely hit in practice)    | Immediate      | Near-zero        |
| 6   | Voice updates cannot be edited after submission | Medium (no transcript fix path) | Milestone 5    | Near-zero–Medium |
| 7   | Audio duration approximated by interval         | Minor (1-2s inaccuracy)         | Milestone 5    | Low (backend)    |

---

## Pre-Production Checklist (Web items)

```
[ ] Issue 5:  Add client-side blob size check in VoiceRecorder.handleSubmit
[ ] Issue 6:  Remove no-op edit button for voice updates (Option B minimum)
[ ] Issue 3:  Test and handle iOS Safari autoplay behaviour before mobile launch
[ ] Issue 4:  Add onerror handler in AudioPlayer to handle expired presigned URLs
```
