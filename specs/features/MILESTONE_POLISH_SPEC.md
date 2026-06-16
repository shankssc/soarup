# SoarUp — Polish Milestone: UI + E2E Testing + Quick Fixes

# Branch: feature/milestone-polish

# Merges into: develop

# Prerequisites: feature/milestone-6 merged to develop ✅

---

## What This Milestone Delivers

### Quick Fixes (scaling debt — near-zero effort)

1. Replace pytz with stdlib zoneinfo (Issue 32)
2. Frontend guard on digest preview — skip Claude if HTML already set (Issue 33)
3. Cap DigestCard skeleton rows at 5 (Issue 36)
4. Invalidate workspaceKeys.mine() after digest settings save (Issue 37)
5. Consolidate digest task DB commits into single transaction (Issue 31)
6. Chunk digest email recipients into batches of 50 (Issue 29)
7. Add digest settings form re-sync on tab visibility change (Issue 35)

### UI Polish

8. Electric glow shadow system applied consistently to surface cards (Issue 5)
9. Light mode contrast refinement + WCAG AA audit (Issue 6)
10. Loading state indicators across auth and app pages (Issue 7)

### E2E Testing

11. signup → onboarding → dashboard (Issue 41)
12. text update submission → AI summary real-time (Issue 42)
13. invite teammate → accept → team dashboard (Issue 43)
14. voice update → transcription → summary (Issue 44)

### Mobile Testing

15. Voice recording verified on iOS Safari, iOS Chrome, Android Chrome (Issue 8)

---

## Branch Strategy

```
develop
└── feature/milestone-polish
    ├── feature/polish-quick-fixes        ← Issues 29, 31, 32, 33, 35, 36, 37
    ├── feature/polish-ui-depth           ← Issues 5, 6
    ├── feature/polish-loading-states     ← Issue 7
    └── feature/polish-e2e-tests          ← Issues 8, 41, 42, 43, 44

Merge order:
  feature/polish-quick-fixes → feature/milestone-polish
  feature/polish-ui-depth → feature/milestone-polish
  feature/polish-loading-states → feature/milestone-polish
  feature/polish-e2e-tests → feature/milestone-polish
  feature/milestone-polish → develop
```

**Recommended build order:** quick-fixes first (unblocks clean smoke
testing), then E2E tests (surfaces real UI issues), then UI polish
(fixes the issues E2E surfaces), then loading states last (lowest
risk, no logic changes).

---

## Part 1: Quick Fixes

### Fix 1 — Replace pytz with stdlib zoneinfo (Issue 32)

```python
# apps/api/app/workers/tasks.py
# Remove:
import pytz
tz = pytz.timezone(tz_str)
except pytz.UnknownTimeZoneError:

# Replace with:
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
tz = ZoneInfo(tz_str)
except ZoneInfoNotFoundError:
```

Remove from `requirements.txt`:

```
pytz
```

Verify `pytz` is not imported anywhere else before removing:

```bash
grep -r "import pytz" apps/api/
```

---

### Fix 2 — Frontend preview guard (Issue 33)

```typescript
// apps/web/src/components/domain/digests/digest-settings-panel.tsx
// Change:
async function handlePreviewClick() {
  await onPreview();
  setShowPreview(true);
}

// To:
async function handlePreviewClick() {
  if (!previewHtml) await onPreview();
  setShowPreview(true);
}
```

---

### Fix 3 — Cap DigestCard skeleton rows (Issue 36)

```typescript
// apps/web/src/components/domain/digests/digest-card.tsx
// Change:
Array.from({ length: digest.update_count });

// To:
Array.from({ length: Math.min(digest.update_count, 5) });
```

---

### Fix 4 — Invalidate workspace cache after digest settings save (Issue 37)

```typescript
// apps/web/src/hooks/useDigests.ts — useUpdateDigestSettings
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: digestKeys.settings(workspaceId) });
  queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() }); // ← add this
},
```

---

### Fix 5 — Consolidate digest task commits (Issue 31)

