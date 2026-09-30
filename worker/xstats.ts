import type { MergeableStore } from 'tinybase';
import { bufferConfigured, fetchChannelHandle, fetchChannelTweets, fetchOrganizationId, type BufferEnv } from './buffer';
import { getMeta, setMeta } from './sql';

/**
 * How the X account is doing, for 统计 and the numbers under each post.
 *
 * Buffer's free plan reports every X metric as 0, so the numbers come from
 * FxTwitter's public API (github.com/FxEmbed/FxEmbed), which returns what X
 * shows publicly: views, likes, replies, reposts, quotes, bookmarks and the
 * follower count. Buffer still says which tweets exist — the ones it
 * published and the ones posted on X directly, which it imports.
 *
 * Synced tables: `xtweets` (one row per tweet id) and `xaccount` (row 'me').
 * A failed refresh keeps the last numbers and says so in `xaccount.error`.
 */

const FX_API = 'https://api.fxtwitter.com';
const USER_AGENT = 'diary-app personal stats (one account, hourly)';
const HOUR = 3600_000;
const DISCOVER_EVERY_MS = HOUR;
const ACCOUNT_EVERY_MS = HOUR;
// Young tweets still gather views; older ones barely move.
const YOUNG_MS = 3 * 24 * HOUR;
const YOUNG_EVERY_MS = HOUR;
const OLD_EVERY_MS = 12 * HOUR;
const GONE_EVERY_MS = 24 * HOUR;
const MAX_FETCHES_PER_RUN = 25;
const RETRY_MS = 15 * 60_000;

interface TweetRow {
  text?: string;
  createdAt?: string;
  measuredAt?: number;
  gone?: boolean;
}

type FxResult =
  | { kind: 'ok'; data: Record<string, unknown> }
  | { kind: 'gone' }
  | { kind: 'error'; message: string };

