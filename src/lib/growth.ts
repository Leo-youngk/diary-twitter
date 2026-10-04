import type { XFollowersRow, XTweetRow } from './schema';
import { addDays, parseDateKey, toLocalDateKey } from './utils';

/**
 * What 统计 suggests doing each day, and how the posts did by the measure X
 * ranks them with. The numbers come from X's open-sourced For You code
 * (github.com/xai-org/x-algorithm, production values synced 2026-10-02); see
 * docs/2026-10-04-x-algorithm-growth.md for where each one lives.
 *
 * X scores a post for one reader as Σ weight × P(that reader takes the action).
 * FxTwitter shows only counts, so a post's rates (count ÷ views) stand in for
 * those probabilities: the weights multiply rates here, never raw counts.
 */

const HOUR = 3600_000;

/** ColdStartMaxPostAgeSecs: only an original this young can take the new-author slot. */
export const COLD_START_WINDOW_MS = 2 * HOUR;
/** ColdStartFollowerCap: an account with more followers no longer gets the slot. */
export const COLD_START_FOLLOWER_CAP = 50_000;
/** The slot's Thompson-sampling prior Beta(0.75, 49.25): the like rate it assumes of a post nobody has seen. */
export const PRIOR_LIKE_RATE = 0.75 / (0.75 + 49.25);
/** AgeFilter and Thunder's retention: For You stops showing a post 48 hours after it was posted. */
export const FEED_LIFETIME_MS = 48 * HOUR;
/** The weights of the actions FxTwitter counts (home-mixer/params/param.rs). */
export const WEIGHTS = { likes: 0.5, replies: 5, reposts: 1, quotes: 5 } as const;
export type WeightedAction = keyof typeof WEIGHTS;

// Not X's numbers: a pace that keeps something of one's own in For You every
// day without two originals competing for the same 2-hour window.
export const DAILY_ORIGINALS = 2;
export const DAILY_REPLIES = 5;
/** Posts younger than this are still gathering most of their views; comparisons leave them out. */
export const SETTLED_MS = 24 * HOUR;
/** Below this many views a post's rates say little. */
export const MIN_VIEWS = 30;

export interface MyTweet {
  id: string;
  text: string;
  at: number;
  /** Starts a conversation: the only kind For You recommends to non-followers and the slot can lift. */
  original: boolean;
  /** Answers someone else's conversation. A later part of one's own thread is neither. */
  reply: boolean;
  measured: boolean;
  views: number;
  likes: number;
  /** Readers' replies: one's own thread parts and answers are left out. */
  replies: number;
  reposts: number;
  quotes: number;
  bookmarks: number;
}

/** The account's live tweets, oldest first. */
export function myTweets(rows: Record<string, Partial<XTweetRow>>): MyTweet[] {
  // X counts one's own direct answers (a thread's next part) among a tweet's replies.
  const ownAnswers = new Map<string, number>();
  for (const row of Object.values(rows)) {
    if (!row.gone && row.inReplyTo) ownAnswers.set(row.inReplyTo, (ownAnswers.get(row.inReplyTo) ?? 0) + 1);
  }
  return Object.entries(rows).flatMap(([id, row]) => {
    const at = Date.parse(row.createdAt ?? '');
    if (row.gone || !Number.isFinite(at)) return [];
    const reply = row.kind === 'reply';
    return [{
      id,
      text: row.text ?? '',
      at,
      original: !reply && !row.inReplyTo,
      reply,
      measured: (row.measuredAt ?? 0) > 0,
      views: row.views ?? 0,
      likes: row.likes ?? 0,
      replies: Math.max(0, (row.replies ?? 0) - (ownAnswers.get(id) ?? 0)),
      reposts: row.reposts ?? 0,
      quotes: row.quotes ?? 0,
      bookmarks: row.bookmarks ?? 0,
    }];
  }).sort((a, b) => a.at - b.at);
}

const rate = (count: number, views: number) => (views > 0 ? count / views : null);

