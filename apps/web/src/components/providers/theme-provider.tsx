"use client";

// apps/web/src/components/providers/theme-provider.tsx

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

interface ThemeProviderProps {
  children?: React.ReactNode;
  /**
   * When provided, bypasses localStorage and system preference entirely.
   * Used by Storybook to force a specific theme per story without
   * ThemeProvider's useEffect overriding the decorator's class toggle.
   */
  forcedTheme?: Theme;
}

export function ThemeProvider({ children, forcedTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(forcedTheme ?? "dark");
  const [mounted, setMounted] = React.useState(false);

  // On mount: if forcedTheme is set, use it directly.
  // Otherwise read localStorage, fall back to system preference.
    React.useEffect(() => {
    if (forcedTheme) {
      setThemeState(forcedTheme);
      setMounted(true);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    } else {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setThemeState(systemDark ? "dark" : "light");
    }
    setMounted(true);
  }, [forcedTheme]);

  // Apply theme class to <html> whenever theme changes
  // When forcedTheme is active, still apply the class — the html element
  // needs the class for Tailwind dark: variants to work.
  React.useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Only persist to localStorage if not forced — forced theme is
    // Storybook-only and should never pollute the user's stored preference.
    if (!forcedTheme) {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme, mounted, forcedTheme]);

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

export function useTheme(): ThemeContextValue | null {
  return React.useContext(ThemeContext);
}
