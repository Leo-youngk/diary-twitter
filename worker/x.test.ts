import { describe, expect, it } from 'vitest';
import { findCandidates, initialState, type XCandidate } from './x';

const HOUR = 3600_000;
const now = Date.parse('2026-09-30T12:00:00.000Z');
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('findCandidates', () => {
  const posts = {
    a: { entryType: 'thought', content: '第一条', createdAt: iso(3 * HOUR), xSync: true },
    b: { entryType: 'thought', content: '不发', createdAt: iso(2 * HOUR), xSync: false },
    c: { entryType: 'diary', content: '旧日记', createdAt: iso(2 * HOUR), xSync: true },
    d: { entryType: 'thought', content: '   ', createdAt: iso(HOUR), xSync: true },
  };
  const replies = {
    r1: { postId: 'a', content: '追加', createdAt: iso(HOUR), xSync: true },
    r2: { postId: 'b', content: '原帖没发', createdAt: iso(HOUR), xSync: true },
    r3: { postId: 'a', content: '不发', createdAt: iso(HOUR), xSync: false },
  };

  it('takes 随想 and replies that asked for X, parent first, oldest first', () => {
    const found = findCandidates(posts, replies, new Set());
    expect(found.map((c) => c.id)).toEqual(['a', 'r1']);
    expect(found[1]).toMatchObject({ kind: 'reply', parent: 'a', text: '追加' });
  });

  it('skips anything the ledger already knows', () => {
    expect(findCandidates(posts, replies, new Set(['a'])).map((c) => c.id)).toEqual(['r1']);
    expect(findCandidates(posts, replies, new Set(['a', 'r1']))).toEqual([]);
  });

  it('puts a post before a reply created at the same moment', () => {
    const at = iso(HOUR);
    const found = findCandidates(
      { p: { entryType: 'thought', content: 'x', createdAt: at, xSync: true } },
      { q: { postId: 'p', content: 'y', createdAt: at, xSync: true } },
      new Set(),
    );
    expect(found.map((c) => c.kind)).toEqual(['post', 'reply']);
  });
});

describe('initialState', () => {
  const candidate = (text: string, msAgo: number): XCandidate => ({ id: 'a', kind: 'post', parent: '', text, createdAt: iso(msAgo) });

  it('queues a fresh post that fits', () => {
    expect(initialState(candidate('今天', HOUR), now, true)).toEqual({ state: 'queued', error: '' });
  });

  it('fails loudly without Buffer, when too long, or when stale', () => {
    expect(initialState(candidate('今天', HOUR), now, false).state).toBe('failed');
    expect(initialState(candidate('字'.repeat(141), HOUR), now, true).error).toContain('长度');
    expect(initialState(candidate('今天', 73 * HOUR), now, true).error).toContain('3 天');
  });
});