function weighted(t: Pick<MyTweet, WeightedAction>): number {
  return WEIGHTS.likes * t.likes + WEIGHTS.replies * t.replies + WEIGHTS.reposts * t.reposts + WEIGHTS.quotes * t.quotes;
}

/** Σ weight × rate, per 1000 views: what X's score would be if every reader acted at these rates. */
export function scorePerThousand(t: Pick<MyTweet, WeightedAction | 'views'>): number | null {
  return t.views > 0 ? (weighted(t) / t.views) * 1000 : null;
}

export interface WindowPost {
  id: string;
  text: string;
  at: number;
  endsAt: number;
  views: number;
  likes: number;
  likeRate: number | null;
}

export interface TodayPlan {
  originals: number;
  replies: number;
  /** Originals still inside their 2-hour window, newest first. */
  inWindow: WindowPost[];
  /** Originals still in For You that readers replied to, most replied first. */
  answered: Array<{ id: string; text: string; replies: number }>;
}

export function todayPlan(tweets: MyTweet[], today: string, now: number): TodayPlan {
  const posted = tweets.filter((t) => t.at <= now);
  const isToday = (t: MyTweet) => toLocalDateKey(t.at) === today;
  return {
    originals: posted.filter((t) => t.original && isToday(t)).length,
    replies: posted.filter((t) => t.reply && isToday(t)).length,
    inWindow: posted
      .filter((t) => t.original && now - t.at < COLD_START_WINDOW_MS)
      .reverse()
      .map((t) => ({
        id: t.id,
        text: t.text,
        at: t.at,
        endsAt: t.at + COLD_START_WINDOW_MS,
        views: t.views,
        likes: t.likes,
        likeRate: t.measured ? rate(t.likes, t.views) : null,
      })),
    answered: posted
      .filter((t) => t.original && t.replies > 0 && now - t.at < FEED_LIFETIME_MS)
      .sort((a, b) => b.replies - a.replies || b.at - a.at)
      .slice(0, 3)
      .map(({ id, text, replies }) => ({ id, text, replies })),
  };
}

export interface HourBucket {
  /** Local hours [from, to). */
  from: number;
  to: number;
  posts: number;
  medianViews: number;
  likeRate: number | null;
}

export interface RankedPost {
  id: string;
  text: string;
  views: number;
  score: number;
  likeRate: number;
}

export interface Diagnosis {
  /** Originals posted in the range. */
  originals: number;
  /** Of those, posted under 2 hours after the original before. */
  crowded: number;
  /** Originals in the range at least a day old, which the rest compares. */
  settled: number;
  views: number;
  likeRate: number | null;
  /** Settled originals with enough views to judge, and how many of them beat the slot's prior. */
  rated: number;
  beatPrior: number;
  scorePerThousand: number | null;
  /** The share of the score each action brought. */
  mix: Record<WeightedAction, number>;
  /** Readers' replies and quotes per 1000 views. */
  talkPerThousand: number | null;
  bookmarksPerThousand: number | null;
  /** Posting hours with at least two settled originals. */
  hours: HourBucket[];
  /** The settled originals X's weights favour most. */
  best: RankedPost[];
  /** Replies in others' conversations. */
  replies: number;
  replyLikes: number;
}

