//apps/web/tests/e2e/updates/text-update-submission.spec.ts

import { test, expect } from '@playwright/test';
import { signUp, completeOnboarding } from '../fixtures/auth';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Submission/status-transition logic is browser-agnostic — it runs through
// identical JS regardless of engine (unlike auth/cookie handling in #58,
// which genuinely differed across browsers). Running the full 4-project
// matrix here would multiply CI time without multiplying real bug-catching
// power. See discussion in #58 follow-up for the full reasoning.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'text-update-submission targets chromium only — submission mechanics do not vary by browser engine.',
  );
});

// This spec must NOT use the shared seed user via storageState. The backend
// enforces one update per user per day (409 otherwise) — if this spec used
// the seed user, it would collide with any OTHER spec file that also
// submits "today's" update against that same shared workspace (e.g. a
// future voice-update-submission.spec.ts), since fullyParallel runs spec
// files concurrently, not just browser projects. Creating a fresh user +
// workspace per test isolates this spec completely from that risk — same
// category of fix as the Date.now() email collision found in #58, one
// layer up (cross-spec-file rather than cross-browser-project).
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

// Shared setup: every test in this file needs a fresh, onboarded user
// sitting on the dashboard before exercising submission behavior.
async function setUpFreshDashboard(page: import('@playwright/test').Page) {
  await signUp(page, freshEmail(), PASSWORD);
  await completeOnboarding(page, 'Update Test User', freshWorkspace());
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.locator('[data-testid="submit-update-cta"]')).toBeVisible();
}

test.describe('Text update submission (#59)', () => {
  // Playwright's default per-test timeout is 30s — calibrated for typical
  // fast interactions, not "fresh signup + onboarding (itself several
  // seconds, per #58) + waiting on a real Celery/Claude summarization
  // pipeline." An inner expect()'s own { timeout } can never rescue a test
  // from this outer budget — if the whole test is capped at 30s, a 60s
  // wait on one assertion inside it is structurally impossible to satisfy
  // regardless of whether the app is behaving correctly. 120s gives enough
  // room for setup (~20-30s worst case) plus the summarization wait.
  test.setTimeout(120_000);

  test('submits a text update and shows it in the update list', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="submit-update-cta"]');
    await page.fill(
      '[data-testid="update-textarea"]',
      'Shipped the new dashboard guard.',
    );
    await page.click('[data-testid="update-submit-btn"]');

    // Form closes and the CTA is replaced by the submitted card — this is
    // hasSubmittedToday flipping true in DashboardPage, driven by the
    // update now existing in the React Query cache post-mutation.
    await expect(page.locator('[data-testid="submit-update-cta"]')).toBeHidden();
    const card = page.locator('[data-testid="update-card"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Shipped the new dashboard guard.');

    // Status badge should be visible immediately in a pending/processing
    // state — this part is deterministic and fast, safe to assert directly.
    await expect(page.locator('[data-testid="update-status-badge"]')).toBeVisible();
  });

  test('status transitions from processing to summarised', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="submit-update-cta"]');
    await page.fill(
      '[data-testid="update-textarea"]',
      'Refactored the auth guard and fixed a signup redirect race.',
    );
    await page.click('[data-testid="update-submit-btn"]');

    const badge = page.locator('[data-testid="update-status-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(/processing/i);

    // This depends on the real Celery + Claude summarisation pipeline
    // completing and the WebSocket update.status_changed event patching
    // the cache (see useDashboardUpdates). 45s is a starting budget for
    // local/staging — if this proves flaky against real latency, that's
    // a signal to tune the number with evidence rather than guess wider,
    // same lesson as the cookie-polling fix in #58.
    await expect(badge).toContainText(/summarised/i, { timeout: 90_000 });
    await expect(page.locator('[data-testid="update-summary"]')).toBeVisible();
  });

  test('cancel returns to the CTA without submitting', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="submit-update-cta"]');
    await page.fill('[data-testid="update-textarea"]', 'This should not be submitted.');
    await page.click('button:has-text("Cancel")');

    await expect(page.locator('[data-testid="update-textarea"]')).toBeHidden();
    await expect(page.locator('[data-testid="submit-update-cta"]')).toBeVisible();
    await expect(page.locator('[data-testid="update-card"]')).toHaveCount(0);
  });

  test('submit is disabled when the textarea is empty', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="submit-update-cta"]');
    await expect(page.locator('[data-testid="update-submit-btn"]')).toBeDisabled();
  });

  test('submit is disabled over the 1000 character limit', async ({ page }) => {
    await setUpFreshDashboard(page);

    await page.click('[data-testid="submit-update-cta"]');
    await page.fill('[data-testid="update-textarea"]', 'a'.repeat(1001));
    await expect(page.locator('[data-testid="update-submit-btn"]')).toBeDisabled();
  });
});
