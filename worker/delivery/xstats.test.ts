/// <reference types="node" />
import { createRequire } from 'node:module';
import { createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchChannelHandle } from '../buffer';
import { getMeta, setMeta } from '../d1';
import { runXStats } from './xstats';

vi.mock('../buffer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../buffer')>(),
  bufferConfigured: () => true,
  fetchOrganizationId: vi.fn().mockResolvedValue('org'),
  fetchChannelHandle: vi.fn().mockResolvedValue('me_on_x'),
}));

interface Database { prepare(query: string): { all(...bindings: SqlStorageValue[]): Record<string, SqlStorageValue>[] } }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Database };

const HOUR = 3600_000;
const now = Date.parse('2026-09-30T08:00:00Z');
const env = { BUFFER_API_KEY: 'k', BUFFER_CHANNEL_ID: 'c' };
const ME = { screen_name: 'Me_On_X' };
const FRIEND = { screen_name: 'friend' };

const status = (id: string, time: string, extra: Record<string, unknown> = {}) => ({
  id, text: `推文 ${id}`, created_timestamp: Date.parse(time) / 1000, author: ME, replying_to: null, reposted_by: null,
  views: 10, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, ...extra,
});
const replyTo = (screenName: string, id: string) => ({ replying_to: { screen_name: screenName, status: id } });
const page = (results: unknown[], bottom: string) => ({ status: 200, body: { code: 200, results, cursor: { top: null, bottom } } });

// The newest page of the timeline with replies, as X orders it.
const LATEST = [
  status('106', '2026-09-30T06:00:00Z', { text: '直接在 X 发的', views: 71, likes: 1, replies: 2, reposts: 3, quotes: 4, bookmarks: 5 }),
  status('901', '2026-09-30T05:00:00Z', { author: FRIEND, reposted_by: { id: '1', name: 'me', screen_name: 'me_on_x' } }),
  status('104', '2026-09-30T04:00:00Z', replyTo('me_on_x', '103')),
  status('103', '2026-09-30T03:00:00Z', replyTo('friend', '900')),
  status('900', '2026-09-30T00:30:00Z', { author: FRIEND }),
  status('102', '2026-09-30T02:00:00Z', replyTo('Me_On_X', '101')),
  status('101', '2026-09-30T01:00:00Z'),
];

