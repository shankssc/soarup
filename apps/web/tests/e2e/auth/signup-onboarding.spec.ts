import { test, expect } from '@playwright/test';
import { signUp, completeOnboarding } from '../fixtures/auth';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// This spec tests the signup flow itself, so it must NOT inherit the
// project-level storageState (the seed user's already-authenticated,
// already-onboarded session). Without this override, every test here
// starts logged in as the seed user, and the app correctly redirects
// an authenticated user away from /signup — which is what was causing
// every test in this file to time out waiting for #email-input on a
// page it could never reach.
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTestPass1!';

// Date.now() alone is NOT unique enough here — fullyParallel: true runs
// the same test simultaneously across chromium/firefox/webkit/Mobile
// Chrome projects, and it's entirely possible for two workers to call
// Date.now() within the same millisecond and generate an identical
// email. When that happened, the second signup correctly failed
// uniqueness validation ("account already exists"), the page never
// left /signup, and every downstream step timed out waiting on a
// navigation that could never occur. crypto.randomUUID() gives real
// entropy per call regardless of timing.
const freshEmail = () => `e2e+fresh+${Date.now()}-${crypto.randomUUID()}@soarup.app`;
const freshWorkspace = () => `WS${Date.now()}${crypto.randomUUID().slice(0, 8)}`;

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
    // This assertion depends on a client-side-only guard: fresh page load
    // → JS hydration → Zustand rehydrate from localStorage → useEffect →
    // router.replace(). That's real async work, not instant — Firefox in
    // this environment has consistently been the slowest engine for this
    // kind of chain. The default 5s expect timeout was cutting off a
    // transition that was still correctly in progress. Match the 20s
    // budget already used for waitForURL elsewhere in this file.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });

  test('dashboard not accessible before onboarding', async ({ page }) => {
    await signUp(page, freshEmail(), PASSWORD);
    await page.waitForURL('**/onboarding', { timeout: 20_000 });
    await page.goto('/dashboard');
    // Same reasoning as above — DashboardPage's onboarding guard is
    // client-side only, so a fresh full navigation needs real time to
    // hydrate before the redirect fires.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
  });

  test('authenticated user redirected away from login', async ({ page }) => {
    const email = freshEmail();
    await signUp(page, email, PASSWORD);
    await completeOnboarding(page, 'Redirect Test', freshWorkspace());
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
