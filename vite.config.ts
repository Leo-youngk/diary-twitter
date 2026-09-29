import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Runs worker/index.ts (and its Durable Object) inside workerd in dev, and
    // builds it next to the client for `wrangler deploy`.
    cloudflare(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // The manifest is a static file in public/, and registration is done by
      // src/lib/swUpdate.ts so updates can wait for a safe moment.
      manifest: false,
      injectRegister: false,
      injectManifest: {
        // App shell only. Fonts and images are cached at runtime when used.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json}'],
        globIgnores: ['**/node_modules/**'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Matches .claude/launch.json.
  server: { port: 3000 },
});
