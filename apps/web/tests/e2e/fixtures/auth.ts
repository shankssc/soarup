import type { Page } from '@playwright/test';

const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e@soarup.app';
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';

export async function login(
  page: Page,
  email = EMAIL,
  password = PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export async function signUp(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/signup');
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.fill('[data-testid="confirm-password-input"]', password);
  await page.click('[data-testid="signup-submit"]');
}

export async function completeOnboarding(
  page: Page,
  displayName: string,
  workspaceName: string,
): Promise<void> {
  await page.waitForURL('**/onboarding', { timeout: 10_000 });
  await page.fill('[data-testid="display-name-input"]', displayName);
  await page.click('[data-testid="onboarding-step1-submit"]');
  await page.waitForSelector('[data-testid="workspace-name-input"]', {
    timeout: 10_000,
  });
  await page.fill('[data-testid="workspace-name-input"]', workspaceName);
  await page.click('[data-testid="create-workspace-submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export { EMAIL, PASSWORD };
