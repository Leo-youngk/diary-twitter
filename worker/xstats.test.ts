/// <reference types="node" />
import { createRequire } from 'node:module';
import { createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchChannelTweets } from './buffer';
import { migrateAppTables, setMeta } from './sql';
import { runXStats } from './xstats';

vi.mock('./buffer', async (importOriginal) => ({
  ...await importOriginal<typeof import('./buffer')>(),
  bufferConfigured: () => true,
  fetchOrganizationId: vi.fn().mockResolvedValue('org'),
  fetchChannelHandle: vi.fn().mockResolvedValue('me_on_x'),
  fetchChannelTweets: vi.fn(),
}));

interface Database { prepare(query: string): { all(...bindings: SqlStorageValue[]): Record<string, SqlStorageValue>[] } }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Database };

const now = Date.parse('2026-09-30T08:00:00Z');
const env = { BUFFER_API_KEY: 'k', BUFFER_CHANNEL_ID: 'c' };
let sql: SqlStorage;
let store: ReturnType<typeof createMergeableStore>;
let fxResponses: Record<string, { status: number; body?: unknown }>;

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  sql = { exec: (query: string, ...bindings: SqlStorageValue[]) => {
    const rows = db.prepare(query).all(...bindings);
    return { toArray: () => rows };
  } } as unknown as SqlStorage;
  migrateAppTables(sql);
  store = createMergeableStore();
  vi.mocked(fetchChannelTweets).mockResolvedValue([
    { tweetId: '111', text: '直接在 X 发的', sentAt: '2026-09-30T02:00:00Z' },
    { tweetId: '222', text: '已删除', sentAt: '2026-09-29T02:00:00Z' },
  ]);
  fxResponses = {
    '/me_on_x': { status: 200, body: { user: { followers: 17, following: 256, tweets: 50 } } },
    '/status/111': { status: 200, body: { tweet: { text: '直接在 X 发的', views: 71, likes: 1, replies: 2, retweets: 3, quotes: 4, bookmarks: 5, created_timestamp: 1790733600 } } },
    '/status/222': { status: 404, body: { code: 404 } },
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const response = fxResponses[new URL(url).pathname];
    return new Response(JSON.stringify(response?.body ?? null), { status: response?.status ?? 500 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('X stats', () => {
  it('times out a stalled stats request so the shared alarm can keep delivering posts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const run = runXStats(sql, store, env, now);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await run).toBe(now + 15 * 60_000);
    expect(store.getCell('xaccount', 'me', 'error')).toContain('请求超时');
  });

  it('finds tweets through Buffer and reads their real numbers and the account from FxTwitter', async () => {
    const next = await runXStats(sql, store, env, now);
    expect(store.getRow('xtweets', '111')).toMatchObject({ views: 71, likes: 1, replies: 2, reposts: 3, quotes: 4, bookmarks: 5, gone: false, measuredAt: now });
    expect(store.getRow('xtweets', '222')).toMatchObject({ gone: true });
    expect(store.getRow('xaccount', 'me')).toMatchObject({ handle: 'me_on_x', followers: 17, following: 256, tweets: 50 });
    expect(next).toBeGreaterThan(now);
  });

  it('does not ask again before a tweet is due', async () => {
    await runXStats(sql, store, env, now);
    vi.mocked(fetch).mockClear();
    await runXStats(sql, store, env, now + 60_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(fetchChannelTweets).toHaveBeenCalledTimes(1);
  });

  it('keeps the last numbers and says so when FxTwitter fails', async () => {
    await runXStats(sql, store, env, now);
    fxResponses['/status/111'] = { status: 503 };
    fxResponses['/me_on_x'] = { status: 503 };
    const later = now + 2 * 3600_000;
    expect(await runXStats(sql, store, env, later)).toBe(later + 15 * 60_000);
    expect(store.getCell('xtweets', '111', 'views')).toBe(71);
    expect(String(store.getCell('xaccount', 'me', 'error'))).toContain('HTTP 503');
  });

  it('leaves Buffer alone while it is rate limited', async () => {
    setMeta(sql, 'buffer_retry_at', String(now + 600_000));
    await runXStats(sql, store, env, now);
    expect(fetchChannelTweets).not.toHaveBeenCalled();
  });
});
