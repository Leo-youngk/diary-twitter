// Runs wrangler with this project's Cloudflare token (from .env.local).
//
// Three traps on this machine, all handled here:
// 1. The shell carries a CLOUDFLARE_API_TOKEN for a different Cloudflare
//    account, and wrangler prefers the process environment over any env file.
//    The project token is read here and handed to the child processes;
//    `account_id` in wrangler.toml makes a mismatched token fail loudly.
// 2. Node's fs.cpSync / fs.promises.cp copy nothing into a path with
//    non-ASCII characters (this directory). fs-cp-non-ascii.cjs is preloaded.
// 3. Behind this machine's proxy, wrangler finishes its work and then never
//    exits. Its output is watched instead, and the process is stopped once
//    the success line has been printed.
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectDir = fileURLToPath(new URL('..', import.meta.url));
// NODE_OPTIONS treats backslashes as escapes, so hand it a forward-slash path.
const cpFix = fileURLToPath(new URL('./fs-cp-non-ascii.cjs', import.meta.url)).replaceAll('\\', '/');
const TIMEOUT_MS = 5 * 60_000;

/** KEY=value lines of a git-ignored env file in the project root. */
export function readEnvFile(name) {
  let text;
  try {
    text = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  } catch {
    throw new Error(`找不到 ${name}`);
  }
  const values = {};
  for (const match of text.matchAll(/^([A-Z0-9_]+)=(.*)$/gm)) values[match[1]] = match[2].trim();
  return values;
}

const token = readEnvFile('.env.local').CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('.env.local 里没有 CLOUDFLARE_API_TOKEN');

export const env = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: token,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require "${cpFix}"`.trim(),
};
delete env.CLOUDFLARE_ENV;

const shell = process.platform === 'win32';

export function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectDir, env, stdio: 'inherit', shell });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function stop(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

/**
 * Run `wrangler <args>` and resolve with the first match of `success` in its
 * output. `input` is written to its stdin (never to the command line).
 */
export function wrangler(args, { success, input, cwd = projectDir }) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], { cwd, env, shell });
    let output = '';
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop(child);
      if (error) reject(error);
      else resolve(output.match(success));
    };
    const onData = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
      // Give wrangler a moment to flush the rest of its report.
      if (success.test(output)) setTimeout(() => finish(), 1500);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (success.test(output)) finish();
      else finish(new Error(`wrangler ${args[0]} 退出（${code}），没有看到成功信息`));
    });
    const timer = setTimeout(() => finish(new Error(`wrangler ${args[0]} 超时`)), TIMEOUT_MS);
    if (input !== undefined) child.stdin.end(input);
  });
}
