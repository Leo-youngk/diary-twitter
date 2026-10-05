import { median, myTweets } from './growth';
import type { XFollowersRow, XMetricRow, XTweetRow } from './schema';
import { addDays, parseDateKey } from './utils';
import { hasMetric, HOUR_MS, STAGES, type Metric, type Stage } from './xMetrics';

/**
 * 分析: the post-level patterns creator tools surface (docs/2026-10-05-creator-data-practices.md),
 * from same-age observations only. A post is compared with the account's own earlier posts at
 * the same checkpoint — as YouTube compares a video with your last 10 — never with cumulative
 * totals of a different age, a reconstructed ranking score, or other accounts.
 */

const DAY = 24 * HOUR_MS;
const FEEDBACK: Metric[] = ['likes', 'replies', 'reposts', 'quotes', 'bookmarks'];
/** The baseline is the median of up to this many earlier posts at the same checkpoint. */
export const BASELINE_POSTS = 10;
export const MIN_BASELINE = 5;
/** A group (a format, a posting hour, a kind of reply) is compared once it has this many posts. */
export const MIN_GROUP = 3;
/** At least this many times the baseline, and this many views, makes a post stand out. */
export const OUTLIER_RATIO = 2;
const OUTLIER_MIN_VIEWS = 20;
/** Patterns are read from this many recent days. */
export const WINDOW_DAYS = 30;

type Rows = Record<string, Partial<XTweetRow>>;
type Metrics = Record<string, Partial<XMetricRow>>;
export type Entry = 'original' | 'reply';

export interface Point {
  id: string;
  text: string;
  at: number;
  entry: Entry;
  format: string;
  views: number;
  /** Others' likes, replies, reposts, quotes and bookmarks at the checkpoint. */
  feedback: number;
  /** Whether "no feedback" can be told apart from "not reported". */
  feedbackKnown: boolean;
  parentFollowers: number | null;
  parentAt: number | null;
}

/** Each original and external reply, read at one checkpoint: the first observation inside its window. */
export function pointsAt(rows: Rows, metrics: Metrics, stage: Stage, now: number): Map<string, Point> {
  const checkpoint = STAGES.find((s) => s.key === stage)!;
  const posts = new Map(myTweets(rows).filter((t) => {
    // A thread's later part or an answer within one's own conversation is not a way in.
    const parent = rows[t.id]?.inReplyTo;
    return (t.original || t.reply) && !(parent && rows[parent]);
  }).map((t) => [t.id, t]));
  const points = new Map<string, Point>();
  for (const row of Object.values(metrics)) {
    const post = posts.get(row.tweetId ?? '');
    if (!post || row.stage !== stage || !hasMetric(row, 'views') || typeof row.views !== 'number' || !Number.isFinite(row.views) || row.views < 0) continue;
    const at = row.at ?? 0;
    const age = at - post.at;
    if (at > now || age < checkpoint.age || age > checkpoint.age + checkpoint.grace) continue;
    if ((points.get(post.id)?.at ?? Infinity) <= at) continue;
    const counts: Record<string, number> = {
      likes: row.likes ?? 0, replies: Math.max(0, (row.replies ?? 0) - (row.ownReplies ?? 0)),
      reposts: row.reposts ?? 0, quotes: row.quotes ?? 0, bookmarks: row.bookmarks ?? 0,
    };
    const feedback = FEEDBACK.reduce((sum, key) => sum + (hasMetric(row, key) ? counts[key] : 0), 0);
    const source = rows[post.id] ?? {};
    const parentFollowers = source.parentFollowers;
    const parentAt = Date.parse(source.parentAt ?? '');
    points.set(post.id, {
      id: post.id, text: post.text, at, entry: post.original ? 'original' : 'reply', format: post.format || '未识别',
      views: row.views, feedback, feedbackKnown: feedback > 0 || FEEDBACK.every((key) => hasMetric(row, key)),
      parentFollowers: typeof parentFollowers === 'number' && parentFollowers >= 0 ? parentFollowers : null,
      parentAt: Number.isFinite(parentAt) ? parentAt : null,
    });
  }
  // `at` was the observation time while choosing; keep the post's own time from here on.
  for (const point of points.values()) point.at = posts.get(point.id)!.at;
  return points;
}

/** The median of up to BASELINE_POSTS originals posted before `at` that have a reading at this checkpoint. */
function baselineBefore(points: Map<string, Point>, at: number): number[] {
  return [...points.values()]
    .filter((p) => p.entry === 'original' && p.at < at)
    .sort((a, b) => b.at - a.at)
    .slice(0, BASELINE_POSTS)
    .map((p) => p.views);
}

export interface Live {
  id: string;
  text: string;
  at: number;
  /** The latest checkpoint the post has reached. */
  stage: string;
  views: number;
  usual: number | null;
  rank: number | null;
  of: number | null;
}

