// Build and deploy to Cloudflare with the token in .env.local.
//
// Two traps on this machine, both handled here:
// 1. The shell carries a CLOUDFLARE_API_TOKEN for a different Cloudflare
//    account, and wrangler prefers the process environment over any env file.
//    The project token is read here and handed to the child processes;
//    `account_id` in wrangler.toml makes a mismatched token fail loudly.
// 2. Node's fs.cpSync / fs.promises.cp copy nothing into a path with
//    non-ASCII characters, which breaks the OpenNext build in this directory.
//    fs-cp-non-ascii.cjs is preloaded into the build to work around it.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
// NODE_OPTIONS treats backslashes as escapes, so hand it a forward-slash path.
const cpFix = fileURLToPath(new URL('./fs-cp-non-ascii.cjs', import.meta.url)).replaceAll('\\', '/');

function projectToken() {
  let text;
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    throw new Error('找不到 .env.local（需要 CLOUDFLARE_API_TOKEN）');
  }
  const match = text.match(/^CLOUDFLARE_API_TOKEN=(.+)$/m);
  if (!match) throw new Error('.env.local 里没有 CLOUDFLARE_API_TOKEN');
  return match[1].trim();
}

const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: projectToken(),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require "${cpFix}"`.trim(),
};

function run(args) {
  const result = spawnSync('npx', args, { cwd: projectDir, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['opennextjs-cloudflare', 'build']);
run(['opennextjs-cloudflare', 'deploy']);
