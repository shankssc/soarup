//apps/web/tests/e2e/updates/voice-update-submission.spec.ts

import { test, expect } from '@playwright/test';
import { signUp, completeOnboarding } from '../fixtures/auth';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Same reasoning as text-update-submission.spec.ts: submission/pipeline
// mechanics don't vary by browser engine, and the fake-audio-device
// launch flags configured for this project are Chromium-specific —
// firefox/webkit have no equivalent, so running there would just hang
// waiting on a real, unavailable microphone.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'voice-update-submission targets chromium only — fake audio device flags are Chromium-specific, and pipeline mechanics do not vary by browser engine.',
  );
});

// Same isolation reasoning as text-update-submission.spec.ts: the backend
// enforces one update per user per day, so this spec creates its own
// fresh user + workspace rather than sharing the seed user, to avoid
// colliding with any other spec file submitting "today's" update in the
// same test run.
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';
const freshEmail = () => `e2e+fresh+${Date.now()}-${crypto.randomUUID()}@soarup.app`;
const freshWorkspace = () => `WS${Date.now()}${crypto.randomUUID().slice(0, 8)}`;

async function deleteFreshUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const freshUsers = (data?.users ?? []).filter((u) => u.email?.includes('e2e+fresh+'));

  for (const user of freshUsers) {
    await supabase.auth.admin.deleteUser(user.id);
  }
}

test.afterAll(async () => {
  await deleteFreshUsers();
});

async function setUpFreshDashboard(page: import('@playwright/test').Page) {
  await signUp(page, freshEmail(), PASSWORD);
  await completeOnboarding(page, 'Voice Test User', freshWorkspace());
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.locator('[data-testid="submit-update-cta"]')).toBeVisible();
}

test.describe('Voice update submission (#61)', () => {
  // Real pipeline: upload → transcode → faster-whisper transcription →
  // Claude summarisation. Slower than the text-update pipeline (#59)
  // since transcription adds real time on top of the summarisation wait
  // already budgeted there — 180s gives room for setup, the recording
  // interaction itself, and the full pipeline. If this proves tight
  // against real latency, that's a signal to widen with evidence, same
  // lesson as every other timeout in this suite.
  test.setTimeout(180_000);

  test('records and submits a voice update through the full pipeline', async ({
    page,
  }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="voice-note-cta"]');
    await expect(page.locator('[data-testid="voice-recorder-idle"]')).toBeVisible();

    await page.click('[data-testid="record-btn"]');
    await expect(page.locator('[data-testid="voice-recorder-recording"]')).toBeVisible({
      timeout: 10_000,
    });

    // Let the fake device feed a couple of real chunks (collected every
    // 100ms per VoiceRecorder's mediaRecorder.start(100)) before stopping
    // — stopping instantly risks an empty/near-empty blob.
    await page.waitForTimeout(2000);
    await page.click('[data-testid="stop-btn"]');

    await expect(page.locator('[data-testid="voice-recorder-preview"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.click('[data-testid="submit-voice-btn"]');

    // Uploading state is likely transient (direct-to-Minio PUT of a few
    // seconds of audio is fast) — don't assert on it, go straight to
    // waiting for the recorder to close out and the card to appear.
    await expect(page.locator('[data-testid="voice-recorder-idle"]')).toBeHidden({
      timeout: 15_000,
    });

    const card = page.locator('[data-testid="update-card"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    // VoiceBadge renders "Voice" text on voice-mode cards specifically.
    await expect(card).toContainText('Voice');

    const badge = page.locator('[data-testid="update-status-badge"]');
    await expect(badge).toBeVisible();

    // Full pipeline: transcode → faster-whisper → Claude. The fake audio
    // is a plain tone, not speech, so the transcript content itself is
    // meaningless — this asserts the pipeline completes end-to-end
    // (status reaches "processed"), matching the milestone spec's own
    // bar for this test ("state transitions at minimum"), not that
    // whisper produces a coherent transcript from a sine wave.
    await expect(badge).toContainText(/summarised/i, { timeout: 150_000 });
  });

  test('cancel from idle returns to the submission CTAs', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="voice-note-cta"]');
    await expect(page.locator('[data-testid="voice-recorder-idle"]')).toBeVisible();

    await page.click('button:has-text("Cancel")');

    await expect(page.locator('[data-testid="voice-recorder-idle"]')).toBeHidden();
    await expect(page.locator('[data-testid="submit-update-cta"]')).toBeVisible();
    await expect(page.locator('[data-testid="voice-note-cta"]')).toBeVisible();
    await expect(page.locator('[data-testid="update-card"]')).toHaveCount(0);
  });

  test('re-record discards the current take and returns to idle', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="voice-note-cta"]');
    await page.click('[data-testid="record-btn"]');
    await expect(page.locator('[data-testid="voice-recorder-recording"]')).toBeVisible({
      timeout: 10_000,
    });

    await page.waitForTimeout(1500);
    await page.click('[data-testid="stop-btn"]');
    await expect(page.locator('[data-testid="voice-recorder-preview"]')).toBeVisible({
      timeout: 10_000,
    });

    await page.click('[data-testid="rerecord-btn"]');

    await expect(page.locator('[data-testid="voice-recorder-idle"]')).toBeVisible();
    // Nothing should have been submitted — re-record discards, doesn't upload.
    await expect(page.locator('[data-testid="update-card"]')).toHaveCount(0);
  });
});