```python
# apps/api/app/workers/tasks.py — _send_workspace_digest_async
# Current pattern: multiple flush/commit points
# New pattern: all writes flushed, single commit at the end

# Step 1: create digest record
digest = await digest_repo.create(workspace_id, digest_date)
# No commit yet — flush only

# Step 2: set processing
await digest_repo.update_status(digest, "processing")
# No commit yet

# Step 3: generate summary (outside DB transaction — network call)
team_summary = await summarise(prompt, ...)

# Step 4: store items + update status
await digest_repo.add_items(digest.id, items)
await digest_repo.update_status(digest, "processing",
    summary=team_summary, update_count=len(processed))
# Still no commit

# Step 5: send email (outside transaction — network call)
email_success = await send_digest_email(...)

# Step 6: final status update + single commit
from datetime import UTC
await digest_repo.update_status(
    digest,
    "sent" if email_success else "failed",
    email_sent_at=datetime.now(UTC) if email_success else None,
)
await db.commit()  # ← single commit, all or nothing
```

Note: `digest_repo` methods must use `flush()` not `commit()` for this
pattern to work. Verify repo methods are flush-based before applying.

---

### Fix 6 — Chunk email recipients (Issue 29)

```python
# apps/api/app/lib/email.py — send_digest_email

RESEND_BATCH_SIZE = 50

async def send_digest_email(
    to_emails: list[str],
    workspace_name: str,
    digest_date: str,
    html: str,
) -> bool:
    if not to_emails:
        return True

    base_params = {
        "from": f"SoarUp <{settings.resend_from_email}>",
        "subject": f"{workspace_name} standup digest — {digest_date}",
        "html": html,
    }

    try:
        for i in range(0, len(to_emails), RESEND_BATCH_SIZE):
            batch = to_emails[i:i + RESEND_BATCH_SIZE]
            await asyncio.to_thread(
                resend.Emails.send,
                {**base_params, "to": batch},
            )
        logger.info("digest_email_sent", workspace=workspace_name,
                    total_recipients=len(to_emails))
        return True
    except Exception as e:
        logger.error("digest_email_failed", workspace=workspace_name, error=str(e))
        return False
```

---

### Fix 7 — Digest settings form re-sync on tab visibility (Issue 35)

```typescript
// apps/web/src/app/(app)/settings/digest/page.tsx

const queryClient = useQueryClient();

React.useEffect(() => {
  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && !isDirty) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.mine() });
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [isDirty, queryClient]);
```

---

## Part 2: UI Polish

### Design audit scope

Before writing any code, do a full walkthrough of the product as a user
and note every screen that looks unfinished. The likely list based on
what was built:

```
[ ] Login / signup pages — form spacing, button sizing, error states
[ ] Onboarding — step indicator, card depth, timezone selector styling
[ ] Dashboard — card elevation, pending members row, empty state
[ ] UpdateCard — text variant, voice variant, summary block
[ ] VoiceRecorder — all 5 states
[ ] /history — digest card list, item rows, load more button
[ ] /settings/profile — avatar upload area, form fields
[ ] /settings/members — member list rows, invite modal
[ ] /settings/digest — toggle, time picker, day pills, preview modal
[ ] Sidebar — nav links, workspace name, connection indicator
[ ] TopBar — border alignment, page title, avatar
```

Run each screen in both dark and light mode. Screenshot every issue.
Prioritise by visibility — things users see on first load matter most.

---

### Shadow system (Issue 5)

**Principle:** shadows create hierarchy. Content cards float above the
background. Interactive cards respond on hover. Modals float above everything.

**Dark mode — use glow shadows:**

```css
/* Card resting state */
.shadow-card-dark {
  box-shadow:
    0 0 0 1px var(--color-outline-variant),
    0 0 8px rgba(83, 221, 252, 0.06);
}

/* Card hover state */
.shadow-card-dark-hover {
  box-shadow:
    0 0 0 1px var(--color-outline),
    0 0 12px rgba(83, 221, 252, 0.12);
}

/* Modal / elevated surface */
.shadow-modal-dark {
  box-shadow:
    0 0 0 1px var(--color-outline-variant),
    0 0 40px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(83, 221, 252, 0.08);
}
```

**Light mode — use drop shadows:**

```css
/* Card resting state */
.shadow-card-light {
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
}

/* Card hover state */
.shadow-card-light-hover {
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.06);
}

/* Modal */
.shadow-modal-light {
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
}
```

Add these to `globals.css` as utility classes under `@layer utilities`.
Then apply theme-aware shadows using the `dark` class variant:

