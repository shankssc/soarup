import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const STORAGE_STATE = path.join('tests', 'e2e', '.auth', 'seed-user.json');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Unauthenticated tests — no storage state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium-unauth',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*unauth.*\.spec\.ts/,
    },
    // Authenticated tests — load saved auth state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
        // Fake media device flags — feeds real audio bytes from a WAV
        // file into getUserMedia() as if it were a live microphone, so
        // VoiceRecorder's actual MediaRecorder pipeline runs for real in
        // voice-update-submission.spec.ts, rather than needing to mock
        // MediaRecorder itself (which would skip exercising the real
        // getSupportedMimeType() fallback chain and chunk/blob assembly
        // logic — exactly the kind of thing worth testing for real).
        // Chromium-specific flags — this is also why voice-update
        // submission tests are scoped to the chromium project only.
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-permissions',
            `--use-file-for-fake-audio-capture=${path.resolve(
              __dirname,
              'tests/e2e/fixtures/test-audio.wav',
            )}`,
          ],
        },
      },
      testIgnore: /.*unauth.*\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: STORAGE_STATE,
      },
      testIgnore: /.*unauth.*\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: STORAGE_STATE,
      },
      testIgnore: /.*unauth.*\.spec\.ts/,
    },
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: STORAGE_STATE,
      },
      testIgnore: /.*unauth.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
