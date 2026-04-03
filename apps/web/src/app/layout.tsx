import type { Metadata } from "next";
import { Space_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Stand-up Buddy",
  description: "Async standups for indie developers and small teams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`
          ${spaceGrotesk.variable}
          ${newsreader.variable}
          font-body
          bg-background
          text-on-surface
          antialiased
          min-h-screen
        `}
      >
        {children}
      </body>
    </html>
  );
}
