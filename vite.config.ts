import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch { /* not a git checkout */ }

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    // Offline: precache the app, the word list and the Latin fonts (the other font subsets are never needed).
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,            // public/manifest.webmanifest is the manifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}', 'assets/*-latin-wght-*.woff2'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: { __BUILD__: JSON.stringify({ version: pkg.version, commit, time: new Date().toISOString() }) },
  test: { include: ['src/**/*.test.ts'] },
});
