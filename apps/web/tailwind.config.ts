import type { Config } from "tailwindcss";

// Electric Atelier — Design System Tokens
// Generated from Google Stitch output, reconciled for Next.js + shadcn/ui compatibility
// Color naming follows Material Design 3 conventions from Stitch

const config: Config = {
  // Dark mode driven by class on <html> — toggled by ThemeProvider
  darkMode: "class",

  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./stories/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  theme: {
    // Override borderRadius globally — Electric Atelier uses sharp 0px radii by default.
    // The only exception is `full` (pills/avatars) and `quirky` (feature cards).
    // Do NOT use Tailwind's default rounded-* classes — they will produce soft radii
    // inconsistent with the design system.
    borderRadius: {
      none: "0px",
      DEFAULT: "0px",
      sm: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "9999px",   // avatars, pills, voice record button
      card: "4px",      // subtle radius for large feature cards only — use sparingly
    },

    extend: {
      colors: {
        // ─── Surface scale (dark) ───────────────────────────────────────────────
        // Use these for backgrounds, containers, borders in dark mode.
        // Maps: surface-container-lowest → surface-container-highest (darkest → lightest dark surface)
        surface: {
          DEFAULT:     "#0e0e10",   // page background
          dim:         "#0e0e10",   // same as DEFAULT — use for recessed areas
          bright:      "#2c2c2f",   // elevated surfaces (popovers, tooltips)
          lowest:      "#000000",   // deepest wells (code blocks, input backgrounds)
          low:         "#131315",
          DEFAULT_:    "#19191c",   // alias — use `surface-container` in JSX
          high:        "#1f1f22",
          highest:     "#262528",   // borders, avatars, selected states
          variant:     "#262528",   // same as highest — used by MD3 for surface variants
          tint:        "#53ddfc",   // primary-tinted surface (use rarely)
        },

        // ─── Semantic surface aliases ────────────────────────────────────────
        // Use these in JSX: bg-container, bg-container-low, etc.
        // These exist so you don't need to remember the full surface-* chain.
        container: {
          DEFAULT: "#19191c",
          low:     "#131315",
          high:    "#1f1f22",
          highest: "#262528",
          lowest:  "#000000",
        },

        // ─── Primary — Electric Cyan ─────────────────────────────────────────
        // The dominant accent. Used for: CTAs, active states, focus rings, icons.
        primary: {
          DEFAULT:    "#53ddfc",   // use on dark backgrounds
          dim:        "#40ceed",   // slightly muted — hover states
          fixed:      "#53ddfc",   // MD3 fixed variant (always light bg)
          "fixed-dim":"#40ceed",
          container:  "#21bedc",   // filled surfaces (chips, badges)
          on:         "#004b58",   // text ON primary bg
          "on-fixed":         "#003640",
          "on-fixed-variant": "#005564",
          "on-container":     "#00343e",
          inverse:    "#00687b",   // primary on light bg
        },

        // ─── Secondary — Digital Magenta ────────────────────────────────────
        // Highlight accent. Used for: AI summary accents, active nav, hover states.
        secondary: {
          DEFAULT:    "#ec63ff",
          dim:        "#ec63ff",
          fixed:      "#fdbcff",
          "fixed-dim":"#faa6ff",
          container:  "#a200ba",
          on:         "#3d0047",
          "on-fixed":          "#5e006c",
          "on-fixed-variant":  "#8c00a0",
          "on-container":      "#fff5fa",
        },

        // ─── Tertiary — Electric Lime ────────────────────────────────────────
        // Used sparingly for: status badges, active/online indicators.
        tertiary: {
          DEFAULT:    "#e7ffc4",
          dim:        "#a4ef3f",
          fixed:      "#b1fe4d",
          "fixed-dim":"#a4ef3f",
          container:  "#b1fe4d",
          on:         "#406800",
          "on-fixed":          "#2d4b00",
          "on-fixed-variant":  "#416a00",
          "on-container":      "#3a5f00",
        },

        // ─── On-surface text scale ───────────────────────────────────────────
        // Use these for ALL text — never use raw gray-* classes for text.
        "on-surface":          "#f9f5f8",   // primary text
        "on-surface-variant":  "#adaaad",   // secondary/muted text
        "on-background":       "#f9f5f8",

        // ─── Borders / outlines ──────────────────────────────────────────────
        outline:          "#767577",   // visible borders
        "outline-variant": "#48474a",  // subtle borders (cards, dividers)

        // ─── Background ──────────────────────────────────────────────────────
        background: "#0e0e10",

        // ─── Inverse (light mode) ────────────────────────────────────────────
        "inverse-surface":    "#fcf8fb",
        "inverse-on-surface": "#565457",
        "inverse-primary":    "#00687b",

        // ─── Error ───────────────────────────────────────────────────────────
        error: {
          DEFAULT:   "#ff716c",
          dim:       "#d7383b",
          container: "#9f0519",
          on:        "#490006",
          "on-container": "#ffa8a3",
        },
      },

      fontFamily: {
        // Newsreader — editorial headings, update quotes, digest summaries
        // Usage: font-headline, italic, sizes text-3xl and above
        headline: ["Newsreader", "Georgia", "serif"],

        // Space Grotesk — all UI chrome: labels, buttons, nav, metadata
        // Usage: font-body (default), font-label (uppercase tracking)
        body:  ["Space Grotesk", "system-ui", "sans-serif"],
        label: ["Space Grotesk", "system-ui", "sans-serif"],

        // Keep `sans` mapped for Tailwind internals + any shadcn/ui components
        // that rely on font-sans. Points to Space Grotesk via CSS variable.
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },

      // ─── Box shadows ───────────────────────────────────────────────────────
      // Named electric glow — replaces arbitrary shadow-[...] values in JSX.
      // Usage: shadow-electric on primary buttons, shadow-electric-sm on focus rings.
      boxShadow: {
        "electric":    "0 0 15px rgba(83, 221, 252, 0.35)",
        "electric-sm": "0 0 8px rgba(83, 221, 252, 0.25)",
        "electric-lg": "0 0 30px rgba(83, 221, 252, 0.25)",
        "magenta":     "0 0 15px rgba(236, 99, 255, 0.35)",
      },

      // ─── Typography scale ──────────────────────────────────────────────────
      // Custom tracking for the uppercase label pattern used throughout.
      letterSpacing: {
        "atelier": "0.2em",    // standard label tracking
        "widest+": "0.3em",    // extra-wide section markers
      },

      // ─── Animation ────────────────────────────────────────────────────────
      // pulse-slow: used for the recording indicator dot in VoiceRecorder.
      animation: {
        "pulse-slow": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },

  plugins: [
    // @tailwindcss/forms — resets browser form styles so our custom inputs
    // (border-bottom only, no box) render consistently cross-browser.
    require("@tailwindcss/forms")({ strategy: "class" }),
  ],
};

export default config;
