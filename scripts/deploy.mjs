// Build and deploy to Cloudflare with the token in .env.local.
//
//   npm run deploy               → diary-app (production)
//   npm run deploy:staging       → diary-app-next (staging, no X / Obsidian)
//
// Three traps on this machine, all handled here:
// 1. The shell carries a CLOUDFLARE_API_TOKEN for a different Cloudflare
//    account, and wrangler prefers the process environment over any env file.
//    The project token is read here and handed to the child processes;
//    `account_id` in wrangler.toml makes a mismatched token fail loudly.
// 2. Node's fs.cpSync / fs.promises.cp copy nothing into a path with
//    non-ASCII characters (this directory). fs-cp-non-ascii.cjs is preloaded.
// 3. Behind this machine's proxy, `wrangler deploy` finishes the deployment
//    and then never exits. Its output is watched instead: once it prints the
//    new version id the deployment is done and the process is stopped.
//
// The environment is chosen at build time (CLOUDFLARE_ENV), as the Cloudflare
// Vite plugin requires; wrangler then deploys the config the build wrote.
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
// NODE_OPTIONS treats backslashes as escapes, so hand it a forward-slash path.
const cpFix = fileURLToPath(new URL('./fs-cp-non-ascii.cjs', import.meta.url)).replaceAll('\\', '/');
const envIndex = process.argv.indexOf('--env');
const target = envIndex > 0 ? process.argv[envIndex + 1] : undefined;
const DEPLOY_TIMEOUT_MS = 5 * 60_000;

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
if (target) env.CLOUDFLARE_ENV = target;
else delete env.CLOUDFLARE_ENV;

const shell = process.platform === 'win32';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectDir, env, stdio: 'inherit', shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function stop(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function deploy() {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'deploy'], { cwd: projectDir, env, shell });
    let output = '';
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop(child);
      if (error) reject(error);
      else resolve(output.match(/Current Version ID: ([0-9a-f-]+)/)[1]);
    };
    const onData = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      // Give wrangler a moment to flush the rest of its report.
      if (/Current Version ID: [0-9a-f-]+/.test(output)) setTimeout(() => finish(), 1500);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (/Current Version ID: [0-9a-f-]+/.test(output)) finish();
      else finish(new Error(`wrangler deploy 退出（${code}），没有看到新版本号`));
    });
    const timer = setTimeout(() => finish(new Error('wrangler deploy 超时，没有看到新版本号')), DEPLOY_TIMEOUT_MS);
  });
}

run('npm', ['run', 'build']);
try {
  const version = await deploy();
  console.log(`\n✓ 已部署 ${target ?? 'production'}，版本 ${version}`);
  process.exit(0);
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}
