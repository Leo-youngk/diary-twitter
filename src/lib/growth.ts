import type { XExperimentRow, XFollowersRow, XLabelRow, XMetricRow, XTweetRow } from './schema';
import { addDays, parseDateKey, toLocalDateKey } from './utils';
import { hasMetric, HOUR_MS, STAGES, type Metric, type Stage } from './xMetrics';

export const MIN_COHORT = 5;
export const TOPICS = ['AI / 产品实践', '读书 / 思考', '工作 / 行业', '生活记录'] as const;
export const FORMATS = ['文字', '图文', '视频', '引用'] as const;
export const HOURS = Array.from({ length: 6 }, (_, i) => `${i * 4}–${(i + 1) * 4} 点`);
export type Dimension = 'topic' | 'format' | 'hour';

export interface MyTweet {
  id: string;
  text: string;
  at: number;
  original: boolean;
  reply: boolean;
  measured: boolean;
  measuredAt: number;
  metricMask: number;
  format: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  bookmarks: number;
}

/** Cumulative public numbers; a total view is not a unique viewer or a Home impression. */
export function myTweets(rows: Record<string, Partial<XTweetRow>>): MyTweet[] {
  const ownAnswers = new Map<string, number>();
  for (const row of Object.values(rows)) {
    if (!row.gone && row.inReplyTo) ownAnswers.set(row.inReplyTo, (ownAnswers.get(row.inReplyTo) ?? 0) + 1);
  }
  return Object.entries(rows).flatMap(([id, row]) => {
    const at = Date.parse(row.createdAt ?? '');
    if (row.gone || !Number.isFinite(at)) return [];
    return [{
      id, text: row.text ?? '', at, original: row.kind !== 'reply' && !row.inReplyTo,
      reply: row.kind === 'reply', measured: (row.measuredAt ?? 0) > 0,
      measuredAt: row.measuredAt ?? 0, metricMask: row.metricMask ?? -1, format: row.format ?? '',
      views: row.views ?? 0, likes: row.likes ?? 0,
      replies: Math.max(0, (row.replies ?? 0) - (ownAnswers.get(id) ?? 0)),
      reposts: row.reposts ?? 0, quotes: row.quotes ?? 0, bookmarks: row.bookmarks ?? 0,
    }];
  }).sort((a, b) => a.at - b.at);
}

/** Suggestions only: never silently classify a post on the user's behalf. */
export function suggestTopic(text: string): string {
  if (/\b(ai|llm|agent|gpt|claude|codex|pwa|openwebui|vllm)\b|人工智能|大模型|编程|开源|产品|部署/i.test(text)) return TOPICS[0];
  if (/读书|阅读|小说|哲学|罗素|庄子|幸福|人生|存在主义|《/.test(text)) return TOPICS[1];
  if (/压缩机|热泵|制冷|研发|汽车|工厂|行业|基金|投资|财报/.test(text)) return TOPICS[2];
  return TOPICS[3];
}

export interface CohortPost extends MyTweet {
  observedAt: number;
  topic: string;
  hour: string;
}

