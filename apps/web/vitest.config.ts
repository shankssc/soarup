// apps/web/vitest.config.ts

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),  // ← also fixes the __dirname ESM bug
    },
  },
  test: {
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "**/*.stories.tsx",
        "**/*.test.tsx",
        "src/test/**",
        "src/types/**",
        "src/lib/supabase/**",

        // Config files — declarative, not logic
        "*.config.{ts,mjs,js}",
        "*.config.d.ts",
        "next-env.d.ts",
        ".storybook/**",

        // Next.js App Router route files — covered by Playwright E2E
        // (see web/tests/e2e/), not unit tests. Includes page/layout/
        // loading/error boundaries at every route segment.
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/global-error.tsx",
        "src/middleware.ts",

        // App shell / providers — composition wiring, not business logic
        "src/components/layout/**",
        "src/components/providers/**",

        // E2E-only test infrastructure, not app source
        "tests/e2e/**",
      ],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
});
