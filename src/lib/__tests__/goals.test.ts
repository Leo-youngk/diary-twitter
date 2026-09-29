import { describe, expect, it } from 'vitest';
import { goalTotals, isComplete, lastUnfinishedDay, perfectStreak, type DayProgress } from '../goals';
import { addDays, daysBetween, relativeDayName } from '../utils';

const map = (entries: Record<string, [number, number]>) =>
  new Map<string, DayProgress>(Object.entries(entries).map(([day, [done, total]]) => [day, { done, total }]));

describe('day keys', () => {
  it('moves across months, years and DST without drifting', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(29);
    expect(daysBetween('2026-10-01', '2026-09-30')).toBe(-1);
  });

  it('names nearby days', () => {
    expect(relativeDayName('2026-09-30', '2026-09-30')).toBe('今天');
    expect(relativeDayName('2026-09-29', '2026-09-30')).toBe('昨天');
    expect(relativeDayName('2026-10-01', '2026-09-30')).toBe('明天');
    expect(relativeDayName('2026-09-20', '2026-09-30')).toBe('9月20日');
  });
});

describe('isComplete', () => {
  it('needs at least one goal, all done', () => {
    expect(isComplete(undefined)).toBe(false);
    expect(isComplete({ done: 0, total: 0 })).toBe(false);
    expect(isComplete({ done: 1, total: 2 })).toBe(false);
    expect(isComplete({ done: 2, total: 2 })).toBe(true);
  });
});

describe('perfectStreak', () => {
  it('counts back from today when today is complete', () => {
    expect(perfectStreak(map({ '2026-09-28': [1, 1], '2026-09-29': [2, 2], '2026-09-30': [3, 3] }), '2026-09-30')).toBe(3);
  });

  it('keeps the run that ended yesterday while today is unfinished', () => {
    expect(perfectStreak(map({ '2026-09-28': [1, 1], '2026-09-29': [2, 2], '2026-09-30': [1, 3] }), '2026-09-30')).toBe(2);
    expect(perfectStreak(map({ '2026-09-29': [2, 2] }), '2026-09-30')).toBe(1);
  });

  it('is broken by a day without goals or with unfinished ones', () => {
    expect(perfectStreak(map({ '2026-09-27': [1, 1], '2026-09-29': [1, 1] }), '2026-09-30')).toBe(1);
    expect(perfectStreak(map({ '2026-09-28': [1, 1], '2026-09-29': [0, 1] }), '2026-09-30')).toBe(0);
    expect(perfectStreak(new Map(), '2026-09-30')).toBe(0);
  });
});

describe('goalTotals', () => {
  const progress = map({ '2026-09-01': [1, 2], '2026-09-20': [3, 3], '2026-09-30': [0, 1], '2026-10-01': [0, 2] });

  it('sums the days in range, future days excluded', () => {
    expect(goalTotals(progress, '2026-09-20', '2026-09-30')).toEqual({ total: 4, done: 3, days: 2, perfectDays: 1 });
  });

  it('has no lower bound for everything', () => {
    expect(goalTotals(progress, '', '2026-09-30')).toEqual({ total: 6, done: 4, days: 3, perfectDays: 1 });
  });
});

describe('lastUnfinishedDay', () => {
  it('offers the latest earlier day with goals when some were left', () => {
    expect(lastUnfinishedDay(map({ '2026-09-27': [0, 2], '2026-09-29': [1, 3] }), '2026-09-30')).toBe('2026-09-29');
  });

  it('offers nothing when that day was finished, even if an older one was not', () => {
    expect(lastUnfinishedDay(map({ '2026-09-27': [0, 2], '2026-09-29': [3, 3] }), '2026-09-30')).toBeNull();
  });

  it('ignores today, the future and anything older than a week', () => {
    expect(lastUnfinishedDay(map({ '2026-09-30': [0, 1], '2026-10-01': [0, 1] }), '2026-09-30')).toBeNull();
    expect(lastUnfinishedDay(map({ '2026-09-20': [0, 1] }), '2026-09-30')).toBeNull();
  });
});