const BUCKET_HOURS = 4;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The originals and replies posted from `from` (ms) to now. */
export function diagnose(tweets: MyTweet[], from: number, now: number): Diagnosis {
  const originals = tweets.filter((t) => t.original && t.at <= now);
  const inRange = originals.filter((t) => t.at >= from);
  let crowded = 0;
  originals.forEach((t, i) => {
    if (i > 0 && t.at >= from && t.at - originals[i - 1].at < COLD_START_WINDOW_MS) crowded += 1;
  });

  const settled = inRange.filter((t) => t.measured && now - t.at >= SETTLED_MS);
  const sum = (key: 'views' | 'bookmarks' | WeightedAction) => settled.reduce((n, t) => n + t[key], 0);
  const totals = { views: sum('views'), likes: sum('likes'), replies: sum('replies'), reposts: sum('reposts'), quotes: sum('quotes'), bookmarks: sum('bookmarks') };
  const total = weighted(totals);
  const perThousand = (count: number) => (totals.views > 0 ? (count / totals.views) * 1000 : null);

  const rated = settled.filter((t) => t.views >= MIN_VIEWS);
  const hours: HourBucket[] = [];
  for (let hour = 0; hour < 24; hour += BUCKET_HOURS) {
    const posts = settled.filter((t) => Math.floor(new Date(t.at).getHours() / BUCKET_HOURS) * BUCKET_HOURS === hour);
    if (posts.length < 2) continue;
    const views = posts.reduce((n, t) => n + t.views, 0);
    hours.push({
      from: hour,
      to: hour + BUCKET_HOURS,
      posts: posts.length,
      medianViews: median(posts.map((t) => t.views)),
      likeRate: rate(posts.reduce((n, t) => n + t.likes, 0), views),
    });
  }

  const replies = tweets.filter((t) => t.reply && t.at >= from && t.at <= now);
  return {
    originals: inRange.length,
    crowded,
    settled: settled.length,
    views: totals.views,
    likeRate: rate(totals.likes, totals.views),
    rated: rated.length,
    beatPrior: rated.filter((t) => t.likes / t.views > PRIOR_LIKE_RATE).length,
    scorePerThousand: scorePerThousand(totals),
    mix: {
      likes: total > 0 ? (WEIGHTS.likes * totals.likes) / total : 0,
      replies: total > 0 ? (WEIGHTS.replies * totals.replies) / total : 0,
      reposts: total > 0 ? (WEIGHTS.reposts * totals.reposts) / total : 0,
      quotes: total > 0 ? (WEIGHTS.quotes * totals.quotes) / total : 0,
    },
    talkPerThousand: perThousand(totals.replies + totals.quotes),
    bookmarksPerThousand: perThousand(totals.bookmarks),
    hours,
    best: rated
      .map((t) => ({ id: t.id, text: t.text, views: t.views, score: scorePerThousand(t) ?? 0, likeRate: t.likes / t.views }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score || b.views - a.views)
      .slice(0, 3),
    replies: replies.length,
    replyLikes: replies.reduce((n, t) => n + t.likes, 0),
  };
}

export interface FollowerTrend {
  /** The change over the last 7 days, or since counting began if that was later. */
  week: { gain: number; since: string } | null;
  /** The change on each of the last days, oldest first; null before counting began. */
  days: Array<{ key: string; gain: number | null }>;
}

/** Follower changes per local day, from the server's daily readings. */
export function followerTrend(rows: Record<string, Partial<XFollowersRow>>, today: string, now: number, span = 14): FollowerTrend {
  const points = Object.values(rows)
    .filter((row): row is XFollowersRow => (row.at ?? 0) > 0 && typeof row.followers === 'number')
    .sort((a, b) => a.at - b.at);
  // The count as of a moment: the last reading at or before it.
  const at = (time: number): number | null => {
    let value: number | null = null;
    for (const point of points) {
      if (point.at > time) break;
      value = point.followers;
    }
    return value;
  };
  const days = Array.from({ length: span }, (_, i) => {
    const key = addDays(today, i - span + 1);
    const start = at(parseDateKey(key).getTime());
    const end = at(key === today ? now : parseDateKey(addDays(key, 1)).getTime());
    return { key, gain: start === null || end === null ? null : end - start };
  });
  const latest = at(now);
  if (latest === null) return { week: null, days };
  const weekStart = addDays(today, -6);
  const base = at(parseDateKey(weekStart).getTime());
  return {
    week: base === null
      ? { gain: latest - points[0].followers, since: toLocalDateKey(points[0].at) }
      : { gain: latest - base, since: weekStart },
    days,
  };
}
