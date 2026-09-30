// Build and deploy to Cloudflare (diary-app) with the token in .env.local.
// See cloudflare.mjs for the traps this works around.
import { readdirSync, rmSync } from 'node:fs';
import { run, wrangler } from './cloudflare.mjs';

run('npm', ['run', 'build']);
// The Cloudflare Vite plugin copies the local dev vars into the build output
// as .dev.vars for `vite preview`. wrangler does not upload them, but they
// have no business sitting in dist either.
for (const dir of readdirSync(new URL('../dist', import.meta.url), { withFileTypes: true })) {
  if (dir.isDirectory()) rmSync(new URL(`../dist/${dir.name}/.dev.vars`, import.meta.url), { force: true });
}
try {
  const [, version] = await wrangler(['deploy'], { success: /Current Version ID: ([0-9a-f-]+)/ });
  console.log(`\n✓ 已部署，版本 ${version}`);
  process.exit(0);
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}
