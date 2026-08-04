import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, cn } from '../utils';
import { formatDateCN } from '../export';

afterEach(() => { vi.useRealTimers(); });

function at(now: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
}

describe('formatRelativeTime', () => {
  it('counts seconds under a minute', () => {
    at('2026-03-01T12:00:30Z');
    expect(formatRelativeTime('2026-03-01T12:00:00Z')).toBe('30s');
  });

  it('counts minutes under an hour', () => {
    at('2026-03-01T12:45:00Z');
    expect(formatRelativeTime('2026-03-01T12:00:00Z')).toBe('45m');
  });

  it('counts hours under a day', () => {
    at('2026-03-01T20:00:00Z');
    expect(formatRelativeTime('2026-03-01T12:00:00Z')).toBe('8h');
  });

  it('counts days under a week', () => {
    at('2026-03-04T12:00:00Z');
    expect(formatRelativeTime('2026-03-01T12:00:00Z')).toBe('3d');
  });

  it('falls back to a calendar date past a week', () => {
    at('2026-03-20T12:00:00Z');
    expect(formatRelativeTime('2026-03-01T12:00:00Z')).not.toMatch(/^\d+[smhd]$/);
  });
});

describe('formatDateCN', () => {
  it('zero-pads the time', () => {
    // Built from local-time parts, so construct the input in local time too.
    expect(formatDateCN(new Date(2026, 2, 1, 9, 5).toISOString())).toBe('2026年3月1日 09:05');
  });
});

describe('cn', () => {
  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});
