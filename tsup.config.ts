import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  dts: false,
  clean: true,
  splitting: false,
  noExternal: [],
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    '@anthropic-ai/sdk',
    'commander',
    '@inquirer/prompts',
    'chalk',
    'ora',
    'boxen',
    'glob',
  ],
});
