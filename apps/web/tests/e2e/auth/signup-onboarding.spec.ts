import { test, expect } from '@playwright/test';
import { signUp, completeOnboarding } from '../fixtures/auth';
import { createClient } from '@supabase/supabase-js';

const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';
const freshEmail = () => `e2e+fresh+${Date.now()}@soarup.app`;
const freshWorkspace = () => `WS${Date.now()}`;

// Clean up any fresh test users created in this spec
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

test.describe('Signup → Onboarding → Dashboard (#58)', () => {
  test('new user completes full signup and onboarding flow', async ({ page }) => {
    await signUp(page, freshEmail(), PASSWORD);
    await completeOnboarding(page, 'Fresh User', freshWorkspace());
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('[data-testid="submit-update-cta"]')).toBeVisible();
  });

  test('onboarding not accessible after completion', async ({ page }) => {
    await signUp(page, freshEmail(), PASSWORD);
    await completeOnboarding(page, 'Skip Test', freshWorkspace());
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard not accessible before onboarding', async ({ page }) => {
    await signUp(page, freshEmail(), PASSWORD);
    await page.waitForURL('**/onboarding', { timeout: 20_000 });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('authenticated user redirected away from login', async ({ page }) => {
    const email = freshEmail();
    await signUp(page, email, PASSWORD);
    await completeOnboarding(page, 'Redirect Test', freshWorkspace());
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
