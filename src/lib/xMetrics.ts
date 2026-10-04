import type { XTweetRow } from './schema';

export const HOUR_MS = 3600_000;
export const METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes', 'bookmarks'] as const;
export type Metric = typeof METRICS[number];
export const STAGES = [
  { key: 'm30', label: '30 分钟', age: HOUR_MS / 2, grace: 10 * 60_000 },
  { key: 'h2', label: '2 小时', age: 2 * HOUR_MS, grace: 10 * 60_000 },
  { key: 'h24', label: '24 小时', age: 24 * HOUR_MS, grace: HOUR_MS },
  { key: 'h48', label: '48 小时', age: 48 * HOUR_MS, grace: HOUR_MS },
] as const;
export type Stage = typeof STAGES[number]['key'];

export function metricBit(key: Metric): number {
  return 1 << METRICS.indexOf(key);
}

export function hasMetric(row: { metricMask?: number; measuredAt?: number }, key: Metric): boolean {
  const mask = row.metricMask ?? -1;
  // Old rows have valid cumulative counts, but never stand in for old snapshots.
  return mask === -1 ? (row.measuredAt ?? 0) > 0 : (mask & metricBit(key)) !== 0;
}

/** Preserve absence: a metric omitted by the provider is not an observed zero. */
export function parseMetrics(value: Record<string, unknown>): { numbers: Partial<Record<Metric, number>>; mask: number } {
  const numbers: Partial<Record<Metric, number>> = {};
  let mask = 0;
  for (const key of METRICS) {
    const number = value[key];
    if (typeof number === 'number' && Number.isFinite(number) && number >= 0) {
      numbers[key] = number;
      mask |= metricBit(key);
    }
  }
  return { numbers, mask };
}

export function dueStages(createdAt: string, now: number) {
  const age = now - Date.parse(createdAt);
  return STAGES.filter((stage) => age >= stage.age && age <= stage.age + stage.grace);
}

/** Reuse the newest timeline response for hot posts; no extra request per minute. */
export function hotRefreshDue(row: Partial<XTweetRow>, now: number): boolean {
  const age = now - Date.parse(row.createdAt ?? '');
  return age >= 0 && age <= 2 * HOUR_MS + 10 * 60_000 && now - (row.measuredAt ?? 0) >= 5 * 60_000;
}