/** Same-age observations only. Missing historical checkpoints are intentionally unknown. */
export function cohortPosts(tweets: MyTweet[], metrics: Record<string, Partial<XMetricRow>>, labels: Record<string, Partial<XLabelRow>>,
  stage: Stage, from: number, now: number): CohortPost[] {
  const checkpoint = STAGES.find((s) => s.key === stage)!;
  const eligible = new Map(tweets.filter((t) => t.original && t.at >= from && t.at <= now).map((t) => [t.id, t]));
  const chosen = new Map<string, CohortPost>();
  for (const row of Object.values(metrics)) {
    const t = eligible.get(row.tweetId ?? '');
    if (!t || row.stage !== stage || !hasMetric(row, 'views') || typeof row.views !== 'number' || !Number.isFinite(row.views) || row.views < 0) continue;
    const at = row.at ?? 0;
    const age = at - t.at;
    if (at > now || age < checkpoint.age || age > checkpoint.age + checkpoint.grace) continue;
    if (chosen.has(t.id) && chosen.get(t.id)!.observedAt <= at) continue;
    chosen.set(t.id, {
      ...t, measured: true, observedAt: at, metricMask: row.metricMask ?? 0,
      views: row.views, likes: row.likes ?? 0, replies: Math.max(0, (row.replies ?? 0) - (row.ownReplies ?? 0)),
      reposts: row.reposts ?? 0, quotes: row.quotes ?? 0, bookmarks: row.bookmarks ?? 0,
      topic: labels[t.id]?.topic?.trim() || '未分类', format: t.format || '未识别',
      hour: HOURS[Math.floor(new Date(t.at).getHours() / 4)],
    });
  }
  return [...chosen.values()].sort((a, b) => b.at - a.at);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface CohortGroup {
  key: string;
  posts: number;
  days: number;
  medianViews: number;
  likesPerThousand: number | null;
  bookmarksPerThousand: number | null;
  repostsPerThousand: number | null;
  repliesPerThousand: number | null;
}

/** The numerator and denominator use the same posts; omitted counts never become zeros. */
function perThousand(posts: CohortPost[], metric: Metric): number | null {
  const known = posts.filter((p) => hasMetric(p, metric));
  const views = known.reduce((sum, p) => sum + p.views, 0);
  return views > 0 ? known.reduce((sum, p) => sum + p[metric], 0) / views * 1000 : null;
}

export function groupCohorts(posts: CohortPost[], dimension: Dimension): CohortGroup[] {
  const groups = new Map<string, CohortPost[]>();
  for (const post of posts) {
    const key = post[dimension];
    const group = groups.get(key) ?? [];
    group.push(post);
    groups.set(key, group);
  }
  return [...groups].map(([key, group]) => ({
    key, posts: group.length, days: new Set(group.map((p) => toLocalDateKey(p.at))).size,
    medianViews: median(group.map((p) => p.views)),
    likesPerThousand: perThousand(group, 'likes'), bookmarksPerThousand: perThousand(group, 'bookmarks'),
    repostsPerThousand: perThousand(group, 'reposts'), repliesPerThousand: perThousand(group, 'replies'),
  })).sort((a, b) => b.medianViews - a.medianViews || b.posts - a.posts);
}

export function experimentResult(experiment: Partial<XExperimentRow>, tweets: MyTweet[], cohorts: CohortPost[], labels: Record<string, Partial<XLabelRow>>) {
  const dimension = experiment.dimension as Dimension;
  const start = experiment.startedAt ?? Infinity;
  const end = experiment.endedAt || Infinity;
  const inRange = (t: MyTweet) => t.original && t.at >= start && t.at <= end;
  const matching = cohorts.filter(inRange);
  const groups = groupCohorts(matching, dimension);
  const group = (key: string) => groups.find((g) => g.key === key) ?? { key, posts: 0, days: 0, medianViews: 0, likesPerThousand: null, bookmarksPerThousand: null, repostsPerThousand: null, repliesPerThousand: null };
  const posted = (key: string) => tweets.filter(inRange).filter((t) => {
    const value = dimension === 'topic' ? labels[t.id]?.topic : dimension === 'format' ? t.format : HOURS[Math.floor(new Date(t.at).getHours() / 4)];
    return value === key;
  }).length;
  const a = group(experiment.a ?? '');
  const b = group(experiment.b ?? '');
  // Five is an operational minimum, not statistical significance or an X algorithm rule.
  const enough = a.posts >= MIN_COHORT && b.posts >= MIN_COHORT && a.days >= 2 && b.days >= 2;
  const winner = enough && a.medianViews !== b.medianViews ? (a.medianViews > b.medianViews ? a : b).key : null;
  return { a, b, postedA: posted(a.key), postedB: posted(b.key), enough, winner };
}

export function replyQueue(tweets: MyTweet[], labels: Record<string, Partial<XLabelRow>>, now: number) {
  return tweets.filter((t) => t.original && now - t.at <= 14 * 24 * HOUR_MS && hasMetric(t, 'replies')
    && t.replies > (labels[t.id]?.reviewedReplies ?? 0))
    .sort((a, b) => b.at - a.at).slice(0, 3);
}

export interface FollowerTrend {
  week: { gain: number; since: string } | null;
  days: Array<{ key: string; gain: number | null }>;
}

/** Net change between observed counts. This cannot attribute new followers to a single post. */
export function followerTrend(rows: Record<string, Partial<XFollowersRow>>, today: string, now: number, span = 14): FollowerTrend {
  const points = Object.values(rows)
    .filter((row): row is XFollowersRow => (row.at ?? 0) > 0 && typeof row.followers === 'number' && Number.isFinite(row.followers))
    .sort((a, b) => a.at - b.at);
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
  return { week: base === null
    ? { gain: latest - points[0].followers, since: toLocalDateKey(points[0].at) }
    : { gain: latest - base, since: weekStart }, days };
}
