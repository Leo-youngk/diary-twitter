import type { MergeableStore } from 'tinybase';
import { bufferConfigured, fetchChannelHandle, fetchOrganizationId, tweetIdOf, type BufferEnv } from '../buffer';
import { getMeta, setMeta } from '../d1';
import { dueStages, hasMetric, hotRefreshDue, METRICS, parseMetrics, type Metric } from '../../src/lib/xMetrics';
import type { XTweetRow } from '../../src/lib/schema';

/**
 * How the X account is doing, for 统计 and the numbers under each post.
 *
 * X's own API has no free reads, so the numbers come from FxTwitter's public
 * API (github.com/FxEmbed/FxEmbed), which returns what X shows publicly. The
 * account's timeline, replies included, lists every tweet — sent from the app
 * or posted on X directly — with its views, likes, replies, reposts, quotes
 * and bookmarks, 100 to a request. Buffer only supplies the account's handle.
 *
 * Synced tables: `xtweets` (one row per tweet id), `xaccount` (row 'me') and
 * `xfollowers` (timestamped follower observations) and `xmetrics` (age checkpoints).
 * A failed refresh keeps the last numbers and says so in `xaccount.error`.
 */

const FX_API = 'https://api.fxtwitter.com';
const USER_AGENT = 'diary-app personal stats (one account)';
const HOUR = 3600_000;
const ACCOUNT_EVERY_MS = HOUR;
// The newest page brings new tweets and the numbers that still move.
const LATEST_EVERY_MS = HOUR;
// In between, reuse the minute look for new tweets to refresh hot posts every five minutes.
const NEW_EVERY_MS = 60_000;
const NEW_PAGE_SIZE = 20;
// A walk down the whole timeline refreshes older tweets; the first one reads the history.
const WALK_EVERY_MS = 24 * HOUR;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 5;
// Tweets no page has shown lately (deleted, or deeper than X lets a timeline
// go) are asked for one by one. Old ones wait longer than a walk takes to come round.
const YOUNG_MS = 3 * 24 * HOUR;
const YOUNG_EVERY_MS = HOUR;
const OLD_EVERY_MS = 36 * HOUR;
const GONE_EVERY_MS = 24 * HOUR;
const MAX_FETCHES_PER_RUN = 25;
const REQUEST_TIMEOUT_MS = 8000;
const REFRESH_BUDGET_MS = 10_000;
const RETRY_MS = 15 * 60_000;

interface TweetRow {
  createdAt?: string;
  measuredAt?: number;
  gone?: boolean;
}

/** A status from FxTwitter's v2 API. */
interface Tweet {
  id: string;
  author: string;
  /** The author's follower count when read. */
  followers: number;
  repost: boolean;
  replyTo: { author: string; id: string } | null;
  text: string;
  createdAt: string;
  numbers: Partial<Record<Metric, number>>;
  metricMask: number;
  format: string;
}

type FxResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'gone' }
  | { kind: 'error'; message: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

async function fx(path: string): Promise<FxResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${FX_API}${path}`, { headers: { 'user-agent': USER_AGENT }, signal: controller.signal });
    const body: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) return { kind: 'error', message: 'FxTwitter 请求超时' };
    // FxTwitter repeats the status in `code`; 404 is deleted or unknown, 401 private.
    const code = isRecord(body) && typeof body.code === 'number' ? body.code : response.status;
    if (code === 404 || code === 401) return { kind: 'gone' };
    if (!response.ok || code !== 200 || !isRecord(body)) return { kind: 'error', message: `FxTwitter 返回 HTTP ${code}` };
    return { kind: 'ok', body };
  } catch {
    return { kind: 'error', message: controller.signal.aborted ? 'FxTwitter 请求超时' : '连不上 FxTwitter' };
  } finally {
    clearTimeout(timer);
  }
}

function failure(result: FxResult): string {
  return result.kind === 'error' ? result.message : 'FxTwitter 返回的数据不完整';
}

function parseStatus(value: unknown): Tweet | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const reply = isRecord(value.replying_to) ? value.replying_to : null;
  const created = count(value.created_timestamp);
  const metrics = parseMetrics(value);
  const media = isRecord(value.media) ? value.media : null;
  const video = media && ((Array.isArray(media.videos) && media.videos.length > 0) || media.broadcast || media.external);
  const photo = media && Array.isArray(media.photos) && media.photos.length > 0;
  const followers = isRecord(value.author) ? value.author.followers : undefined;
  return {
    id: value.id,
    author: lower(isRecord(value.author) ? value.author.screen_name : ''),
    followers: typeof followers === 'number' && Number.isFinite(followers) && followers >= 0 ? followers : -1,
    repost: isRecord(value.reposted_by),
    replyTo: reply && typeof reply.status === 'string' ? { author: lower(reply.screen_name), id: reply.status } : null,
    text: typeof value.text === 'string' ? value.text : '',
    createdAt: created ? new Date(created * 1000).toISOString() : '',
    numbers: metrics.numbers,
    metricMask: metrics.mask,
    format: video ? '视频' : photo ? '图文' : isRecord(value.quote) ? '引用' : '文字',
  };
}

/** A reply to oneself continues what it answers: a thread stays a post, a conversation a reply. */
function kindOf(store: MergeableStore, tweet: Tweet): 'post' | 'reply' {
  if (!tweet.replyTo) return 'post';
  if (tweet.replyTo.author !== tweet.author) return 'reply';
  return store.getCell('xtweets', tweet.replyTo.id, 'kind') === 'reply' ? 'reply' : 'post';
}

/**
 * Saves a tweet. `parent` is the tweet it answers when the same page carried it: a reply then
 * keeps the size of the account it answered and when that tweet was posted, which nothing can
 * recover later (accounts grow; the parent is not ours to re-read).
 */
function save(store: MergeableStore, id: string, tweet: Tweet, now: number, parent?: Tweet): void {
  const externalParent = parent && parent.author !== tweet.author;
  const recordedFollowers = store.getCell('xtweets', id, 'parentFollowers');
  store.setPartialRow('xtweets', id, {
    text: tweet.text,
    ...(tweet.createdAt ? { createdAt: tweet.createdAt } : {}),
    kind: kindOf(store, tweet),
    inReplyTo: tweet.replyTo?.id ?? '',
    ...(externalParent && parent.followers >= 0 && (typeof recordedFollowers !== 'number' || recordedFollowers < 0)
      ? { parentFollowers: parent.followers } : {}),
    ...(externalParent && parent.createdAt && !store.getCell('xtweets', id, 'parentAt') ? { parentAt: parent.createdAt } : {}),
    ...tweet.numbers,
    metricMask: tweet.metricMask,
    format: tweet.format,
    measuredAt: now,
    gone: false,
  });
}

/** Save the first real observation near each checkpoint, never backfill from a later lifetime total. */
function snapshot(store: MergeableStore, id: string, now: number): void {
  const row = store.getRow('xtweets', id) as Partial<XTweetRow>;
  if (row.gone || !row.createdAt || !hasMetric(row, 'views')) return;
  // External replies are a discovery entry too. Exclude known self-continuations.
  if (row.inReplyTo && store.hasRow('xtweets', row.inReplyTo)) return;
  if (row.kind !== 'reply' && row.inReplyTo) return;
  const ownReplies = Object.values(store.getTable('xtweets'))
    .filter((part) => !part.gone && part.inReplyTo === id && Date.parse(String(part.createdAt ?? '')) <= now).length;
  for (const stage of dueStages(row.createdAt, now)) {
    const key = `${id}-${stage.key}`;
    if (store.hasRow('xmetrics', key)) continue;
    store.setRow('xmetrics', key, {
      tweetId: id, stage: stage.key, at: now, metricMask: row.metricMask ?? 0, ownReplies,
      ...Object.fromEntries(METRICS.map((metric) => [metric, row[metric] ?? 0])),
    });
  }
}

function dueAt(row: TweetRow, now: number): number {
  const measured = row.measuredAt ?? 0;
  if (row.gone) return measured + GONE_EVERY_MS;
  const created = Date.parse(row.createdAt ?? '');
  const young = !Number.isFinite(created) || now - created < YOUNG_MS;
  const hot = Number.isFinite(created) && now - created <= 2 * HOUR + 10 * 60_000;
  return measured + (hot ? 5 * 60_000 : young ? YOUNG_EVERY_MS : OLD_EVERY_MS);
}

function recordError(store: MergeableStore, message: string, now: number): void {
  console.warn('[xstats]', message);
  store.setPartialRow('xaccount', 'me', { error: message, errorAt: now });
}

/** Tweets the app sent count at once, before the next page of the timeline shows them. */
function addSentTweets(store: MergeableStore): void {
  const sent: Array<[string, string, string, string]> = [];
  for (const [id, row] of Object.entries(store.getTable('xposts'))) {
    const tweetId = row.state === 'sent' ? tweetIdOf(String(row.link ?? '')) : undefined;
    if (!tweetId || store.hasRow('xtweets', tweetId)) continue;
    const source = store.getRow(row.kind === 'reply' ? 'replies' : 'posts', id);
    // A thread's later part answers its post (the timeline later names the exact part); an 追加 quotes it instead.
    const parent = source.thread ? tweetIdOf(String(store.getCell('xposts', String(source.postId ?? ''), 'link') ?? '')) ?? '' : '';
    sent.push([tweetId, String(source.content ?? ''), new Date(count(row.at)).toISOString(), parent]);
  }
  if (sent.length === 0) return;
  store.transaction(() => {
    for (const [tweetId, text, createdAt, inReplyTo] of sent) {
      store.setRow('xtweets', tweetId, {
        text, createdAt, kind: 'post', inReplyTo, views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, metricMask: 0, format: '', measuredAt: 0, gone: false,
      });
    }
  });
}

/** The connected account's handle, as Buffer names its X channel. */
async function askHandle(sql: D1Database, env: BufferEnv, now: number): Promise<string | null> {
  // Asked at most hourly: Buffer's free plan has a small daily quota.
  await setMeta(sql, 'x_handle_asked_at', String(now));
  let org = (await getMeta(sql, 'buffer_org'));
  if (!org) {
    org = await fetchOrganizationId(env);
    if (!org) return null;
    await setMeta(sql, 'buffer_org', org);
  }
  const handle = await fetchChannelHandle(env, org);
  if (handle) await setMeta(sql, 'x_handle', handle);
  return handle;
}

type Page = { ok: true; next: string } | { ok: false; message: string };

/** One page of the account's timeline with replies; saves the account's own tweets, or only new ones. */
async function readPage(store: MergeableStore, handle: string, cursor: string, now: number, onlyNew = false): Promise<Page> {
  const query = new URLSearchParams({ count: String(onlyNew ? NEW_PAGE_SIZE : PAGE_SIZE), with_replies: '1' });
  if (cursor) query.set('cursor', cursor);
  const result = await fx(`/2/profile/${encodeURIComponent(handle)}/statuses?${query}`);
  // FxTwitter also answers an empty timeline with 404.
  if (result.kind === 'gone') return { ok: true, next: '' };
  if (result.kind === 'error') return { ok: false, message: result.message };
  const results: unknown[] = Array.isArray(result.body.results) ? result.body.results : [];
  const me = handle.toLowerCase();
  // The timeline also carries the tweets being replied to and reposts of others' tweets.
  const statuses = results.map(parseStatus).filter((tweet): tweet is Tweet => tweet !== null);
  const byId = new Map(statuses.map((tweet) => [tweet.id, tweet]));
  const mine = statuses
    .filter((tweet) => tweet.author === me && !tweet.repost && !(onlyNew && store.hasRow('xtweets', tweet.id)
      && !hotRefreshDue(store.getRow('xtweets', tweet.id) as Partial<XTweetRow>, now)))
    // Oldest first, so a reply's parent has its kind before the reply asks for it.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (mine.length > 0) store.transaction(() => {
    for (const tweet of mine) save(store, tweet.id, tweet, now, tweet.replyTo ? byId.get(tweet.replyTo.id) : undefined);
    // Parents and thread parts have all been saved before counting self-replies.
    for (const tweet of mine) snapshot(store, tweet.id, now);
  });
  const bottom = isRecord(result.body.cursor) && typeof result.body.cursor.bottom === 'string' ? result.body.cursor.bottom : '';
  // An empty page is the end, even when X offers another cursor.
  return { ok: true, next: results.length > 0 && bottom !== cursor ? bottom : '' };
}

/** One pass: read the timeline and refresh what is due. Returns when to run next. */
export async function runXStats(sql: D1Database, store: MergeableStore, env: BufferEnv, now: number): Promise<number> {
  if (!bufferConfigured(env)) return Infinity;
  const deadline = Date.now() + REFRESH_BUDGET_MS;
  const metaTime = async (key: string) => Number((await getMeta(sql, key)) ?? 0);
  addSentTweets(store);

  // An upgraded account already has a real profile observation. Preserve its
  // actual time as the initial baseline, even if the next reading is unchanged.
  const previousAccount = store.getRow('xaccount', 'me');
  if (store.getRowCount('xfollowers') === 0 && count(previousAccount.measuredAt) > 0
    && typeof previousAccount.followers === 'number' && Number.isFinite(previousAccount.followers) && previousAccount.followers >= 0
    && typeof previousAccount.following === 'number' && Number.isFinite(previousAccount.following) && previousAccount.following >= 0) {
    store.setRow('xfollowers', String(previousAccount.measuredAt), {
      followers: previousAccount.followers, following: previousAccount.following, at: previousAccount.measuredAt,
    });
  }

  let failed = false;
  let refreshed = false;
  const fail = (message: string) => {
    failed = true;
    recordError(store, message, now);
  };

  let handle = (await getMeta(sql, 'x_handle'));
  if (!handle && now - (await metaTime('x_handle_asked_at')) >= HOUR && (await metaTime('buffer_retry_at')) <= now) {
    handle = await askHandle(sql, env, now);
    if (!handle) fail('Buffer 没有返回 X 账号，暂时读不到推文');
  }

  if (!failed && handle && now - count(store.getCell('xaccount', 'me', 'measuredAt')) >= ACCOUNT_EVERY_MS) {
    const result = await fx(`/${encodeURIComponent(handle)}`);
    const user = result.kind === 'ok' && isRecord(result.body.user) ? result.body.user : null;
    if (user && typeof user.followers === 'number' && Number.isFinite(user.followers) && user.followers >= 0
      && typeof user.following === 'number' && Number.isFinite(user.following) && user.following >= 0) {
      const followers = count(user.followers);
      const following = count(user.following);
      const previous = store.getRow('xaccount', 'me');
      const day = new Date(now).toISOString().slice(0, 10);
      const previousDay = new Date(count(previous.measuredAt)).toISOString().slice(0, 10);
      store.setPartialRow('xaccount', 'me', { handle, followers, following, tweets: count(user.tweets), measuredAt: now });
      // Keep every observed change, plus one unchanged boundary reading per UTC day.
      if (previous.followers !== followers || previous.following !== following || previousDay !== day) {
        store.setRow('xfollowers', String(now), { followers, following, at: now });
      }
      refreshed = true;
    } else {
      fail(result.kind === 'gone' ? `X 上找不到 @${handle}` : `${failure(result)}，粉丝数暂时没有更新`);
    }
  }

  if (!failed && handle) {
    const full = now - (await metaTime('x_latest_at')) >= LATEST_EVERY_MS;
    const page = await readPage(store, handle, '', now, !full);
    if (page.ok) {
      refreshed = true;
      if (full) {
        await setMeta(sql, 'x_latest_at', String(now));
        if (!(await getMeta(sql, 'x_walk_cursor')) && now - (await metaTime('x_walked_at')) >= WALK_EVERY_MS) {
          if (page.next) await setMeta(sql, 'x_walk_cursor', page.next);
          else await setMeta(sql, 'x_walked_at', String(now));
        }
      }
    } else {
      fail(`${page.message}，推文数据暂时没有更新`);
    }
  }

  for (let pages = 0; !failed && handle && pages < MAX_PAGES_PER_RUN && Date.now() < deadline; pages++) {
    const cursor = (await getMeta(sql, 'x_walk_cursor'));
    if (!cursor) break;
    const page = await readPage(store, handle, cursor, now);
    if (page.ok) {
      refreshed = true;
      await setMeta(sql, 'x_walk_cursor', page.next);
      if (!page.next) await setMeta(sql, 'x_walked_at', String(now));
    } else {
      // The walk starts again from the next newest page rather than keep a cursor that may have expired.
      await setMeta(sql, 'x_walk_cursor', '');
      fail(`${page.message}，较早的推文暂时没有更新`);
    }
  }

  const rows = Object.entries(store.getTable('xtweets') as Record<string, TweetRow>);
  const due = rows.filter(([, row]) => dueAt(row, now) <= now)
    .sort(([, a], [, b]) => Number(dueStages(b.createdAt ?? '', now).length > 0) - Number(dueStages(a.createdAt ?? '', now).length > 0)
      || (a.measuredAt ?? 0) - (b.measuredAt ?? 0))
    .slice(0, MAX_FETCHES_PER_RUN);
  for (const [id] of due) {
    // This shares an alarm with X publication. Give newly arrived posts a turn
    // instead of spending minutes refreshing a large account's older tweets.
    if (failed || Date.now() >= deadline) break;
    const result = await fx(`/2/status/${id}`);
    const tweet = result.kind === 'ok' ? parseStatus(result.body.status) : null;
    if (result.kind === 'gone') {
      // Deleted on X (or made private): kept, but left out of the numbers.
      store.setPartialRow('xtweets', id, { gone: true, measuredAt: now });
      refreshed = true;
    } else if (tweet) {
      save(store, id, tweet, now);
      snapshot(store, id, now);
      refreshed = true;
    } else {
      fail(`${failure(result)}，推文数据暂时没有更新`);
    }
  }
  if (!failed && refreshed && store.getCell('xaccount', 'me', 'error')) {
    store.setPartialRow('xaccount', 'me', { error: '', errorAt: 0 });
  }

  if (failed) return now + RETRY_MS;
  // The look for new tweets is due every minute; each run also does whatever else has come due.
  if (handle) return now + NEW_EVERY_MS;
  const next = Math.min(
    Math.max((await metaTime('x_handle_asked_at')) + HOUR, (await metaTime('buffer_retry_at'))),
    ...Object.values(store.getTable('xtweets') as Record<string, TweetRow>).map((row) => dueAt(row, now)),
  );
  return Math.max(next, now + 60_000);
}