async function fx(path: string, key: 'tweet' | 'user'): Promise<FxResult> {
  let response: Response;
  try {
    response = await fetch(`${FX_API}${path}`, { headers: { 'user-agent': USER_AGENT } });
  } catch {
    return { kind: 'error', message: '连不上 FxTwitter' };
  }
  if (response.status === 404) return { kind: 'gone' };
  const body: unknown = await response.json().catch(() => null);
  const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : null;
  if (!response.ok || typeof data !== 'object' || data === null) {
    return { kind: 'error', message: `FxTwitter 返回 HTTP ${response.status}` };
  }
  return { kind: 'ok', data: data as Record<string, unknown> };
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

function dueAt(row: TweetRow, now: number): number {
  const measured = row.measuredAt ?? 0;
  if (row.gone) return measured + GONE_EVERY_MS;
  const created = Date.parse(row.createdAt ?? '');
  const young = !Number.isFinite(created) || now - created < YOUNG_MS;
  return measured + (young ? YOUNG_EVERY_MS : OLD_EVERY_MS);
}

function recordError(store: MergeableStore, message: string, now: number): void {
  console.warn('[xstats]', message);
  store.setPartialRow('xaccount', 'me', { error: message, errorAt: now });
}

/** Add tweets Buffer knows about that are not in `xtweets` yet. False if Buffer did not answer. */
async function discover(sql: SqlStorage, store: MergeableStore, env: BufferEnv, now: number): Promise<boolean> {
  // Tried at most hourly either way: Buffer's free plan has a small daily quota.
  setMeta(sql, 'x_discovered_at', String(now));
  let org = getMeta(sql, 'buffer_org');
  if (!org) {
    org = await fetchOrganizationId(env);
    if (!org) { recordError(store, 'Buffer 没有返回账户信息，新推文暂时没有加入统计', now); return false; }
    setMeta(sql, 'buffer_org', org);
  }
  if (!getMeta(sql, 'x_handle')) {
    const handle = await fetchChannelHandle(env, org);
    if (handle) setMeta(sql, 'x_handle', handle);
  }
  const tweets = await fetchChannelTweets(env, org);
  if (!tweets) { recordError(store, 'Buffer 没有返回推文列表，新推文暂时没有加入统计', now); return false; }
  store.transaction(() => {
    for (const tweet of tweets) {
      if (store.hasRow('xtweets', tweet.tweetId)) continue;
      store.setRow('xtweets', tweet.tweetId, {
        text: tweet.text, createdAt: tweet.sentAt, views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, measuredAt: 0, gone: false,
      });
    }
  });
  return true;
}

/** One pass: find new tweets, refresh the ones that are due. Returns when to run next. */
export async function runXStats(sql: SqlStorage, store: MergeableStore, env: BufferEnv, now: number): Promise<number> {
  if (!bufferConfigured(env)) return Infinity;

  const cooldown = Number(getMeta(sql, 'buffer_retry_at') ?? 0);
  const discoveredAt = Number(getMeta(sql, 'x_discovered_at') ?? 0);
  let failed = false;
  if (cooldown <= now && now - discoveredAt >= DISCOVER_EVERY_MS) failed = !await discover(sql, store, env, now);
  let refreshed = false;
  const handle = getMeta(sql, 'x_handle');
  const account = store.getRow('xaccount', 'me');
  if (!failed && handle && now - count(account.measuredAt) >= ACCOUNT_EVERY_MS) {
    const result = await fx(`/${encodeURIComponent(handle)}`, 'user');
    if (result.kind === 'ok') {
      store.setPartialRow('xaccount', 'me', {
        handle,
        followers: count(result.data.followers),
        following: count(result.data.following),
        tweets: count(result.data.tweets),
        measuredAt: now,
      });
      refreshed = true;
    } else {
      failed = true;
      recordError(store, result.kind === 'gone' ? `X 上找不到 @${handle}` : `${result.message}，粉丝数暂时没有更新`, now);
    }
  }

  const rows = Object.entries(store.getTable('xtweets') as Record<string, TweetRow>);
  const due = rows.filter(([, row]) => dueAt(row, now) <= now)
    .sort(([, a], [, b]) => (a.measuredAt ?? 0) - (b.measuredAt ?? 0))
    .slice(0, MAX_FETCHES_PER_RUN);
  for (const [id, row] of due) {
    if (failed) break;
    const result = await fx(`/status/${id}`, 'tweet');
    if (result.kind === 'gone') {
      // Deleted on X (or made private): kept, but left out of the numbers.
      store.setPartialRow('xtweets', id, { gone: true, measuredAt: now });
      refreshed = true;
    } else if (result.kind === 'ok') {
      const t = result.data;
      const created = count(t.created_timestamp);
      store.setPartialRow('xtweets', id, {
        text: typeof t.text === 'string' ? t.text : row.text ?? '',
        ...(created ? { createdAt: new Date(created * 1000).toISOString() } : {}),
        views: count(t.views),
        likes: count(t.likes),
        replies: count(t.replies),
        reposts: count(t.retweets),
        quotes: count(t.quotes),
        bookmarks: count(t.bookmarks),
        measuredAt: now,
        gone: false,
      });
      refreshed = true;
    } else {
      failed = true;
      recordError(store, `${result.message}，推文数据暂时没有更新`, now);
    }
  }
  if (!failed && refreshed && store.getCell('xaccount', 'me', 'error')) {
    store.setPartialRow('xaccount', 'me', { error: '', errorAt: 0 });
  }

  if (failed) return now + RETRY_MS;
  const next = Math.min(
    Number(getMeta(sql, 'x_discovered_at') ?? 0) + DISCOVER_EVERY_MS,
    count(store.getCell('xaccount', 'me', 'measuredAt')) + ACCOUNT_EVERY_MS,
    ...Object.values(store.getTable('xtweets') as Record<string, TweetRow>).map((row) => dueAt(row, now)),
  );
  return Math.max(next, now + 60_000);
}