```typescript
// In component className:
className={cn(
  // base
  "bg-surface-high border border-outline-variant",
  // light shadow
  "shadow-[0_1px_3px_rgba(0,0,0,0.08)]",
  // dark glow (via dark: prefix — exception to the no-dark-prefix rule
  // because shadows are one of the few things CSS vars can't handle directly)
  "dark:shadow-[0_0_0_1px_var(--color-outline-variant),0_0_8px_rgba(83,221,252,0.06)]",
  // hover
  "hover:dark:shadow-[0_0_0_1px_var(--color-outline),0_0_12px_rgba(83,221,252,0.12)]",
  "transition-shadow duration-200",
)}
```

**Apply to these components:**

```
UpdateCard              ← resting + hover shadow
DigestCard              ← resting + hover shadow
VoiceRecorder card      ← resting shadow only (not interactive at card level)
MembersPanel rows       ← hover shadow only
Invite modal            ← modal shadow
DigestPreviewModal      ← modal shadow
OnboardingForm card     ← resting shadow
Auth page cards         ← resting shadow
```

---

### Light mode contrast (Issue 6)

**Step 1 — WCAG AA audit:**

Check these pairs using a contrast checker (WebAIM or Figma's contrast plugin):

```
text-on-surface-variant (#3d494c) on bg-surface (#ebfdfc)
  Target: 4.5:1 minimum for normal text

text-on-surface-variant (#3d494c) on bg-surface-high (#daeceb)
  Target: 4.5:1 minimum

text-outline (#6d797d) on bg-surface (#ebfdfc)
  This is used for labels and hints — target 3:1 minimum (large text)

text-primary (#00687a) on bg-surface (#ebfdfc)
  CTA text — target 4.5:1
```

If any pair fails, adjust the CSS variable value in `globals.css` `:root`
section. Do not change dark mode values — only `:root` light mode values.

**Step 2 — Surface separation:**

Increase the visual gap between `bg-surface` and `bg-surface-high` in
light mode. Currently both are close to `#ebfdfc`. Darken `bg-surface-high`
slightly to create readable card separation:

```css
/* Current */
--color-surface-high: #daeceb;

/* Adjusted — slightly more contrast against background */
--color-surface-high: #d0e6e5;
```

Test in Storybook with both Dark and Light story variants before committing.

**Step 3 — Surface warmth:**

The light mode background `#ebfdfc` is a cool pale teal. Consider warming
the container colours slightly to reduce the clinical feel:

```css
/* Current */
--color-container: #dff1f0;

/* Warmer — slight yellow-green tint */
--color-container: #e2f2ed;
```

This is subjective — preview in Storybook and compare before committing.

---

### Loading states (Issue 7)

**Three categories to fix:**

**Category A — Page-level transitions (auth pages)**

Add a loading overlay that appears between form submit and route change.
Create a shared component:

```typescript
// apps/web/src/components/ui/page-transition.tsx

'use client';

export function PageTransition({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent
                        rounded-full animate-spin" />
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
          Loading...
        </p>
      </div>
    </div>
  );
}
```

Apply in:

```typescript
// login-form.tsx — show during login + redirect
// signup-form.tsx — show during signup + redirect
// onboarding-form.tsx — show during step transitions
```

**Category B — Dashboard skeleton on first mount**

```typescript
// apps/web/src/components/domain/dashboard/dashboard-view.tsx

// Show when workspace is loading (before workspace.id is available)
if (!workspaceId) {
  return <DashboardSkeleton />;
}
```

```typescript
// apps/web/src/components/domain/dashboard/dashboard-skeleton.tsx

export function DashboardSkeleton() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-4 animate-pulse">
      {/* Date header skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-32 bg-surface-high rounded-card" />
        <div className="h-px bg-outline-variant" />
      </div>
      {/* Card skeletons */}
      {[1, 2].map((i) => (
        <div key={i} className="bg-surface-high rounded-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-highest" />
            <div className="space-y-1">
              <div className="h-3 w-24 bg-surface-highest rounded-card" />
              <div className="h-2 w-16 bg-surface-highest rounded-card" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-surface-highest rounded-card" />
            <div className="h-3 w-3/4 bg-surface-highest rounded-card" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Category C — VoiceRecorder requesting_permission label**

```typescript
// apps/web/src/components/domain/updates/voice-recorder.tsx
// In the requesting_permission render state, add a text label:

{recorderState === "requesting_permission" && (
  <div className="flex flex-col items-center gap-3">
    <div className="w-16 h-16 rounded-full bg-surface-high animate-pulse" />
    <p className="font-label text-[10px] uppercase tracking-[0.2em] text-outline">
      Requesting microphone...
    </p>
  </div>
)}
```

---

## Part 3: E2E Tests

### Setup

```bash
# Install Playwright if not already done
cd apps/web
npx playwright install chromium firefox webkit

# Verify playwright.config.ts baseURL points to localhost:3000
# Verify webServer command starts Next.js dev server
```

Create a shared test fixtures file:

```typescript
// apps/web/tests/e2e/fixtures/auth.ts

import { Page } from "@playwright/test";

export async function signUp(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/signup");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="signup-submit"]');
}

export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="login-submit"]');
}

