import { describe, expect, it } from 'vitest';
import { cohortPosts, experimentResult, followerTrend, groupCohorts, myTweets, replyQueue, suggestTopic, type CohortPost } from '../growth';
import { dueStages, hasMetric, hotRefreshDue, parseMetrics, HOUR_MS } from '../xMetrics';
import type { XMetricRow, XTweetRow } from '../schema';

const now = new Date(2026, 9, 5, 12).getTime();
const at = now - 48 * HOUR_MS;
const row = (extra: Partial<XTweetRow> = {}): Partial<XTweetRow> => ({
  text: '我的实践', createdAt: new Date(at).toISOString(), kind: 'post', inReplyTo: '',
  views: 3000, likes: 30, replies: 4, reposts: 5, quotes: 2, bookmarks: 10,
  measuredAt: now, metricMask: 63, format: '文字', gone: false, ...extra,
});
const snapshot = (extra: Partial<XMetricRow> = {}): Partial<XMetricRow> => ({
  tweetId: 'p', stage: 'h24', at: at + 24 * HOUR_MS, views: 100, likes: 3, replies: 4,
  reposts: 1, quotes: 0, bookmarks: 2, metricMask: 63, ownReplies: 1, ...extra,
});
const cohorts = () => cohortPosts(myTweets({ p: row() }), { s: snapshot() }, { p: { topic: '实践' } }, 'h24', 0, now);

describe('honest metric availability', () => {
  it('keeps omitted, null, negative and non-finite metrics unknown, while zero is observed', () => {
    const result = parseMetrics({ views: null, likes: 0, replies: -1, bookmarks: NaN, quotes: 2 });
    expect(result.numbers).toEqual({ likes: 0, quotes: 2 });
    expect(hasMetric({ metricMask: result.mask }, 'views')).toBe(false);
    expect(hasMetric({ metricMask: result.mask }, 'likes')).toBe(true);
  });
  it('reads legacy lifetime totals without inventing historical snapshots', () => {
    expect(hasMetric({ measuredAt: now }, 'views')).toBe(true);
    expect(cohortPosts(myTweets({ p: row() }), {}, {}, 'h24', 0, now)).toEqual([]);
  });
  it('only captures an actual observation shortly after the desired age', () => {
    const createdAt = new Date(at).toISOString();
    expect(dueStages(createdAt, at + 2 * HOUR_MS + 5 * 60_000).map((s) => s.key)).toEqual(['h2']);
    expect(dueStages(createdAt, at + 3 * HOUR_MS)).toEqual([]);
    expect(dueStages(createdAt, at + 25 * HOUR_MS + 1)).toEqual([]);
  });
  it('refreshes young metrics at five-minute intervals without rewriting every minute', () => {
    const young = row({ createdAt: new Date(now - HOUR_MS).toISOString(), measuredAt: now - 60_000 });
    expect(hotRefreshDue(young, now)).toBe(false);
    expect(hotRefreshDue({ ...young, measuredAt: now - 5 * 60_000 }, now)).toBe(true);
  });
});

