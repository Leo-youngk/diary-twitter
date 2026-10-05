import { describe, expect, it } from 'vitest';
import { followerDays, livePosts, outliers, patterns, pointsAt, review } from '../analysis';
import type { XMetricRow, XTweetRow } from '../schema';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// Local times keep the hour buckets and day boundaries the same in any timezone.
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const now = local(20, 12);
const today = '2026-10-20';
const ALL = 63;

type Rows = Record<string, Partial<XTweetRow>>;
type Metrics = Record<string, Partial<XMetricRow>>;

function post(rows: Rows, id: string, at: number, extra: Partial<XTweetRow> = {}): void {
  rows[id] = { text: `帖子 ${id}`, createdAt: new Date(at).toISOString(), kind: 'post', inReplyTo: '', format: '文字', metricMask: ALL, measuredAt: at + 1, gone: false, ...extra };
}

function read(metrics: Metrics, id: string, stage: 'm30' | 'h2' | 'h24' | 'h48', at: number, views: number, extra: Partial<XMetricRow> = {}): void {
  metrics[`${id}-${stage}`] = { tweetId: id, stage, at, views, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, metricMask: ALL, ownReplies: 0, ...extra };
}

/** An original with a 24-hour reading. */
function day24(rows: Rows, metrics: Metrics, id: string, at: number, views: number, extra: Partial<XTweetRow> = {}, metric: Partial<XMetricRow> = {}): void {
  post(rows, id, at, extra);
  read(metrics, id, 'h24', at + DAY + 5 * 60_000, views, metric);
}

describe('pointsAt', () => {
  it('reads each post at its first observation inside the window, and leaves out thread parts', () => {
    const rows: Rows = {};
    const metrics: Metrics = {};
    post(rows, 'a', local(10, 9));
    read(metrics, 'a', 'h24', local(11, 9, 20), 50, { likes: 2, replies: 3, ownReplies: 1 });
    metrics['a-late'] = { ...metrics['a-h24'], at: local(11, 9, 40), views: 90 };
    post(rows, 'part', local(10, 9, 1), { inReplyTo: 'a' });
    read(metrics, 'part', 'h24', local(11, 9, 20), 10);
    post(rows, 'late', local(10, 12));
    read(metrics, 'late', 'h24', local(11, 14), 70);
    const points = pointsAt(rows, metrics, 'h24', now);
    expect([...points.keys()]).toEqual(['a']);
    expect(points.get('a')).toMatchObject({ views: 50, feedback: 4, feedbackKnown: true, at: local(10, 9), entry: 'original' });
  });

  it('tells no feedback from feedback not reported', () => {
    const rows: Rows = {};
    const metrics: Metrics = {};
    post(rows, 'a', local(10, 9));
    read(metrics, 'a', 'h24', local(11, 9, 5), 50, { metricMask: 1 });
    post(rows, 'b', local(10, 10));
    read(metrics, 'b', 'h24', local(11, 10, 5), 50);
    const points = pointsAt(rows, metrics, 'h24', now);
    expect(points.get('a')).toMatchObject({ feedback: 0, feedbackKnown: false });
    expect(points.get('b')).toMatchObject({ feedback: 0, feedbackKnown: true });
  });
});

describe('livePosts', () => {
  it('sets a fresh post against the usual at the latest checkpoint it reached', () => {
    const rows: Rows = {};
    const metrics: Metrics = {};
    [10, 40, 20, 30, 50].forEach((views, i) => {
      post(rows, `p${i}`, local(15, 8 + i));
      read(metrics, `p${i}`, 'h2', local(15, 10 + i, 5), views);
    });
    post(rows, 'fresh', now - 2 * HOUR - 5 * 60_000);
    read(metrics, 'fresh', 'm30', now - 95 * 60_000, 12);
    read(metrics, 'fresh', 'h2', now - 60_000, 35);
    post(rows, 'new', now - 10 * 60_000);
    expect(livePosts(rows, metrics, now)).toEqual([
      { id: 'fresh', text: '帖子 fresh', at: now - 2 * HOUR - 5 * 60_000, stage: '2 小时', views: 35, usual: 30, rank: 3, of: 6 },
    ]);
  });

  it('shows the reading without a comparison until five earlier posts have one', () => {
    const rows: Rows = {};
    const metrics: Metrics = {};
    post(rows, 'fresh', now - 40 * 60_000);
    read(metrics, 'fresh', 'm30', now - 5 * 60_000, 12);
    expect(livePosts(rows, metrics, now)[0]).toMatchObject({ stage: '30 分钟', views: 12, usual: null, rank: null });
  });
});

