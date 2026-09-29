import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts: the Cloudflare and PWA plugins are build
// concerns, and the unit tests only exercise plain TypeScript modules.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
  },
});