describe('same-age comparisons', () => {
  it('uses a 24-hour snapshot instead of a later cumulative total and subtracts only self-replies seen then', () => {
    const result = cohorts();
    expect(result[0]).toMatchObject({ views: 100, replies: 3, topic: '实践', observedAt: at + 24 * HOUR_MS });
    expect(result[0].views).not.toBe(3000);
  });
  it('excludes thread parts, conversations, deleted posts, out-of-range posts and bad ages', () => {
    const tweets = myTweets({ p: row(), part: row({ inReplyTo: 'p' }), reply: row({ kind: 'reply', inReplyTo: 'other' }), gone: row({ gone: true }) });
    const metrics = { p: snapshot(), part: snapshot({ tweetId: 'part' }), reply: snapshot({ tweetId: 'reply' }), gone: snapshot({ tweetId: 'gone' }) };
    expect(cohortPosts(tweets, metrics, {}, 'h24', 0, now).map((p) => p.id)).toEqual(['p']);
    expect(cohortPosts(tweets, metrics, {}, 'h24', at + 1, now)).toEqual([]);
    expect(cohortPosts(tweets, { p: snapshot({ at: at + 28 * HOUR_MS }) }, {}, 'h24', 0, now)).toEqual([]);
    expect(cohortPosts(tweets, { p: snapshot({ metricMask: 62 }) }, {}, 'h24', 0, now)).toEqual([]);
  });
  it('uses medians, preserves missing numerator metrics and shows sample size', () => {
    const base = cohorts()[0];
    const posts = [base, { ...base, id: 'q', views: 200, bookmarks: 100, metricMask: 31 }, { ...base, id: 'r', views: 10000, bookmarks: 20 }];
    const groups = groupCohorts(posts, 'topic');
    expect(groups[0]).toMatchObject({ posts: 3, days: 1, medianViews: 200 });
    expect(groups[0].bookmarksPerThousand).toBeCloseTo(22 / 10100 * 1000);
    expect(groupCohorts([{ ...base, metricMask: 1 }], 'topic')[0].bookmarksPerThousand).toBeNull();
  });
  it('suggests a topic but requires a saved label for grouping', () => {
    expect(suggestTopic('Codex 让我把 PWA 做好了')).toBe('AI / 产品实践');
    expect(cohortPosts(myTweets({ p: row({ text: 'Codex' }) }), { p: snapshot() }, {}, 'h24', 0, now)[0].topic).toBe('未分类');
  });
});

describe('experiments and reply review', () => {
  it('does not declare a winner from tiny samples or old posts before enrollment', () => {
    const base = cohorts()[0];
    const experiment = { dimension: 'topic', a: 'A', b: 'B', startedAt: base.at - 1, endedAt: 0 };
    const a = { ...base, topic: 'A' }, b = { ...base, id: 'b', topic: 'B', views: 10 };
    expect(experimentResult(experiment, [a, b], [a, b], {}).winner).toBeNull();
    expect(experimentResult({ ...experiment, startedAt: base.at + 1 }, [a, b], [a, b], {}).a.posts).toBe(0);
  });
  it('counts an experiment independently of the view period and requires observations on multiple days', () => {
    const base = cohorts()[0];
    const posts: CohortPost[] = Array.from({ length: 10 }, (_, i) => ({ ...base, id: String(i), at: base.at + (i % 2) * 24 * HOUR_MS, topic: i < 5 ? 'A' : 'B', views: i < 5 ? 100 : 50 }));
    const result = experimentResult({ dimension: 'topic', a: 'A', b: 'B', startedAt: base.at - 1, endedAt: now }, posts, posts, {});
    expect(result).toMatchObject({ enough: true, winner: 'A' });
    expect(experimentResult({ dimension: 'topic', a: 'A', b: 'B', startedAt: base.at - 1 }, posts, posts.map((p) => ({ ...p, at: base.at })), {}).winner).toBeNull();
  });
  it('shows observed reply-count changes, and stops after manual review until the count increases', () => {
    const tweets = myTweets({ p: row() });
    expect(replyQueue(tweets, {}, now)).toHaveLength(1);
    expect(replyQueue(tweets, { p: { reviewedReplies: 4, reviewedAt: now } }, now)).toEqual([]);
    expect(replyQueue(myTweets({ p: row({ replies: 5 }) }), { p: { reviewedReplies: 4 } }, now)).toHaveLength(1);
  });
});

describe('follower observations', () => {
  it('preserves both sides of a local midnight rather than overwriting the same UTC day', () => {
    const local = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
    const points = {
      first: { followers: 100, following: 10, at: local(1, 23) },
      next: { followers: 110, following: 10, at: local(2, 18) },
      last: { followers: 120, following: 10, at: local(3, 2) },
    };
    expect(followerTrend(points, '2026-10-03', local(3, 12), 3).days).toEqual([
      { key: '2026-10-01', gain: null }, { key: '2026-10-02', gain: 10 }, { key: '2026-10-03', gain: 10 },
    ]);
  });
  it('does not turn absent history into zero growth', () => {
    expect(followerTrend({}, '2026-10-05', now).week).toBeNull();
    expect(followerTrend({ one: { followers: 10, at: now } }, '2026-10-05', now).days.at(-1)?.gain).toBeNull();
  });
});
