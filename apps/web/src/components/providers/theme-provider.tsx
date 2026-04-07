"use client";

"apps/web/src/components/providers/theme-provider.tsx"

import * as React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "soarup-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [mounted, setMounted] = React.useState(false);

  // On mount: read localStorage first, fall back to system preference
  // This runs client-side only — avoids SSR mismatch
  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;

    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    } else {
      // No stored preference — use system
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setThemeState(systemDark ? "dark" : "light");
    }

    setMounted(true);
  }, []);

  // Apply theme class to <html> whenever theme changes
  React.useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  function setTheme(next: Theme) {
    setThemeState(next);
  }

  function toggleTheme() {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }

  // Prevent rendering children until theme is resolved to avoid flash
  // We render with opacity-0 briefly rather than null to avoid layout shift
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      <div
        style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.15s ease" }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
