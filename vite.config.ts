import { execSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

function buildId(): string {
  let commit = 'dev';
  try { commit = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* not a git checkout */ }
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${commit} · ${time}`;
}

export default defineConfig({
  // Shown in 设置, so it is always clear which version a device is running.
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
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
