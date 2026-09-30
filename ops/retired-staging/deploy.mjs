// Deploy the retired test site from this folder: node ops/retired-staging/deploy.mjs
import { fileURLToPath } from 'node:url';
import { wrangler } from '../../scripts/cloudflare.mjs';

const cwd = fileURLToPath(new URL('.', import.meta.url));
try {
  const [, version] = await wrangler(['deploy', '--config', 'wrangler.toml'], { cwd, success: /Current Version ID: ([0-9a-f-]+)/ });
  console.log(`\n✓ 测试站已替换为停用页，版本 ${version}`);
  process.exit(0);
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}