export async function completeOnboarding(
  page: Page,
  displayName: string,
  workspaceName: string,
): Promise<void> {
  // Step 1 — Profile
  await page.waitForURL("/onboarding");
  await page.fill('[data-testid="display-name-input"]', displayName);
  // Timezone defaults to browser timezone — no change needed
  await page.click('[data-testid="onboarding-step1-submit"]');

  // Step 2 — Workspace
  await page.fill('[data-testid="workspace-name-input"]', workspaceName);
  await page.click('[data-testid="create-workspace-submit"]');
  await page.waitForURL("/dashboard");
}
```

**Note on data-testid attributes:**
Before writing E2E tests, add `data-testid` attributes to interactive
elements that tests need to find. This is more reliable than CSS selectors
or text content. Key elements to tag:

```typescript
// Forms
data-testid="email-input"
data-testid="password-input"
data-testid="signup-submit"
data-testid="login-submit"
data-testid="display-name-input"
data-testid="workspace-name-input"
data-testid="create-workspace-submit"
data-testid="onboarding-step1-submit"

// Dashboard
data-testid="submit-update-cta"
data-testid="update-textarea"
data-testid="update-submit-btn"
data-testid="update-card"
data-testid="update-status-badge"
data-testid="voice-note-cta"

// Members
data-testid="invite-member-btn"
data-testid="invite-email-input"
data-testid="invite-send-btn"
data-testid="pending-members-row"
```

---

### Test 1 — Signup → Onboarding → Dashboard (Issue 41)

```typescript
// apps/web/tests/e2e/auth/signup-onboarding.spec.ts

import { test, expect } from "@playwright/test";
import { signUp, completeOnboarding } from "../fixtures/auth";

const TEST_EMAIL = `test+${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPassword123!";

test.describe("Signup → Onboarding → Dashboard", () => {
  test("new user completes full signup flow", async ({ page }) => {
    // Sign up
    await signUp(page, TEST_EMAIL, TEST_PASSWORD);

    // Should redirect to onboarding
    await page.waitForURL("/onboarding");
    await expect(page).toHaveURL("/onboarding");

    // Complete onboarding
    await completeOnboarding(page, "Test User", "Test Workspace");

    // Should land on dashboard
    await expect(page).toHaveURL("/dashboard");
    await expect(
      page.locator('[data-testid="submit-update-cta"]'),
    ).toBeVisible();
  });

  test("onboarding is not accessible after completion", async ({ page }) => {
    await signUp(page, `test+skip${Date.now()}@example.com`, TEST_PASSWORD);
    await completeOnboarding(page, "Skip Test", "Skip Workspace");

    // Attempt to go back to onboarding
    await page.goto("/onboarding");

    // Should redirect to dashboard
    await expect(page).toHaveURL("/dashboard");
  });

  test("dashboard is not accessible before onboarding", async ({ page }) => {
    await signUp(page, `test+nodash${Date.now()}@example.com`, TEST_PASSWORD);

    // Try to skip onboarding
    await page.goto("/dashboard");

    // Should stay on onboarding
    await expect(page).toHaveURL("/onboarding");
  });

  test("unauthenticated access to dashboard redirects to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
```

---

### Test 2 — Text Update → AI Summary (Issue 42)

