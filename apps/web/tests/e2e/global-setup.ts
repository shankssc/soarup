/* eslint-disable no-console */
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e@soarup.app';
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';
const DISPLAY_NAME = 'E2E Test User';
const WORKSPACE_NAME = 'E2E Workspace';

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Navigate to signup
    await page.goto(`${BASE_URL}/signup`);

    // Fill signup form
    await page.fill('[data-testid="email-input"]', EMAIL);
    await page.fill('[data-testid="password-input"]', PASSWORD);
    await page.fill('[data-testid="confirm-password-input"]', PASSWORD);
    await page.click('[data-testid="signup-submit"]');

    // Wait for onboarding redirect
    await page.waitForURL('**/onboarding', { timeout: 15_000 });

    // Step 1 — profile
    await page.fill('[data-testid="display-name-input"]', DISPLAY_NAME);
    await page.click('[data-testid="onboarding-step1-submit"]');

    // Step 2 — workspace
    await page.waitForSelector('[data-testid="workspace-name-input"]', {
      timeout: 10_000,
    });
    await page.fill('[data-testid="workspace-name-input"]', WORKSPACE_NAME);
    await page.click('[data-testid="create-workspace-submit"]');

    // Confirm landing on dashboard
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    console.log(`✓ E2E seed user created: ${EMAIL}`);
  } catch {
    // User likely already exists from a previous run — attempt login instead
    console.log(`Seed user may already exist — attempting login for ${EMAIL}`);
    try {
      await page.goto(`${BASE_URL}/login`);
      await page.fill('[data-testid="email-input"]', EMAIL);
      await page.fill('[data-testid="password-input"]', PASSWORD);
      await page.click('[data-testid="login-submit"]');
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      console.log(`✓ Logged in as existing seed user: ${EMAIL}`);
    } catch (loginErr) {
      console.error('Global setup failed — could not create or log in seed user');
      throw loginErr;
    }
  } finally {
    await browser.close();
  }
}

export default globalSetup;
