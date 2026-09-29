import { describe, expect, it } from 'vitest';
import { cn, formatCompactTime, formatDateCN, formatRelativeTime, toLocalDateKey } from '../utils';

const now = new Date(2026, 8, 29, 14, 30, 0);

describe('formatRelativeTime', () => {
  it('says 刚刚 under a minute', () => {
    expect(formatRelativeTime(new Date(2026, 8, 29, 14, 29, 40).toISOString(), now)).toBe('刚刚');
  });

  it('counts minutes and hours in Chinese', () => {
    expect(formatRelativeTime(new Date(2026, 8, 29, 13, 45).toISOString(), now)).toBe('45分钟前');
    expect(formatRelativeTime(new Date(2026, 8, 29, 6, 30).toISOString(), now)).toBe('8小时前');
  });

  it('shows 昨天 with the time for the previous calendar day beyond 24 hours', () => {
    expect(formatRelativeTime(new Date(2026, 8, 28, 9, 5).toISOString(), now)).toBe('昨天 09:05');
  });

  it('falls back to a date, with the year only when it differs', () => {
    expect(formatRelativeTime(new Date(2026, 8, 21, 9, 0).toISOString(), now)).toBe('9月21日');
    expect(formatRelativeTime(new Date(2025, 11, 31, 9, 0).toISOString(), now)).toBe('2025年12月31日');
  });
});

describe('formatCompactTime', () => {
  it('uses X-style short units within a week', () => {
    expect(formatCompactTime(new Date(2026, 8, 29, 14, 29, 40).toISOString(), now)).toBe('刚刚');
    expect(formatCompactTime(new Date(2026, 8, 29, 14, 25).toISOString(), now)).toBe('5m');
    expect(formatCompactTime(new Date(2026, 8, 29, 12, 30).toISOString(), now)).toBe('2h');
    expect(formatCompactTime(new Date(2026, 8, 26, 14, 30).toISOString(), now)).toBe('3d');
  });

  it('switches to a date after a week', () => {
    expect(formatCompactTime(new Date(2026, 8, 1).toISOString(), now)).toBe('9月1日');
    expect(formatCompactTime(new Date(2025, 0, 5).toISOString(), now)).toBe('2025年1月5日');
  });
});

describe('formatDateCN', () => {
  it('zero-pads the time', () => {
    expect(formatDateCN(new Date(2026, 2, 1, 8, 5).toISOString())).toBe('2026年3月1日 08:05');
  });
});

describe('toLocalDateKey', () => {
  it('uses the local calendar day', () => {
    expect(toLocalDateKey(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
  });
});

describe('cn', () => {
  it('drops falsy parts', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });
});
