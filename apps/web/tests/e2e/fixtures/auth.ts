import type { Page } from '@playwright/test';
import path from 'path';

export const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e+seed@soarup.app';
export const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';
export const STORAGE_STATE = path.join('tests', 'e2e', '.auth', 'seed-user.json');

// WebKit-safe field fill: page.fill() sets the DOM value and dispatches an
// input event, but on WebKit this can occasionally race with React's
// controlled-input re-render (worse right after page load, when another
// field's autoFocus is also competing for focus in the same window) — the
// value lands in the DOM but React's onChange doesn't pick it up, leaving
// the field empty. Verifying the value after fill() and retrying with
// pressSequentially (real per-character keystroke events, which React
// reliably catches) closes that gap deterministically instead of guessing
// at a delay.
async function fillReliably(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.fill(selector, value);
  const actual = await page.inputValue(selector);
  if (actual !== value) {
    await page.fill(selector, '');
    await page.locator(selector).pressSequentially(value, { delay: 10 });
  }
}

// Only needed for tests that explicitly test the signup flow
export async function signUp(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/signup');
  await page.waitForSelector('[data-testid="email-input"]', { timeout: 10_000 });
  await fillReliably(page, '[data-testid="email-input"]', email);
  await fillReliably(page, '[data-testid="password-input"]', password);
  await fillReliably(page, '[data-testid="confirm-password-input"]', password);
  await page.click('[data-testid="signup-submit"]');
}

export async function completeOnboarding(
  page: Page,
  displayName: string,
  workspaceName: string,
): Promise<void> {
  await page.waitForURL('**/onboarding', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="display-name-input"]', {
    timeout: 10_000,
  });
  await fillReliably(page, '[data-testid="display-name-input"]', displayName);
  await page.click('[data-testid="onboarding-step1-submit"]');
  await page.waitForSelector('[data-testid="workspace-name-input"]', {
    timeout: 10_000,
  });
  await fillReliably(page, '[data-testid="workspace-name-input"]', workspaceName);
  await page.click('[data-testid="create-workspace-submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}

// No longer needed for most tests — storage state handles auth
export async function login(
  page: Page,
  email = EMAIL,
  password = PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('[data-testid="email-input"]', { timeout: 10_000 });
  await fillReliably(page, '[data-testid="email-input"]', email);
  await fillReliably(page, '[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20_000 });
}
