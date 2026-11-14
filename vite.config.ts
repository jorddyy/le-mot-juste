import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch { /* not a git checkout */ }

export default defineConfig({
  base: './',
  plugins: [preact()],
  define: { __BUILD__: JSON.stringify({ version: pkg.version, commit, time: new Date().toISOString() }) },
  test: { include: ['src/**/*.test.ts'] },
});