```typescript
// apps/web/tests/e2e/updates/text-update-submission.spec.ts

import { test, expect } from "@playwright/test";
import { login } from "../fixtures/auth";

// Use a pre-seeded test user (created in global setup)
// to avoid running full signup flow for every test
const SEEDED_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e@example.com";
const SEEDED_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "TestPassword123!";

test.describe("Text update submission", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, SEEDED_EMAIL, SEEDED_PASSWORD);
    await page.waitForURL("/dashboard");
  });

  test("submits update and sees processing badge", async ({ page }) => {
    await page.click('[data-testid="submit-update-cta"]');
    await page.fill(
      '[data-testid="update-textarea"]',
      "Today I worked on the E2E tests for SoarUp. No blockers.",
    );
    await page.click('[data-testid="update-submit-btn"]');

    // Update card should appear immediately
    const card = page.locator('[data-testid="update-card"]').first();
    await expect(card).toBeVisible({ timeout: 3000 });

    // Status badge should show processing
    const badge = card.locator('[data-testid="update-status-badge"]');
    await expect(badge).toContainText("Processing");
  });

  test("AI summary appears after processing", async ({ page }) => {
    await page.click('[data-testid="submit-update-cta"]');
    await page.fill(
      '[data-testid="update-textarea"]',
      "Fixed the WebSocket reconnect bug. Planning to add pagination tomorrow.",
    );
    await page.click('[data-testid="update-submit-btn"]');

    const card = page.locator('[data-testid="update-card"]').first();
    const badge = card.locator('[data-testid="update-status-badge"]');

    // Wait up to 30s for Celery + Claude to process
    await expect(badge).toContainText("Summarised", { timeout: 30_000 });

    // Summary block should be visible
    const summary = card.locator('[data-testid="update-summary"]');
    await expect(summary).toBeVisible();
    const summaryText = await summary.textContent();
    expect(summaryText?.length).toBeGreaterThan(10);
  });

  test("cannot submit a second update today", async ({ page }) => {
    // Submit first update
    await page.click('[data-testid="submit-update-cta"]');
    await page.fill('[data-testid="update-textarea"]', "First update today.");
    await page.click('[data-testid="update-submit-btn"]');

    await page.locator('[data-testid="update-card"]').first().waitFor();

    // Submit CTA should be hidden
    await expect(
      page.locator('[data-testid="submit-update-cta"]'),
    ).not.toBeVisible();
  });
});
```

---

### Test 3 — Invite → Accept → Team Dashboard (Issue 43)

```typescript
// apps/web/tests/e2e/members/invite-flow.spec.ts

import { test, expect, Browser } from "@playwright/test";
import { login, signUp, completeOnboarding } from "../fixtures/auth";
import { apiClient } from "../fixtures/api"; // direct API helper

const OWNER_EMAIL = `owner+${Date.now()}@example.com`;
const INVITEE_EMAIL = `invitee+${Date.now()}@example.com`;
const PASSWORD = "TestPassword123!";

test.describe("Invite flow", () => {
  test("owner invites member, member joins, both see team dashboard", async ({
    browser,
  }) => {
    // === OWNER CONTEXT ===
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await signUp(ownerPage, OWNER_EMAIL, PASSWORD);
    await completeOnboarding(ownerPage, "Owner User", "Team Workspace");

    // Navigate to members settings
    await ownerPage.goto("/settings/members");
    await ownerPage.click('[data-testid="invite-member-btn"]');
    await ownerPage.fill('[data-testid="invite-email-input"]', INVITEE_EMAIL);
    await ownerPage.click('[data-testid="invite-send-btn"]');

    // Capture invite code from success state
    const inviteCode = await ownerPage
      .locator('[data-testid="invite-code"]')
      .textContent();
    expect(inviteCode).toBeTruthy();

    // === INVITEE CONTEXT ===
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();

    // Navigate directly to invite URL
    await inviteePage.goto(`/invite/${inviteCode}`);
    await expect(inviteePage.locator("text=Team Workspace")).toBeVisible();

    // Sign up as invitee
    await inviteePage.click('[data-testid="invite-signup-link"]');
    await signUp(inviteePage, INVITEE_EMAIL, PASSWORD);

    // Auto-accept after onboarding step 1
    await inviteePage.waitForURL("/onboarding");
    await inviteePage.fill(
      '[data-testid="display-name-input"]',
      "Invitee User",
    );
    await inviteePage.click('[data-testid="onboarding-step1-submit"]');

    // Should skip workspace step and land on dashboard
    await inviteePage.waitForURL("/dashboard");

    // === VERIFY TEAM DASHBOARD ===
    // Owner dashboard should show invitee in pending section
    await ownerPage.reload();
    await expect(
      ownerPage.locator('[data-testid="pending-members-row"]'),
    ).toBeVisible();

    await ownerContext.close();
    await inviteeContext.close();
  });
});
```

