import { median, myTweets, type MyTweet } from './growth';
import type { XFollowersRow, XMetricRow, XTweetRow } from './schema';
import { hasMetric, HOUR_MS, STAGES, type Metric } from './xMetrics';

const DAY = 24 * HOUR_MS;
const REACTIONS: Metric[] = ['likes', 'replies', 'reposts', 'quotes', 'bookmarks'];
export type Entry = 'original' | 'reply' | 'thread';
export interface InsightPost extends MyTweet {
  entry: Entry;
  reactions: number;
  reactionsComplete: boolean;
}

function reactionCount(post: MyTweet): number {
  return REACTIONS.reduce((sum, key) => sum + (hasMetric(post, key) ? post[key] : 0), 0);
}

function completeReactions(post: MyTweet): boolean {
  return REACTIONS.every((key) => hasMetric(post, key));
}

function pointAt24h(post: InsightPost, metrics: Record<string, Partial<XMetricRow>>, now: number): InsightPost | null {
  const checkpoint = STAGES.find((stage) => stage.key === 'h24')!;
  const point = Object.values(metrics).filter((row) => row.tweetId === post.id && row.stage === 'h24'
    && (row.at ?? 0) <= now && (row.at ?? 0) - post.at >= checkpoint.age
    && (row.at ?? 0) - post.at <= checkpoint.age + checkpoint.grace
    && hasMetric(row, 'views') && typeof row.views === 'number' && Number.isFinite(row.views) && row.views >= 0)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0];
  if (!point) return null;
  const observed = {
    ...post, measuredAt: point.at!, metricMask: point.metricMask ?? 0,
    views: point.views!, likes: point.likes ?? 0, bookmarks: point.bookmarks ?? 0,
    replies: Math.max(0, (point.replies ?? 0) - (point.ownReplies ?? 0)),
    reposts: point.reposts ?? 0, quotes: point.quotes ?? 0,
  };
  return { ...observed, reactions: reactionCount(observed), reactionsComplete: completeReactions(observed) };
}

function summarize(posts: InsightPost[]) {
  const known = posts.filter((post) => hasMetric(post, 'views'));
  // Positive known counts establish feedback; incomplete all-zero rows stay unknown.
  const feedbackKnown = known.filter((post) => post.reactions > 0 || post.reactionsComplete);
  return { count: known.length, medianViews: known.length ? median(known.map((post) => post.views)) : null,
    responded: feedbackKnown.filter((post) => post.reactions > 0).length, feedbackKnown: feedbackKnown.length };
}

/** Descriptive evidence, never a reconstructed For You score or follow attribution. */
export function xInsights(rows: Record<string, Partial<XTweetRow>>, metrics: Record<string, Partial<XMetricRow>>, days: number, now: number) {
  const from = now - days * DAY;
  const posts: InsightPost[] = myTweets(rows).filter((post) => post.at >= from && post.at <= now).map((post) => {
    const parent = rows[post.id]?.inReplyTo;
    const entry: Entry = parent && rows[parent] ? 'thread' : post.original ? 'original' : post.reply ? 'reply' : 'thread';
    return { ...post, entry, reactions: reactionCount(post), reactionsComplete: completeReactions(post) };
  }).sort((a, b) => b.at - a.at);

  // An old post last measured at 20 minutes is not a mature observation.
  const mature = posts.filter((post) => post.entry !== 'thread' && post.measured && post.measuredAt <= now
    && post.measuredAt - post.at >= DAY && hasMetric(post, 'views'));
  const originals = mature.filter((post) => post.entry === 'original');
  const replies = mature.filter((post) => post.entry === 'reply');
  const originalPoints = originals.flatMap((post) => pointAt24h(post, metrics, now) ?? []);
  const replyPoints = replies.flatMap((post) => pointAt24h(post, metrics, now) ?? []);
  // Use same-age checkpoints once they cover at least half of BOTH entries.
  // Retain usable history until then, labelled cumulative rather than an empty experiment.
  const sameAge = originalPoints.length > 0 && replyPoints.length > 0
    && originalPoints.length >= originals.length / 2 && replyPoints.length >= replies.length / 2;
  const comparison = { basis: sameAge ? 'h24' as const : 'cumulative' as const,
    original: summarize(sameAge ? originalPoints : originals), reply: summarize(sameAge ? replyPoints : replies) };

  // Concrete text with actual feedback is a writing seed; views alone do not establish interest.
  const seeds = mature.filter((post) => post.reactions > 0 && post.text.replace(/^\s*@\w+\s*/, '').trim().length >= 30)
    .sort((a, b) => b.reactions - a.reactions || b.views - a.views || b.at - a.at).slice(0, 3);
  const noFeedback = [...replies].filter((post) => post.reactionsComplete && post.reactions === 0)
    .sort((a, b) => b.views - a.views)[0] ?? null;
  return { posts, comparison, seeds, noFeedback, originalCount: posts.filter((post) => post.entry === 'original').length,
    replyCount: posts.filter((post) => post.entry === 'reply').length };
}