let sql: D1Database;
let store: ReturnType<typeof createMergeableStore>;
let routes: Record<string, { status: number; body?: unknown }>;
const requested = () => vi.mocked(fetch).mock.calls.map(([url]) => String(url));
const kinds = () => Object.fromEntries(Object.entries(store.getTable('xtweets')).map(([id, row]) => [id, row.kind]));

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  db.prepare('CREATE TABLE diary3_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').all();
  sql = {
    prepare: (query: string) => {
      let bindings: SqlStorageValue[] = [];
      const statement = {
        bind: (...values: SqlStorageValue[]) => { bindings = values; return statement; },
        all: async () => ({ results: db.prepare(query).all(...bindings), success: true }),
        run: async () => ({ results: db.prepare(query).all(...bindings), success: true }),
        first: async (column: string) => db.prepare(query).all(...bindings)[0]?.[column] ?? null,
      };
      return statement;
    },
  } as unknown as D1Database;
  store = createMergeableStore();
  routes = {
    '/me_on_x': { status: 200, body: { code: 200, user: { followers: 17, following: 256, tweets: 50 } } },
    '/2/profile/me_on_x/statuses': page(LATEST, 'c1'),
    '/2/profile/me_on_x/statuses?c1': page([status('050', '2026-09-01T00:00:00Z')], 'c2'),
    '/2/profile/me_on_x/statuses?c2': page([], 'c3'),
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const { pathname, searchParams } = new URL(url);
    const cursor = searchParams.get('cursor');
    const response = routes[cursor ? `${pathname}?${cursor}` : pathname];
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

  it("reads the account's own tweets and replies, with their numbers, from its timeline", async () => {
    const next = await runXStats(sql, store, env, now);
    expect(requested()).toContain('https://api.fxtwitter.com/2/profile/me_on_x/statuses?count=100&with_replies=1');
    // Others' tweets being replied to, and reposts, are not the account's.
    expect(kinds()).toEqual({ '050': 'post', 101: 'post', 102: 'post', 103: 'reply', 104: 'reply', 106: 'post' });
    expect(store.getRow('xtweets', '106')).toMatchObject({
      text: '直接在 X 发的', createdAt: '2026-09-30T06:00:00.000Z',
      views: 71, likes: 1, replies: 2, reposts: 3, quotes: 4, bookmarks: 5, gone: false, measuredAt: now,
    });
    expect(store.getRow('xaccount', 'me')).toMatchObject({ handle: 'me_on_x', followers: 17, following: 256, tweets: 50 });
    expect(next).toBeGreaterThan(now);
  });

  it('between full reads only looks for new tweets, and changes nothing when there are none', async () => {
    await runXStats(sql, store, env, now);
    const before = JSON.stringify(store.getTables());
    vi.mocked(fetch).mockClear();
    expect(await runXStats(sql, store, env, now + 60_000)).toBe(now + 120_000);
    expect(requested()).toEqual(['https://api.fxtwitter.com/2/profile/me_on_x/statuses?count=20&with_replies=1']);
    expect(JSON.stringify(store.getTables())).toBe(before);
    expect(fetchChannelHandle).toHaveBeenCalledTimes(1);
  });

  it('adds a tweet posted on X within a minute without rewriting the others', async () => {
    await runXStats(sql, store, env, now);
    routes['/2/profile/me_on_x/statuses'] = page([status('107', '2026-09-30T08:00:30Z', { text: '刚在 X 上发的' }), ...LATEST], 'c1');
    await runXStats(sql, store, env, now + 60_000);
    expect(store.getRow('xtweets', '107')).toMatchObject({ text: '刚在 X 上发的', kind: 'post', measuredAt: now + 60_000 });
    expect(store.getCell('xtweets', '106', 'measuredAt')).toBe(now);
  });

  it('reads the history once and walks it again a day later', async () => {
    await runXStats(sql, store, env, now);
    expect((await getMeta(sql, 'x_walked_at'))).toBe(String(now));
    vi.mocked(fetch).mockClear();
    await runXStats(sql, store, env, now + 2 * HOUR);
    expect(requested().filter((url) => url.includes('cursor='))).toEqual([]);
    await runXStats(sql, store, env, now + 25 * HOUR);
    expect(requested().filter((url) => url.includes('cursor='))).toHaveLength(2);
    expect(store.getCell('xtweets', '050', 'measuredAt')).toBe(now + 25 * HOUR);
  });

  it('starts a walk again from the top when a page of it fails', async () => {
    routes['/2/profile/me_on_x/statuses?c1'] = { status: 500 };
    expect(await runXStats(sql, store, env, now)).toBe(now + 15 * 60_000);
    expect(store.hasRow('xtweets', '050')).toBe(false);
    routes['/2/profile/me_on_x/statuses?c1'] = page([status('050', '2026-09-01T00:00:00Z')], 'c2');
    await runXStats(sql, store, env, now + HOUR);
    expect(store.hasRow('xtweets', '050')).toBe(true);
    expect(store.getCell('xaccount', 'me', 'error')).toBe('');
  });

  it('counts a tweet the app sent at once and reads its numbers', async () => {
    store.setRow('posts', 'p1', { content: '从日记本发的', createdAt: '2026-09-30T07:58:00Z' });
    store.setRow('xposts', 'p1', { state: 'sent', kind: 'post', link: 'https://x.com/me_on_x/status/777', at: now - 60_000 });
    routes['/2/status/777'] = { status: 503 };
    await runXStats(sql, store, env, now);
    expect(store.getRow('xtweets', '777')).toMatchObject({ text: '从日记本发的', kind: 'post', createdAt: new Date(now - 60_000).toISOString(), measuredAt: 0 });

    routes['/2/status/777'] = { status: 200, body: { code: 200, status: status('777', '2026-09-30T07:59:00Z', { text: '从日记本发的', views: 3 }) } };
    await runXStats(sql, store, env, now + 15 * 60_000);
    expect(store.getRow('xtweets', '777')).toMatchObject({ createdAt: '2026-09-30T07:59:00.000Z', views: 3, measuredAt: now + 15 * 60_000 });
  });

  it('marks a tweet gone once it leaves the timeline and X no longer has it', async () => {
    await runXStats(sql, store, env, now);
    routes['/2/profile/me_on_x/statuses'] = page(LATEST.filter((tweet) => tweet.id !== '104'), 'c1');
    routes['/2/status/104'] = { status: 404, body: { code: 404 } };
    await runXStats(sql, store, env, now + 2 * HOUR);
    expect(store.getRow('xtweets', '104')).toMatchObject({ gone: true });
    expect(store.getRow('xtweets', '106')).toMatchObject({ gone: false, measuredAt: now + 2 * HOUR });
  });

  it('keeps the last numbers and says so when FxTwitter fails', async () => {
    await runXStats(sql, store, env, now);
    routes['/me_on_x'] = { status: 503 };
    routes['/2/profile/me_on_x/statuses'] = { status: 503 };
    const later = now + 2 * HOUR;
    expect(await runXStats(sql, store, env, later)).toBe(later + 15 * 60_000);
    expect(store.getCell('xtweets', '106', 'views')).toBe(71);
    expect(String(store.getCell('xaccount', 'me', 'error'))).toContain('HTTP 503');
  });

  it('leaves Buffer alone while it is rate limited', async () => {
    await setMeta(sql, 'buffer_retry_at', String(now + 600_000));
    await runXStats(sql, store, env, now);
    expect(fetchChannelHandle).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
