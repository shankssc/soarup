import type { Metadata } from "next";
import type { Viewport } from "next";
import { Space_Grotesk, Newsreader } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

// ─── Fonts ────────────────────────────────────────────────────────────────────

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "SoarUp",
  description: "Async standups for indie developers and small teams.",
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: { url: "/apple-touch-180.png" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          FOUC prevention — runs synchronously before paint.
          Reads localStorage and applies dark class before React hydrates.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('soarup-theme');
                  if (stored === 'dark' || stored === 'light') {
                    if (stored === 'dark') document.documentElement.classList.add('dark');
                  } else {
                    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    if (systemDark) document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`
          ${spaceGrotesk.variable}
          ${newsreader.variable}
          font-body
          bg-background dark:bg-[#0e0e10]
          text-on-surface dark:text-on-surface-dark
          antialiased
          min-h-screen
        `}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
