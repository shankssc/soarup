// apps/web/.storybook/preview.ts
import type { Preview } from '@storybook/nextjs-vite';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../src/components/providers/theme-provider';
import '../src/app/globals.css';

// Fresh QueryClient per story — prevents cache bleed between stories
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // no retries in Storybook
        staleTime: Infinity, // never refetch automatically
      },
    },
  });
}

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0e0e10' },
        { name: 'light', value: '#ebfdfc' },
      ],
    },
    layout: 'centered',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },

  decorators: [
    // Load Material Symbols Outlined font — matches layout.tsx <head> link
    (Story) => {
      if (typeof document !== 'undefined') {
        const id = 'material-symbols-storybook';
        if (!document.getElementById(id)) {
          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          link.href =
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=optional';
          document.head.appendChild(link);
          document.fonts.ready.then(() => {
            document.documentElement.classList.add('fonts-loaded');
          });
        }
      }
      return React.createElement(Story);
    },

    // QueryClientProvider — required by any component that uses useQuery/useMutation
    (Story) => {
      const queryClient = makeQueryClient();
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(Story),
      );
    },

    // ThemeProvider — forced theme from story parameters or background switcher
    (Story, context) => {
      const storyTheme = context.parameters?.theme as 'light' | 'dark' | undefined;
      const bg = context.globals?.backgrounds?.value;
      const bgTheme: 'light' | 'dark' = bg === '#ebfdfc' ? 'light' : 'dark';
      const forcedTheme = storyTheme ?? bgTheme;

      return React.createElement(
        ThemeProvider,
        { forcedTheme },
        React.createElement(Story),
      );
    },
  ],
};

export default preview;