/** Originals of the last 48 hours at their latest checkpoint, against the usual at that checkpoint. */
export function livePosts(rows: Rows, metrics: Metrics, now: number): Live[] {
  const byStage = new Map(STAGES.map((s) => [s.key, pointsAt(rows, metrics, s.key, now)]));
  const recent = myTweets(rows).filter((t) => t.original && now - t.at < 2 * DAY && t.at <= now).reverse();
  return recent.flatMap((t) => {
    const stage = [...STAGES].reverse().find((s) => byStage.get(s.key)!.has(t.id));
    if (!stage) return [];
    const points = byStage.get(stage.key)!;
    const views = points.get(t.id)!.views;
    const before = baselineBefore(points, t.at);
    const enough = before.length >= MIN_BASELINE;
    return [{
      id: t.id, text: t.text, at: t.at, stage: stage.label, views,
      usual: enough ? median(before) : null,
      rank: enough ? 1 + before.filter((v) => v > views).length : null,
      of: enough ? before.length + 1 : null,
    }];
  });
}

export interface Outlier { id: string; text: string; views: number; usual: number; ratio: number }

/** Originals whose 24-hour views reached OUTLIER_RATIO times the median of the posts before them. */
export function outliers(points24: Map<string, Point>, from: number): Outlier[] {
  return [...points24.values()].flatMap((p) => {
    if (p.entry !== 'original' || p.at < from || p.views < OUTLIER_MIN_VIEWS) return [];
    const before = baselineBefore(points24, p.at);
    if (before.length < MIN_BASELINE) return [];
    const usual = median(before);
    const ratio = p.views / Math.max(1, usual);
    return ratio >= OUTLIER_RATIO ? [{ id: p.id, text: p.text, views: p.views, usual, ratio }] : [];
  }).sort((a, b) => b.ratio - a.ratio).slice(0, 3);
}

export interface Group { key: string; posts: number; medianViews: number; responded: number; known: number }

function group(points: Point[], keyOf: (p: Point) => string | null, order: string[]): Group[] {
  const groups = order.flatMap((key) => {
    const members = points.filter((p) => keyOf(p) === key);
    if (members.length < MIN_GROUP) return [];
    const known = members.filter((p) => p.feedbackKnown);
    return [{ key, posts: members.length, medianViews: median(members.map((p) => p.views)), responded: known.filter((p) => p.feedback > 0).length, known: known.length }];
  });
  // One group alone compares with nothing.
  return groups.length >= 2 ? groups : [];
}

export const HOUR_GROUPS = Array.from({ length: 6 }, (_, i) => `${i * 4}–${(i + 1) * 4} 点`);
export const TARGET_GROUPS = ['不到 1 千粉', '1 千–1 万粉', '1 万–10 万粉', '10 万粉以上'];
export const DELAY_GROUPS = ['半小时内', '半小时到 2 小时', '2 小时以后'];
const FORMAT_GROUPS = ['文字', '图文', '视频', '引用'];

function targetOf(p: Point): string | null {
  const f = p.parentFollowers;
  if (f === null) return null;
  return TARGET_GROUPS[f < 1_000 ? 0 : f < 10_000 ? 1 : f < 100_000 ? 2 : 3];
}

function delayOf(p: Point): string | null {
  if (p.parentAt === null) return null;
  const delay = p.at - p.parentAt;
  return DELAY_GROUPS[delay < 30 * 60_000 ? 0 : delay < 2 * HOUR_MS ? 1 : 2];
}

export interface Patterns {
  formats: Group[];
  hours: Group[];
  targets: Group[];
  delays: Group[];
}

/** 24-hour readings grouped by format and posting hour (originals), and by whom and how soon (replies). */
export function patterns(points24: Map<string, Point>, from: number): Patterns {
  const recent = [...points24.values()].filter((p) => p.at >= from);
  const originals = recent.filter((p) => p.entry === 'original');
  const replies = recent.filter((p) => p.entry === 'reply');
  return {
    formats: group(originals, (p) => p.format, FORMAT_GROUPS),
    hours: group(originals, (p) => HOUR_GROUPS[Math.floor(new Date(p.at).getHours() / 4)], HOUR_GROUPS),
    targets: group(replies, targetOf, TARGET_GROUPS),
    delays: group(replies, delayOf, DELAY_GROUPS),
  };
}

type FollowerRows = Record<string, Partial<XFollowersRow>>;

function followerPoints(rows: FollowerRows): XFollowersRow[] {
  return Object.values(rows)
    .filter((r): r is XFollowersRow => typeof r.at === 'number' && r.at > 0 && typeof r.followers === 'number' && Number.isFinite(r.followers) && r.followers >= 0)
    .sort((a, b) => a.at - b.at);
}

/** The count as of a moment: the last reading at or before it; null before the first. */
function countAt(points: XFollowersRow[], time: number): number | null {
  let value: number | null = null;
  for (const point of points) {
    if (point.at > time) break;
    value = point.followers;
  }
  return value;
}

