// Push the Worker's secrets from .env.secrets.local (git-ignored) to diary-app.
//
//   SPACE_ID           the one data space (Durable Object name, KV prefix)
//   APP_PASSPHRASE     typed once on each new device
//   SESSION_SECRET     signs device tokens; changing it signs every device out
//   BUFFER_API_KEY     publishing to X
//   OBSIDIAN_SYNC_SECRET  delivering to Obsidian (only if present in the file)
//
// Values go to wrangler through stdin, never through the command line.
import { readEnvFile, wrangler } from './cloudflare.mjs';

const KEYS = ['SPACE_ID', 'APP_PASSPHRASE', 'SESSION_SECRET', 'BUFFER_API_KEY', 'OBSIDIAN_SYNC_SECRET'];
const REQUIRED = ['SPACE_ID', 'APP_PASSPHRASE', 'SESSION_SECRET', 'BUFFER_API_KEY'];

const file = readEnvFile('.env.secrets.local');
const missing = REQUIRED.filter((key) => !file[key]);
if (missing.length) {
  console.error(`✗ .env.secrets.local 缺少 ${missing.join('、')}`);
  process.exit(1);
}
const secrets = Object.fromEntries(KEYS.filter((key) => file[key]).map((key) => [key, file[key]]));
try {
  await wrangler(['secret', 'bulk'], { input: JSON.stringify(secrets), success: /successfully uploaded|Finished processing secrets/i });
  console.log(`\n✓ 已更新 ${Object.keys(secrets).join('、')}`);
  process.exit(0);
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}
