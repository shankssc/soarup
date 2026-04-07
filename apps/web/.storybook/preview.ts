// apps/web/.storybook/preview.ts
import type { Preview } from "@storybook/nextjs-vite";
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
    // Global ThemeProvider — every story gets this automatically.
    // Prevents "useTheme must be used inside <ThemeProvider>" errors.
    (Story) => ThemeProvider({ children: Story() }),

    // Sync dark class with background switcher
    (Story, context) => {
      const bg = context.globals?.backgrounds?.value;
      if (bg === "#ebfdfc") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
      return Story();
    },
  ],
};

export default preview;