describe('outliers and patterns', () => {
  const rows: Rows = {};
  const metrics: Metrics = {};
  [40, 50, 60, 50, 40, 55].forEach((views, i) => day24(rows, metrics, `b${i}`, local(1 + i, 9), views, {}, { likes: i % 2 }));
  day24(rows, metrics, 'hit', local(8, 21), 300, { format: '图文' }, { likes: 9 });
  day24(rows, metrics, 'p2', local(9, 21), 200, { format: '图文' });
  day24(rows, metrics, 'p3', local(10, 22), 150, { format: '图文' }, { bookmarks: 1 });
  const reply = (id: string, day: number, followers: number, minutes: number, views: number, likes: number) => {
    post(rows, id, local(day, 15), { kind: 'reply', inReplyTo: `x${id}`, parentFollowers: followers, parentAt: new Date(local(day, 15) - minutes * 60_000).toISOString() });
    read(metrics, id, 'h24', local(day + 1, 15, 10), views, { likes });
  };
  reply('r1', 11, 500, 10, 10, 0);
  reply('r2', 11, 800, 90, 12, 0);
  reply('r3', 12, 300, 200, 9, 1);
  reply('r4', 12, 50_000, 5, 80, 2);
  reply('r5', 13, 20_000, 20, 60, 1);
  reply('r6', 13, 30_000, 300, 30, 0);
  const points24 = pointsAt(rows, metrics, 'h24', now);

  it('finds posts at twice the median of the ten before them', () => {
    expect(outliers(points24, 0).map(({ id, usual, ratio }) => [id, usual, Number(ratio.toFixed(2))])).toEqual([
      ['hit', 50, 6], ['p2', 50, 4], ['p3', 52.5, 2.86],
    ]);
    // Only posts in the range are listed, though earlier ones still make the baseline.
    expect(outliers(points24, local(9, 0)).map((o) => o.id)).toEqual(['p2', 'p3']);
  });

  it('compares formats, hours and replies only where two groups have three posts each', () => {
    const found = patterns(points24, 0);
    expect(found.formats).toEqual([
      { key: '文字', posts: 6, medianViews: 50, responded: 3, known: 6 },
      { key: '图文', posts: 3, medianViews: 200, responded: 2, known: 3 },
    ]);
    expect(found.hours).toEqual([
      { key: '8–12 点', posts: 6, medianViews: 50, responded: 3, known: 6 },
      { key: '20–24 点', posts: 3, medianViews: 200, responded: 2, known: 3 },
    ]);
    expect(found.targets).toEqual([
      { key: '不到 1 千粉', posts: 3, medianViews: 10, responded: 1, known: 3 },
      { key: '1 万–10 万粉', posts: 3, medianViews: 60, responded: 2, known: 3 },
    ]);
    // Only one delay has three replies, so there is nothing to compare it with.
    expect(found.delays).toEqual([]);
  });

  it('turns the clearest patterns into at most three next steps', () => {
    const result = review(rows, metrics, {}, now);
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]).toContain('近 48 小时没有原创');
    expect(result.actions[1]).toContain('「帖子 hit」24 小时的浏览是之前帖子中位数的 6.0 倍');
    expect(result.actions[2]).toContain('「图文」原创 24 小时浏览中位数是「文字」的 4.0 倍');
  });
});

describe('review weeks', () => {
  it('sets the last 7 days against the 7 before', () => {
    const rows: Rows = {};
    const metrics: Metrics = {};
    day24(rows, metrics, 'old', now - 10 * DAY, 40);
    day24(rows, metrics, 'a', now - 5 * DAY, 100, {}, { likes: 1 });
    day24(rows, metrics, 'b', now - 3 * DAY, 60);
    post(rows, 'c', now - 3 * HOUR);
    post(rows, 'r', now - 2 * DAY, { kind: 'reply', inReplyTo: 'other' });
    const result = review(rows, metrics, {
      a: { followers: 10, following: 1, at: now - 12 * DAY },
      b: { followers: 15, following: 1, at: now - 4 * DAY },
    }, now);
    expect(result.thisWeek).toEqual({ originals: 3, replies: 1, followers: { gain: 5, since: null }, medianViews: 80, responded: 1, known: 2 });
    expect(result.lastWeek).toEqual({ originals: 1, replies: 0, followers: { gain: 0, since: now - 12 * DAY }, medianViews: 40, responded: 0, known: 1 });
  });

  it('counts from the first reading when the history is shorter than the week', () => {
    const result = review({}, {}, { a: { followers: 28, following: 1, at: now - 2 * DAY }, b: { followers: 31, following: 1, at: now - HOUR } }, now);
    expect(result.thisWeek.followers).toEqual({ gain: 3, since: now - 2 * DAY });
    expect(result.lastWeek.followers).toBeNull();
    expect(result.actions).toEqual([]);
  });
});

describe('followerDays', () => {
  it('gives the net change of each local day the readings cover', () => {
    const days = followerDays({
      a: { followers: 10, following: 1, at: local(17, 9) },
      b: { followers: 13, following: 1, at: local(18, 9) },
      c: { followers: 12, following: 1, at: local(19, 9) },
      d: { followers: 20, following: 1, at: local(20, 9) },
    }, today, now, 4);
    expect(days).toEqual([
      { key: '2026-10-17', gain: null },
      { key: '2026-10-18', gain: 3 },
      { key: '2026-10-19', gain: -1 },
      { key: '2026-10-20', gain: 8 },
    ]);
  });
});
