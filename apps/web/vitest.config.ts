import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  test: {
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["**/*.stories.tsx", "**/*.test.tsx", "src/test/**", "src/types/**", "src/lib/supabase/**"],
      thresholds: {
        statements: 80,
        // Align with Spec 07 (was 75 in ash-ui)
        branches: 80,
        functions: 80,
        lines: 80
      }
    },
    workspace: [{
      extends: true,
      test: {
        globals: true,
        environment: "jsdom",
        setupFiles: "./src/test/setup.ts",
        include: ["src/**/*.{test,spec}.{ts,tsx}"],
        exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"]
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: 'playwright',
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});
