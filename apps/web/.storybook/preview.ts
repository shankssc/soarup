// apps/web/.storybook/preview.ts
import type { Preview } from "@storybook/nextjs-vite";
import React from "react";
import { ThemeProvider } from "../src/components/providers/theme-provider";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark",  value: "#0e0e10" },
        { name: "light", value: "#ebfdfc" },
      ],
    },
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date:  /Date$/i,
      },
    },
    a11y: {
      test: "todo",
    },
  },

  decorators: [
    // Wraps every story in ThemeProvider with the correct forced theme.
    // forcedTheme prevents ThemeProvider's useEffect from reading
    // localStorage or system preference and overriding the story's theme.
    (Story, context) => {
      // Story-level parameters.theme takes priority
      const storyTheme = context.parameters?.theme as "light" | "dark" | undefined;

      // Fall back to background switcher value
      const bg = context.globals?.backgrounds?.value;
      const bgTheme: "light" | "dark" = bg === "#ebfdfc" ? "light" : "dark";

      const forcedTheme = storyTheme ?? bgTheme;

      return React.createElement(
        ThemeProvider,
        { forcedTheme },
        React.createElement(Story)
      );
    },
  ],
};

export default preview;