/** The net change on each of the last `span` local days, oldest first; null where readings do not cover the day. */
export function followerDays(rows: FollowerRows, today: string, now: number, span = 14): Array<{ key: string; gain: number | null }> {
  const points = followerPoints(rows);
  return Array.from({ length: span }, (_, i) => {
    const key = addDays(today, i - span + 1);
    const start = countAt(points, parseDateKey(key).getTime());
    const end = countAt(points, key === today ? now : parseDateKey(addDays(key, 1)).getTime());
    return { key, gain: start === null || end === null ? null : end - start };
  });
}

export interface Week {
  originals: number;
  replies: number;
  /** Net change over the week, or since the first reading when that came later (`since`); null with no readings. */
  followers: { gain: number; since: number | null } | null;
  /** 24-hour views of the week's originals that have that reading. */
  medianViews: number | null;
  responded: number;
  known: number;
}

export interface Review {
  thisWeek: Week;
  lastWeek: Week;
  /** Up to three next steps, each drawn from a pattern above. */
  actions: string[];
}

const quoteOf = (text: string) => `「${text.length > 14 ? `${text.slice(0, 14)}…` : text || '（无文字）'}」`;
const times = (ratio: number) => (ratio >= 10 ? String(Math.round(ratio)) : ratio.toFixed(1));

/** The best of two or more groups when it clearly leads: by feedback share, then by median views. */
function leader(groups: Group[], by: 'feedback' | 'views'): [Group, Group] | null {
  if (groups.length < 2) return null;
  const score = (g: Group) => (by === 'views' ? g.medianViews : g.known ? g.responded / g.known : -1);
  const sorted = [...groups].sort((a, b) => score(b) - score(a));
  const [best, next] = sorted;
  if (by === 'views' ? best.medianViews < 1.5 * Math.max(1, next.medianViews) : score(best) <= score(next) || best.responded === 0) return null;
  return [best, next];
}

/** This week against the last (rolling 7 days), and what the last 30 days suggest trying next. */
export function review(rows: Rows, metrics: Metrics, followerRows: FollowerRows, now: number): Review {
  const points24 = pointsAt(rows, metrics, 'h24', now);
  const followers = followerPoints(followerRows);
  const tweets = myTweets(rows);
  const week = (from: number, to: number): Week => {
    const inWeek = (at: number) => at >= from && at < to;
    const read = [...points24.values()].filter((p) => p.entry === 'original' && inWeek(p.at));
    const known = read.filter((p) => p.feedbackKnown);
    const first = followers.find((point) => point.at > from && point.at <= Math.min(to, now));
    const start = countAt(followers, from) ?? first?.followers ?? null;
    const end = countAt(followers, Math.min(to, now));
    return {
      originals: tweets.filter((t) => t.original && inWeek(t.at)).length,
      replies: tweets.filter((t) => t.reply && inWeek(t.at)).length,
      followers: start === null || end === null ? null : { gain: end - start, since: countAt(followers, from) === null ? first!.at : null },
      medianViews: read.length ? median(read.map((p) => p.views)) : null,
      responded: known.filter((p) => p.feedback > 0).length,
      known: known.length,
    };
  };

  const from = now - WINDOW_DAYS * DAY;
  const found = patterns(points24, from);
  const actions: string[] = [];
  if (tweets.length > 0 && !tweets.some((t) => t.original && now - t.at < 2 * DAY && t.at <= now)) {
    actions.push('近 48 小时没有原创。推荐流只收 48 小时内的帖子，关注你的人这时刷不到你的新内容。');
  }
  const top = outliers(points24, from)[0];
  if (top) actions.push(`${quoteOf(top.text)}24 小时的浏览是之前帖子中位数的 ${times(top.ratio)} 倍：这个题目有人看，接着写一条，或展开成串文。`);
  const format = leader(found.formats, 'views');
  if (format) actions.push(`「${format[0].key}」原创 24 小时浏览中位数是「${format[1].key}」的 ${times(format[0].medianViews / Math.max(1, format[1].medianViews))} 倍（各至少 ${MIN_GROUP} 条）：多发几条看是否稳定。`);
  const hour = leader(found.hours, 'views');
  if (hour) actions.push(`${hour[0].key}发的原创 24 小时浏览中位数最高（${hour[0].posts} 条）：试着把想让更多人看到的放在这个时段。`);
  const target = leader(found.targets, 'feedback');
  if (target) actions.push(`回复「${target[0].key}」账号的帖子，收到互动的比例最高（${target[0].responded}/${target[0].known}）：多参与这类讨论。`);
  const delay = leader(found.delays, 'feedback');
  if (delay) actions.push(`对方发帖后「${delay[0].key}」回复的，收到互动的比例最高（${delay[0].responded}/${delay[0].known}）。`);
  return { thisWeek: week(now - 7 * DAY, now + 1), lastWeek: week(now - 14 * DAY, now - 7 * DAY), actions: actions.slice(0, 3) };
}
