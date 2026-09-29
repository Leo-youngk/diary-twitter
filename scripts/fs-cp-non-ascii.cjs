// Preloaded into the build by scripts/deploy.mjs.
//
// Node 24's fs.cpSync / fs.promises.cp copy nothing when a path contains
// non-ASCII characters (this project lives in E:\复刻推特), and the OpenNext
// build depends on both. For such paths, fall back to a plain recursive copy
// built on copyFileSync, which is unaffected. ASCII paths keep Node's own copy.
const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const NON_ASCII = /[^\x00-\x7F]/;
const toPath = (p) => (p instanceof URL ? fileURLToPath(p) : String(p));
const needsFallback = (src, dest) => NON_ASCII.test(toPath(src)) || NON_ASCII.test(toPath(dest));

function eisdir(src) {
  const error = new Error(`Recursive option is required to copy a directory: ${src}`);
  error.code = 'ERR_FS_EISDIR';
  return error;
}

function copyEntry(src, dest, opts, isRoot) {
  const stat = opts.dereference ? fs.statSync(src) : fs.lstatSync(src);
  if (stat.isDirectory()) {
    if (!opts.recursive && isRoot) throw eisdir(src);
    fs.mkdirSync(dest, { recursive: true });
    return fs.readdirSync(src).map((name) => [path.join(src, name), path.join(dest, name)]);
  }
  if (fs.existsSync(dest)) {
    if (opts.errorOnExist && opts.force === false) {
      const error = new Error(`Target already exists: ${dest}`);
      error.code = 'ERR_FS_CP_EEXIST';
      throw error;
    }
    if (opts.force === false) return [];
    fs.rmSync(dest, { force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (stat.isSymbolicLink()) {
    try {
      fs.symlinkSync(fs.readlinkSync(src), dest);
    } catch {
      fs.copyFileSync(fs.realpathSync(src), dest);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
  return [];
}

function copySync(src, dest, opts) {
  const queue = [[src, dest, true]];
  while (queue.length > 0) {
    const [from, to, isRoot] = queue.shift();
    if (opts.filter && !opts.filter(from, to)) continue;
    for (const [s, d] of copyEntry(from, to, opts, isRoot)) queue.push([s, d, false]);
  }
}

async function copyAsync(src, dest, opts) {
  const queue = [[src, dest, true]];
  while (queue.length > 0) {
    const [from, to, isRoot] = queue.shift();
    if (opts.filter && !(await opts.filter(from, to))) continue;
    for (const [s, d] of copyEntry(from, to, opts, isRoot)) queue.push([s, d, false]);
  }
}

const originalCpSync = fs.cpSync;
fs.cpSync = function cpSync(src, dest, opts = {}) {
  if (!needsFallback(src, dest)) return originalCpSync.call(fs, src, dest, opts);
  copySync(toPath(src), toPath(dest), opts);
};

const originalCp = fs.promises.cp;
fs.promises.cp = async function cp(src, dest, opts = {}) {
  if (!needsFallback(src, dest)) return originalCp.call(fs.promises, src, dest, opts);
  await copyAsync(toPath(src), toPath(dest), opts);
};

const originalCallbackCp = fs.cp;
fs.cp = function cp(src, dest, opts, callback) {
  const cb = typeof opts === 'function' ? opts : callback;
  const options = typeof opts === 'function' ? {} : (opts ?? {});
  if (!needsFallback(src, dest)) return originalCallbackCp.call(fs, src, dest, options, cb);
  copyAsync(toPath(src), toPath(dest), options).then(() => cb(null), (error) => cb(error));
};
