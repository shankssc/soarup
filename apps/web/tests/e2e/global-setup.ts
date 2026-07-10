/* eslint-disable no-console */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { cleanupE2EData } from './fixtures/db-cleanup';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
export const SEED_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e+seed@soarup.app';
export const SEED_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';
export const STORAGE_STATE = path.join('tests', 'e2e', '.auth', 'seed-user.json');

async function deleteExistingSeedAuthUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sweep ALL e2e+ auth users, not just the seed user — a previous
  // interrupted run may have left "e2e+fresh+*" users behind too.
  const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const staleUsers = (data?.users ?? []).filter((u) => u.email?.startsWith('e2e+'));

  for (const user of staleUsers) {
    await supabase.auth.admin.deleteUser(user.id);
  }
  if (staleUsers.length > 0) {
    process.stdout.write(`✓ Deleted ${staleUsers.length} stale e2e+ auth user(s)\n`);
  }
}

async function globalSetup() {
  // ── Cleanup runs FIRST, unconditionally, before anything else ────────────
  // This is deliberate: it must not be skippable by an early throw further
  // down in setup (e.g. signup form timing out). Whatever state the LAST
  // run left behind — crashed, interrupted, or successful — gets swept up
  // before THIS run does anything else. That's what makes repeated runs
  // safe regardless of how the previous one ended.
  await cleanupE2EData(); // direct Postgres truncation — profiles/workspaces/etc.
  await deleteExistingSeedAuthUsers(); // Supabase Admin API — auth.users rows

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ── Signup ──────────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/signup`);
    await page.waitForSelector('[data-testid="email-input"]', { timeout: 10_000 });
    await page.fill('[data-testid="email-input"]', SEED_EMAIL);
    await page.fill('[data-testid="password-input"]', SEED_PASSWORD);
    await page.fill('[data-testid="confirm-password-input"]', SEED_PASSWORD);
    await page.click('[data-testid="signup-submit"]');

    // ── Onboarding ──────────────────────────────────────────────────────────
    await page.waitForURL('**/onboarding', { timeout: 20_000 });
    await page.waitForSelector('[data-testid="display-name-input"]', {
      timeout: 10_000,
    });
    await page.fill('[data-testid="display-name-input"]', 'E2E Test User');
    await page.click('[data-testid="onboarding-step1-submit"]');

    await page.waitForSelector('[data-testid="workspace-name-input"]', {
      timeout: 10_000,
    });
    await page.fill('[data-testid="workspace-name-input"]', 'E2E Workspace');
    await page.click('[data-testid="create-workspace-submit"]');

    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    process.stdout.write(`✓ Seed user created and onboarded: ${SEED_EMAIL}\n`);

    // ── Save auth state ─────────────────────────────────────────────────────
    await context.storageState({ path: STORAGE_STATE });
    process.stdout.write(`✓ Auth state saved to ${STORAGE_STATE}\n`);
  } catch (err) {
    process.stderr.write(`Global setup failed: ${(err as Error).message}\n`);
    await page.screenshot({
      path: path.join('tests', 'e2e', 'debug-setup-failure.png'),
      fullPage: true,
    });
    process.stderr.write('Screenshot saved to tests/e2e/debug-setup-failure.png\n');
    throw err;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
