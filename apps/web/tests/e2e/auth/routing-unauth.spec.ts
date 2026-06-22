import { test, expect } from '@playwright/test';

test.describe('Unauthenticated routing', () => {
  test('dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('history redirects to login', async ({ page }) => {
    await page.goto('/history');
    await expect(page).toHaveURL(/\/login/);
  });

  test('settings redirects to login', async ({ page }) => {
    await page.goto('/settings/profile');
    await expect(page).toHaveURL(/\/login/);
  });
});
