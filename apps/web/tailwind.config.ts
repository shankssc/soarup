import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: "class",

  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/stories/**/*.{js,ts,jsx,tsx,mdx}",
    "./.storybook/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    borderRadius: {
      none:    "0px",
      DEFAULT: "0px",
      sm:      "0px",
      md:      "0px",
      lg:      "0px",
      xl:      "0px",
      "2xl":   "0px",
      "3xl":   "0px",
      full:    "9999px",
      card:    "4px",
    },

    extend: {
      colors: {
        // ── Surfaces ───────────────────────────────────────────────────────
        // All colors point to CSS variables defined in globals.css.
        // The variable value switches automatically when .dark is on <html>.
        // You never need dark: prefix for these tokens — they just work.
        background:          "var(--color-background)",
        surface:             "var(--color-surface)",
        "surface-dim":       "var(--color-surface-dim)",
        "surface-bright":    "var(--color-surface-bright)",
        "surface-lowest":    "var(--color-surface-lowest)",
        "surface-low":       "var(--color-surface-low)",
        "surface-high":      "var(--color-surface-high)",
        "surface-highest":   "var(--color-surface-highest)",

        // ── Containers ─────────────────────────────────────────────────────
        container:           "var(--color-container)",
        "container-low":     "var(--color-container-low)",
        "container-high":    "var(--color-container-high)",
        "container-highest": "var(--color-container-highest)",
        "container-lowest":  "var(--color-container-lowest)",

        // ── Text ───────────────────────────────────────────────────────────
        "on-surface":         "var(--color-on-surface)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        "on-background":      "var(--color-on-background)",

        // ── Primary ────────────────────────────────────────────────────────
        primary: {
          DEFAULT:    "var(--color-primary)",
          dim:        "var(--color-primary-dim)",
          container:  "var(--color-primary-container)",
          on:         "var(--color-on-primary)",
          "on-container": "var(--color-on-primary-container)",
          inverse:    "var(--color-primary-inverse)",
        },

        // ── Secondary ──────────────────────────────────────────────────────
        secondary: {
          DEFAULT:    "var(--color-secondary)",
          container:  "var(--color-secondary-container)",
          on:         "var(--color-on-secondary)",
          "on-container": "var(--color-on-secondary-container)",
        },

        // ── Tertiary ───────────────────────────────────────────────────────
        tertiary: {
          DEFAULT:    "var(--color-tertiary)",
          container:  "var(--color-tertiary-container)",
          on:         "var(--color-on-tertiary)",
          "on-container": "var(--color-on-tertiary-container)",
        },

        // ── Borders ────────────────────────────────────────────────────────
        outline:           "var(--color-outline)",
        "outline-variant": "var(--color-outline-variant)",

        // ── Error ──────────────────────────────────────────────────────────
        error: {
          DEFAULT:    "var(--color-error)",
          container:  "var(--color-error-container)",
          on:         "var(--color-on-error)",
          "on-container": "var(--color-on-error-container)",
        },

        // ── Inverse ────────────────────────────────────────────────────────
        "inverse-surface":    "var(--color-inverse-surface)",
        "inverse-on-surface": "var(--color-inverse-on-surface)",
        "inverse-primary":    "var(--color-inverse-primary)",
      },

      fontFamily: {
        headline: ["Newsreader", "Georgia", "serif"],
        body:     ["Space Grotesk", "system-ui", "sans-serif"],
        label:    ["Space Grotesk", "system-ui", "sans-serif"],
        sans:     ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },

      boxShadow: {
        "electric":    "0 0 15px rgba(83, 221, 252, 0.35)",
        "electric-sm": "0 0 8px rgba(83, 221, 252, 0.25)",
        "electric-lg": "0 0 30px rgba(83, 221, 252, 0.25)",
        "magenta":     "0 0 15px rgba(236, 99, 255, 0.35)",
      },

      letterSpacing: {
        "atelier": "0.2em",
        "widest+": "0.3em",
      },

      animation: {
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },

  plugins: [
    forms({ strategy: "class" }),
  ],
};

export default config;