---

### Test 4 — Voice Update (Issue 44)

```typescript
// apps/web/tests/e2e/updates/voice-update-submission.spec.ts

import { test, expect } from "@playwright/test";
import { login } from "../fixtures/auth";
import path from "path";

const SEEDED_EMAIL = process.env.E2E_TEST_EMAIL ?? "e2e@example.com";
const SEEDED_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "TestPassword123!";

// Grant microphone permission in browser context
test.use({
  permissions: ["microphone"],
});

test.describe("Voice update submission", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, SEEDED_EMAIL, SEEDED_PASSWORD);
    await page.waitForURL("/dashboard");
  });

  test("VoiceRecorder transitions through states", async ({ page }) => {
    await page.click('[data-testid="voice-note-cta"]');

    // Should show idle state
    await expect(
      page.locator('[data-testid="voice-recorder-idle"]'),
    ).toBeVisible();

    // Click record — transitions to recording
    await page.click('[data-testid="record-btn"]');
    await expect(
      page.locator('[data-testid="voice-recorder-recording"]'),
    ).toBeVisible({ timeout: 3000 });

    // Wait 2 seconds then stop
    await page.waitForTimeout(2000);
    await page.click('[data-testid="stop-btn"]');

    // Should show preview state
    await expect(
      page.locator('[data-testid="voice-recorder-preview"]'),
    ).toBeVisible({ timeout: 3000 });

    // Audio element should be present
    await expect(page.locator("audio")).toBeVisible();
  });

  test("re-record returns to idle", async ({ page }) => {
    await page.click('[data-testid="voice-note-cta"]');
    await page.click('[data-testid="record-btn"]');
    await page.waitForTimeout(1000);
    await page.click('[data-testid="stop-btn"]');

    await page.locator('[data-testid="voice-recorder-preview"]').waitFor();
    await page.click('[data-testid="rerecord-btn"]');

    await expect(
      page.locator('[data-testid="voice-recorder-idle"]'),
    ).toBeVisible();
  });

  // Note: Full pipeline test (upload → transcription → summary) requires
  // Celery worker + Minio + faster-whisper running.
  // Mark as slow and skip in CI unless E2E_FULL_PIPELINE=true.
  test("submits voice update and sees transcription", async ({ page }) => {
    test.skip(
      !process.env.E2E_FULL_PIPELINE,
      "Full pipeline test requires Celery + Minio + Whisper",
    );

    await page.click('[data-testid="voice-note-cta"]');
    await page.click('[data-testid="record-btn"]');
    await page.waitForTimeout(3000); // Record 3 seconds
    await page.click('[data-testid="stop-btn"]');

    await page.locator('[data-testid="voice-recorder-preview"]').waitFor();
    await page.click('[data-testid="submit-voice-btn"]');

    // Upload progress
    await expect(
      page.locator('[data-testid="voice-recorder-uploading"]'),
    ).toBeVisible({ timeout: 5000 });

    // Update card appears
    const card = page.locator('[data-testid="update-card"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Transcript appears (after WebSocket event)
    const transcript = card.locator('[data-testid="update-transcript"]');
    await expect(transcript).toBeVisible({ timeout: 60_000 });
    const transcriptText = await transcript.textContent();
    expect(transcriptText?.length).toBeGreaterThan(5);
  });
});
```

---

### Global E2E setup

```typescript
// apps/web/tests/e2e/global-setup.ts
// Creates a seeded test user before E2E suite runs
// so individual tests don't all run signup flow

import { chromium } from "@playwright/test";
import { signUp, completeOnboarding } from "./fixtures/auth";

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const email = process.env.E2E_TEST_EMAIL ?? "e2e@example.com";
  const password = process.env.E2E_TEST_PASSWORD ?? "TestPassword123!";

  try {
    await signUp(page, email, password);
    await completeOnboarding(page, "E2E Test User", "E2E Workspace");
    console.log("E2E seed user created:", email);
  } catch {
    // User may already exist from previous run — attempt login instead
    console.log("Seed user may already exist — skipping creation");
  }

  await browser.close();
}

export default globalSetup;
```

Update `playwright.config.ts`:

```typescript
export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  ...
});
```

