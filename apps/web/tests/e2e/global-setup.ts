/* eslint-disable no-console */
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
export const SEED_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e+seed@soarup.app';
export const SEED_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';
export const STORAGE_STATE = path.join('tests', 'e2e', '.auth', 'seed-user.json');

async function deleteExistingSeedUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const existing = (data?.users ?? []).find((u) => u.email === SEED_EMAIL);

  if (existing) {
    await supabase.auth.admin.deleteUser(existing.id);
    process.stdout.write(`✓ Deleted existing seed user: ${SEED_EMAIL}\n`);
  }
}

async function globalSetup() {
  // Always delete seed user first — clean slate every run
  await deleteExistingSeedUser();

  const browser = await chromium.launch();
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
    // Saves cookies + localStorage so tests can skip login entirely
    await context.storageState({ path: STORAGE_STATE });
    process.stdout.write(`✓ Auth state saved to ${STORAGE_STATE}\n`);
  } catch (err) {
    process.stderr.write(`Global setup failed: ${(err as Error).message}\n`);
    // Take a screenshot so we can see what went wrong
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
