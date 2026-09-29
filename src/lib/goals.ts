import { addDays } from './utils';

/** How far a day's goal list got. */
export interface DayProgress {
  total: number;
  done: number;
}

export function isComplete(progress: DayProgress | undefined): boolean {
  return Boolean(progress && progress.total > 0 && progress.done === progress.total);
}

/**
 * Days in a row, up to today, on which every goal was done. Today only counts
 * once it is complete; until then the run that ended yesterday still stands.
 */
export function perfectStreak(progress: ReadonlyMap<string, DayProgress>, today: string): number {
  let day = isComplete(progress.get(today)) ? today : addDays(today, -1);
  let streak = 0;
  while (isComplete(progress.get(day))) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export interface GoalTotals {
  /** Goals written for days in the range. */
  total: number;
  done: number;
  /** Days in the range that had goals. */
  days: number;
  /** Days in the range on which every goal was done. */
  perfectDays: number;
}

/** Goals of the days from `from` to `to` inclusive ('' for no lower bound). */
export function goalTotals(progress: ReadonlyMap<string, DayProgress>, from: string, to: string): GoalTotals {
  const totals: GoalTotals = { total: 0, done: 0, days: 0, perfectDays: 0 };
  for (const [day, entry] of progress) {
    if (day > to || (from && day < from) || entry.total === 0) continue;
    totals.total += entry.total;
    totals.done += entry.done;
    totals.days += 1;
    if (entry.done === entry.total) totals.perfectDays += 1;
  }
  return totals;
}

/**
 * The most recent day before `today` (within `lookback` days) that had goals,
 * if some of them were left undone — the ones worth carrying over.
 */
export function lastUnfinishedDay(progress: ReadonlyMap<string, DayProgress>, today: string, lookback = 7): string | null {
  const earliest = addDays(today, -lookback);
  let latest: string | null = null;
  for (const [day, entry] of progress) {
    if (day >= today || day < earliest || entry.total === 0) continue;
    if (!latest || day > latest) latest = day;
  }
  if (!latest) return null;
  const entry = progress.get(latest)!;
  return entry.done < entry.total ? latest : null;
}
