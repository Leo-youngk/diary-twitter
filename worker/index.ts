import { Hono, type Context } from 'hono';
import { BLOB_HASH_PATTERN } from '../src/lib/schema';
import { bearer, issueToken, passphraseMatches, verifyToken } from './auth';
import type { SyncRecord } from '../src/lib/sync';
import type { Env } from './env';

export { DiarySpace } from './space';
export { D1Diary } from './d1-space';

const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type AppContext = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

/** The deployment's one space, or null when the Worker is missing its secrets. */
function config(env: Env): { space: string; secret: string; passphrase: string } | null {
  if (!env.SPACE_ID || !env.SESSION_SECRET || !env.APP_PASSPHRASE) {
    console.error('[auth] SPACE_ID, SESSION_SECRET and APP_PASSPHRASE must all be set');
    return null;
  }
  return { space: env.SPACE_ID, secret: env.SESSION_SECRET, passphrase: env.APP_PASSPHRASE };
}

const notConfigured = (c: AppContext) => c.json({ error: '服务器还没有配置好口令' }, 503);

// A new device types the passphrase once and keeps the token it gets back.
app.post('/api/session', async (c) => {
  const settings = config(c.env);
  if (!settings) return notConfigured(c);
  const body = await c.req.json<{ passphrase?: unknown }>().catch(() => ({ passphrase: undefined }));
  const given = typeof body.passphrase === 'string' ? body.passphrase : '';
  if (!given) return c.json({ error: '口令不对' }, 401);
  const stub = c.env.DIARY.get(c.env.DIARY.idFromName(settings.space));
  const outcome = await stub.signIn(c.req.header('cf-connecting-ip') ?? 'unknown', await passphraseMatches(settings.passphrase, given));
  if (outcome.result === 'locked') {
    const minutes = Math.ceil(outcome.retryAfterMs / 60_000);
    return c.json({ error: `尝试次数太多，${minutes} 分钟后再试`, retryAfterMinutes: minutes }, 429, { 'retry-after': String(Math.ceil(outcome.retryAfterMs / 1000)) });
  }
  if (outcome.result === 'wrong') return c.json({ error: '口令不对' }, 401);
  return c.json({ token: await issueToken(settings.secret) });
});

// Checked before every sync connection: a WebSocket cannot report why it was refused.
app.get('/api/session', async (c) => {
  const settings = config(c.env);
  if (!settings) return notConfigured(c);
  return await verifyToken(settings.secret, bearer(c.req.header('authorization')))
    ? c.body(null, 204)
    : c.json({ error: '需要重新输入口令' }, 401);
});

app.post('/api/sync', async (c) => {
  const settings = config(c.env);
  if (!settings) return notConfigured(c);
  const deviceId = await verifyToken(settings.secret, bearer(c.req.header('authorization')));
  if (!deviceId) return c.json({ error: '需要重新输入口令' }, 401);

  const text = await c.req.text();
  if (text.length > 2_000_000) return c.json({ error: '本次同步内容过多' }, 413);
  const body = JSON.parse(text) as { records: SyncRecord[]; cursor: number; name?: string; build?: string };
  if (!Array.isArray(body.records)) return c.json({ error: '无效同步请求' }, 400);
  const stub = c.env.DIARY.get(c.env.DIARY.idFromName(settings.space));
  return c.json(await stub.sync(body.records, body.cursor, {
    id: deviceId,
    name: String(body.name ?? '').slice(0, 60),
    build: String(body.build ?? '').slice(0, 60),
  }), 200, { 'cache-control': 'no-store' });
});

// Images are content-addressed: a URL names exactly one image, and only
// someone who can read the posts knows it. Uploads need a device token.
app.get('/api/blob/:hash', async (c) => {
  const settings = config(c.env);
  if (!settings) return notConfigured(c);
  const { hash } = c.req.param();
  if (!BLOB_HASH_PATTERN.test(hash)) return c.body(null, 404);
  const { value, metadata } = await c.env.DATA_KV.getWithMetadata<{ type?: string }>(`blob:${settings.space}:${hash}`, 'arrayBuffer');
  if (!value) return c.body(null, 404);
  return new Response(value, {
    headers: {
      'content-type': metadata?.type ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
});

app.put('/api/blob/:hash', async (c) => {
  const settings = config(c.env);
  if (!settings) return notConfigured(c);
  if (!await verifyToken(settings.secret, bearer(c.req.header('authorization')))) return c.json({ error: '需要重新输入口令' }, 401);
  const { hash } = c.req.param();
  if (!BLOB_HASH_PATTERN.test(hash)) return c.json({ error: 'Invalid path' }, 400);
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return c.json({ error: 'Unsupported type' }, 415);
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BLOB_BYTES) return c.json({ error: 'Invalid size' }, 413);
  const digest = await crypto.subtle.digest('SHA-256', body);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== hash) return c.json({ error: 'Hash mismatch' }, 400);
  await c.env.DATA_KV.put(`blob:${settings.space}:${hash}`, body, { metadata: { type } });
  return c.json({ ok: true });
});

// Anything else under /api belongs to an older version of the app (e.g. the
// sync-code routes). A tab that is still open gets told to reload.
app.all('/api/*', (c) => c.json({ error: '应用已更新，请重新打开' }, 410));

app.onError((error, c) => {
  console.error('[api] request failed', String(error));
  return c.json({ error: '服务器暂时不可用，本机保存的内容会稍后同步' }, 503);
});

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (env.SPACE_ID) ctx.waitUntil(env.DIARY.get(env.DIARY.idFromName(env.SPACE_ID)).tasks());
  },
};
