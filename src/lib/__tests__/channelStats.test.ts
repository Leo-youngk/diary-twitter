import { describe, expect, it } from 'vitest';
import { channelStats } from '../channelStats';
import type { ChannelMetricsRow, ChannelPostRow } from '../schema';

const DAY = 24 * 3600_000;
const now = Date.parse('2026-10-06T12:00:00.000Z');
const row = (state: ChannelPostRow['state'], at: number, kind: ChannelPostRow['kind'] = 'post'): ChannelPostRow => (
  { state, kind, at, link: state === 'sent' ? 'https://www.threads.net/@me/post/1' : '', error: '', command: '' });
const unreported: ChannelMetricsRow = {
  views: -1, impressions: -1, reactions: -1, comments: -1, reposts: -1, quotes: -1, shares: -1, freeSubscriptions: -1, paidSubscriptions: -1, measuredAt: now,
};

describe('channelStats', () => {
  it('counts what went out in the period, newest first, and sums only the numbers Buffer reported', () => {
    const stats = channelStats({
      old: row('sent', now - 10 * DAY),
      a: row('sent', now - 2 * DAY),
      b: row('sent', now - DAY, 'reply'),
      waiting: row('sent', now - 3600_000),
      queued: row('queued', now),
      failed: row('failed', now),
    }, {
      old: { ...unreported, views: 1000 },
      a: { ...unreported, views: 120, reactions: 4, quotes: 1 },
      b: { ...unreported, impressions: 30, reactions: 0, comments: 2, freeSubscriptions: 1, paidSubscriptions: -1 },
      waiting: { ...unreported, measuredAt: 0 },
    }, 7, now);
    expect(stats.posts.map((post) => post.id)).toEqual(['waiting', 'b', 'a']);
    expect(stats.posts[0].metrics).toBeNull();
    expect(stats.posts[1]).toMatchObject({ kind: 'reply', metrics: { views: 30, reactions: 0, comments: 2, reposts: null, subscriptions: 1 } });
    expect(stats.totals).toEqual({ views: 150, reactions: 4, comments: 2, reposts: null, quotes: 1, subscriptions: 1 });
    expect(stats).toMatchObject({ measured: 2, pending: 1, failed: 1, measuredAt: now });
  });

  it('reports nothing rather than zeros before anything was published or measured', () => {
    const stats = channelStats({}, {}, 30, now);
    expect(stats.posts).toEqual([]);
    expect(stats.totals).toEqual({ views: null, reactions: null, comments: null, reposts: null, quotes: null, subscriptions: null });
    expect(stats).toMatchObject({ measured: 0, measuredAt: 0, pending: 0, failed: 0 });
  });
});