/** Exact observed interval. An hour of history is never labelled a week of growth. */
export function followerChange(rows: Record<string, Partial<XFollowersRow>>, days: number, now: number) {
  const points = Object.values(rows).filter((row): row is XFollowersRow => typeof row.at === 'number' && row.at > 0 && row.at <= now
    && typeof row.followers === 'number' && Number.isFinite(row.followers) && row.followers >= 0).sort((a, b) => a.at - b.at);
  const from = now - days * DAY;
  const base = points.filter((point) => point.at <= from).at(-1) ?? points.find((point) => point.at > from);
  const latest = points.at(-1);
  return base && latest && latest.at > base.at ? { gain: latest.followers - base.followers, from: base.at, to: latest.at } : null;
}

export function writingPrompt(source?: InsightPost): string {
  if (!source) return '写一件你亲自经历或解决的小事：发生了什么 → 你怎么做 → 得到了什么结果。给有同样处境的人留一个能接话的细节。';
  const text = source.text.replace(/^\s*@\w+\s*/, '').trim();
  const approach = source.entry === 'reply'
    ? '把当时帮助对方的经验写给有同样问题的人：具体情境 → 操作步骤 → 实际结果或限制。只写你亲自验证过的部分。'
    : '接着这个想法，补一个具体经历、结果或反例：发生了什么 → 你做了什么 → 现在怎么想。';
  return `参考你之前的${source.entry === 'reply' ? '回复' : '原创'}：\n${text.slice(0, 140)}${text.length > 140 ? '…' : ''}\n\n${approach}`;
}

export function discoveryTakeaway(comparison: ReturnType<typeof xInsights>['comparison']): string | null {
  const { original, reply } = comparison;
  if (original.medianViews === null || reply.medianViews === null || !original.feedbackKnown || !reply.feedbackKnown) return null;
  const originalFeedback = original.responded / original.feedbackKnown;
  const replyFeedback = reply.responded / reply.feedbackKnown;
  if (reply.medianViews > original.medianViews && originalFeedback > replyFeedback) {
    return '这批记录里，回复浏览更高，原创留下互动的比例更高。用回复发现话题，再用原创接住交流。';
  }
  if (reply.medianViews > original.medianViews) return '这批记录里，回复带来更多浏览。先在相关讨论里分享经验，再展开收到回应的内容。';
  if (originalFeedback > 0) return '这批原创有读者反馈。继续写有人回应的内容，再补一个能接话的具体细节。';
  return null;
}

/** Search the source's actual subject, without stored tags or invented target accounts. */
export function discussionSearch(source: InsightPost | undefined, handle: string): string | null {
  if (!source) return null;
  const term = source.text.match(/Claude|GitHub|Codex|Grok|微信读书|自媒体|创作者|深蹲|读书|电影|父母|亲情|长辈|\bAI\b/i)?.[0]
    ?? source.text.match(/《([^》]{1,20})》/)?.[1];
  if (!term) return null;
  const exclusion = /^[A-Za-z0-9_]{1,15}$/.test(handle) ? ` -from:${handle}` : '';
  return `https://x.com/search?q=${encodeURIComponent(`${term} lang:zh -filter:retweets${exclusion}`)}&f=live`;
}
