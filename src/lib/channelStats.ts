import type { ChannelMetricsRow, ChannelPostRow } from './schema';

const DAY = 24 * 3600_000;

/** The numbers shown for a platform; null where Buffer reported none of them. */
export interface ChannelTotals {
  views: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  quotes: number | null;
  subscriptions: number | null;
}

export interface ChannelStatsPost {
  id: string;
  kind: 'post' | 'reply';
  at: number;
  link: string;
  /** Null until Buffer has read the post's numbers (up to a day after it went out). */
  metrics: ChannelTotals | null;
}

/** A reported count, or null: Buffer stores -1 for one the network did not report. */
const known = (value: number | undefined) => (typeof value === 'number' && value >= 0 ? value : null);

function postTotals(row: ChannelMetricsRow): ChannelTotals {
  const free = known(row.freeSubscriptions);
  const paid = known(row.paidSubscriptions);
  return {
    // Threads reports views, Substack impressions: either is how often it was seen.
    views: known(row.views) ?? known(row.impressions),
    reactions: known(row.reactions),
    comments: known(row.comments),
    reposts: known(row.reposts),
    quotes: known(row.quotes),
    subscriptions: free === null && paid === null ? null : (free ?? 0) + (paid ?? 0),
  };
}

/** What went out to one platform in the last `days`, newest first, with what Buffer reported for it. */
export function channelStats(
  rows: Record<string, ChannelPostRow>,
  metrics: Record<string, ChannelMetricsRow>,
  days: number,
  now: number,
) {
  const since = now - days * DAY;
  const posts: ChannelStatsPost[] = Object.entries(rows)
    .filter(([, row]) => row.state === 'sent' && row.at >= since)
    .sort(([, a], [, b]) => b.at - a.at)
    .map(([id, row]) => {
      const measured = metrics[id];
      return { id, kind: row.kind, at: row.at, link: row.link, metrics: measured && measured.measuredAt > 0 ? postTotals(measured) : null };
    });
  const totals: ChannelTotals = { views: null, reactions: null, comments: null, reposts: null, quotes: null, subscriptions: null };
  for (const post of posts) {
    if (!post.metrics) continue;
    for (const key of Object.keys(totals) as Array<keyof ChannelTotals>) {
      const value = post.metrics[key];
      if (value !== null) totals[key] = (totals[key] ?? 0) + value;
    }
  }
  const values = Object.values(rows);
  return {
    posts,
    totals,
    measured: posts.filter((post) => post.metrics).length,
    measuredAt: Math.max(0, ...Object.values(metrics).map((row) => row.measuredAt)),
    pending: values.filter((row) => row.state === 'queued' || row.state === 'sending' || row.state === 'publishing').length,
    failed: values.filter((row) => row.state === 'failed').length,
  };
}
