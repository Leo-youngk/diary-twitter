import { Hono } from 'hono';
import { BLOB_HASH_PATTERN, SYNC_CODE_PATTERN } from '../src/lib/schema';
import type { Env } from './env';

export { DiarySpace } from './space';

const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const app = new Hono<{ Bindings: Env }>();

// Sync: the code is the only credential, so it is checked here before the
// connection reaches its Durable Object (TinyBase does no authentication).
app.get('/api/sync/:code', async (c) => {
  const code = c.req.param('code');
  if (!SYNC_CODE_PATTERN.test(code)) return c.json({ error: 'Invalid sync code' }, 400);
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected a WebSocket upgrade' }, 426);
  }
  const stub = c.env.SPACES.get(c.env.SPACES.idFromName(code));
  await stub.ensureReady(code);
  // The Durable Object routes on the path, so pass it the verified code only.
  const url = new URL(c.req.url);
  url.pathname = `/${code}`;
  return stub.fetch(new Request(url.toString(), c.req.raw));
});

// Images are content-addressed: the hash is checked on upload, so a URL
// always names the same bytes and can be cached forever.
app.get('/api/blob/:code/:hash', async (c) => {
  const { code, hash } = c.req.param();
  if (!SYNC_CODE_PATTERN.test(code) || !BLOB_HASH_PATTERN.test(hash)) return c.body(null, 404);
  const { value, metadata } = await c.env.DATA_KV.getWithMetadata<{ type?: string }>(`blob:${code}:${hash}`, 'arrayBuffer');
  if (!value) return c.body(null, 404);
  return new Response(value, {
    headers: {
      'content-type': metadata?.type ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
});

app.put('/api/blob/:code/:hash', async (c) => {
  const { code, hash } = c.req.param();
  if (!SYNC_CODE_PATTERN.test(code) || !BLOB_HASH_PATTERN.test(hash)) return c.json({ error: 'Invalid path' }, 400);
  const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(type)) return c.json({ error: 'Unsupported type' }, 415);
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BLOB_BYTES) return c.json({ error: 'Invalid size' }, 413);
  const digest = await crypto.subtle.digest('SHA-256', body);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== hash) return c.json({ error: 'Hash mismatch' }, 400);
  await c.env.DATA_KV.put(`blob:${code}:${hash}`, body, { metadata: { type } });
  return c.json({ ok: true });
});

// Anything else under /api belongs to the pre-rebuild app (e.g. POST /api/sync).
// An old tab that is still open gets told to reload instead of writing.
app.all('/api/*', (c) => c.json({ error: '应用已更新，请重新打开' }, 410));

export default app;
