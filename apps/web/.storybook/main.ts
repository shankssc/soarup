import type { StorybookConfig } from '@storybook/nextjs-vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],

  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],

  framework: '@storybook/nextjs-vite',

  staticDirs: ['..\\public'],

  viteFinal: async (config) => {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@': path.resolve(__dirname, '../src'),
      };
    }
    return config;
  },
};

export default config;
