import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "**/*.stories.tsx",
        "**/*.test.tsx",
        "src/test/**",
        "src/types/**",
        "src/lib/supabase/**",
      ],
      thresholds: {
        statements: 80, // Align with Spec 07 (was 75 in ash-ui)
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    reporters: ["default"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
