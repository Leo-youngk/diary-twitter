import { describe, expect, it, vi } from 'vitest';

// parseBackup is pure; the store and image modules need a browser, so they are stubbed.
vi.mock('../store', () => ({ store: {} }));
vi.mock('../blobs', () => ({}));

const { parseBackup } = await import('../backup');

describe('parseBackup', () => {
  it('reads a current backup with goals', () => {
    const parsed = parseBackup({
      version: 2,
      exportedAt: '2026-09-30T00:00:00.000Z',
      posts: { p: { entryType: 'thought', content: 'x', createdAt: '2026-09-30T00:00:00.000Z' } },
      replies: {},
      goals: {
        g1: { day: '2026-09-30', text: '跑步', done: true, createdAt: '2026-09-30T01:00:00.000Z' },
        'bad id': { day: '2026-09-30', text: 'x', done: false, createdAt: '2026-09-30T01:00:00.000Z' },
        g2: { text: '没有日期', createdAt: '2026-09-30T01:00:00.000Z' },
      },
      profile: {},
      images: {},
    });
    expect(parsed?.counts).toEqual({ posts: 1, replies: 0, goals: 1 });
    expect(parsed?.goals).toEqual({ g1: { day: '2026-09-30', text: '跑步', done: true, createdAt: '2026-09-30T01:00:00.000Z' } });
  });

  it('keeps the current goals for a backup made before goals existed', () => {
    const parsed = parseBackup({ version: 2, posts: {}, replies: {}, images: {}, profile: {} });
    expect(parsed?.goals).toBeNull();
  });

  it('reads the pre-rebuild format', () => {
    const parsed = parseBackup({
      version: 1,
      user: { displayName: '我' },
      posts: [{ id: 'p1', entryType: 'diary', title: '标题', content: '日记', createdAt: '2026-09-01T00:00:00.000Z', replies: [{ id: 'r1', content: '追加', createdAt: '2026-09-02T00:00:00.000Z' }] }],
    });
    expect(parsed?.counts).toEqual({ posts: 1, replies: 1, goals: 0 });
    expect(parsed?.posts.p1).toMatchObject({ entryType: 'diary', title: '标题', xSync: false });
    expect(parsed?.goals).toBeNull();
  });

  it('refuses anything else', () => {
    expect(parseBackup(null)).toBeNull();
    expect(parseBackup({ version: 3 })).toBeNull();
  });
});