---

### Mobile testing checklist (Issue 8)

Not a Playwright test — manual verification on physical devices or BrowserStack.

```
[ ] iOS Safari 16+ — record, preview, submit voice update
    getSupportedMimeType() returns audio/mp4
    MediaRecorder starts without error
    Upload succeeds
    Transcription completes

[ ] iOS Chrome — same flow
    Behaves identically to iOS Safari (WebKit under the hood)
    Verify same MIME type selection

[ ] Android Chrome — record, preview, submit voice update
    getSupportedMimeType() returns audio/webm or audio/webm;codecs=opus
    Verify server-side transcoding handles the format correctly

[ ] Mobile Safari — VoiceRecorder layout
    Record button tap target is large enough (minimum 44x44px)
    Preview audio playback works on mobile
    Upload progress visible on small screen
```

If BrowserStack is not available, test on a physical device.
Document results in a comment on Issue 8 before closing it.

---

## Acceptance Criteria

```
[ ] pytz removed, zoneinfo used throughout
[ ] Preview modal reuses cached HTML on re-open
[ ] DigestCard skeleton capped at 5 rows
[ ] Workspace cache invalidated after digest settings save
[ ] Digest task uses single DB commit
[ ] Digest email batched in groups of 50
[ ] Digest settings form re-syncs on tab visibility change
[ ] Shadow system applied to UpdateCard, DigestCard, VoiceRecorder,
    modals, and auth page cards
[ ] Light mode WCAG AA audit passed — all text/background pairs ≥ 4.5:1
[ ] Light mode surface separation visible — cards distinct from background
[ ] Loading overlay shown during login/signup/onboarding form submissions
[ ] Dashboard skeleton shown while workspace loads
[ ] VoiceRecorder requesting_permission state has text label
[ ] E2E: signup → onboarding → dashboard passes on chromium
[ ] E2E: text update → AI summary passes on chromium (real Celery + Claude)
[ ] E2E: invite → accept → team dashboard passes on chromium
[ ] E2E: voice recorder state transitions pass on chromium
[ ] E2E suite runs in CI on PR to develop (non-pipeline tests only)
[ ] Mobile: voice recording verified on iOS Safari
[ ] Mobile: voice recording verified on Android Chrome
[ ] CI passes on feature/milestone-polish branch
```

---

## Files To Create / Modify

### Backend (apps/api/)

```
apps/api/app/workers/tasks.py             ← single commit pattern, pytz → zoneinfo
apps/api/app/lib/email.py                 ← batch recipients, preview guard
apps/api/requirements.txt                 ← remove pytz
```

### Frontend (apps/web/src/)

```
components/ui/page-transition.tsx         ← NEW: page loading overlay
components/domain/dashboard/dashboard-skeleton.tsx ← NEW: dashboard skeleton
components/domain/updates/voice-recorder.tsx ← requesting_permission label
components/domain/digests/digest-card.tsx ← skeleton cap
components/domain/digests/digest-settings-panel.tsx ← preview guard
hooks/useDigests.ts                       ← workspace cache invalidation
app/(app)/settings/digest/page.tsx        ← visibility change re-sync
app/(auth)/login/page.tsx                 ← PageTransition
app/(auth)/signup/page.tsx                ← PageTransition
app/(app)/dashboard/page.tsx              ← DashboardSkeleton
globals.css                               ← shadow utilities
```

### E2E (apps/web/tests/e2e/)

```
global-setup.ts                           ← NEW: seed user
fixtures/auth.ts                          ← NEW: shared auth helpers
fixtures/api.ts                           ← NEW: direct API helper
auth/signup-onboarding.spec.ts            ← NEW: Issue 41
updates/text-update-submission.spec.ts    ← NEW: Issue 42
members/invite-flow.spec.ts               ← NEW: Issue 43
updates/voice-update-submission.spec.ts   ← NEW: Issue 44
```

### data-testid additions (spread across existing components)

```
login-form.tsx, signup-form.tsx           ← email, password, submit inputs
onboarding-form.tsx                       ← step1 fields, submit buttons
dashboard-view.tsx                        ← submit CTA, voice CTA
update-form.tsx                           ← textarea, submit button
update-card.tsx                           ← card, status badge, summary block
voice-recorder.tsx                        ← state containers, buttons
settings/members/page.tsx                 ← invite button, input, send button
```
