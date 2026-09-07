import { describe, expect, it } from 'vitest';
import { parseBackup } from '../export';

const validBackup = {
  version: 1,
  exportedAt: '2026-09-07T00:00:00.000Z',
  user: {
    id: 'user-1', username: 'me', displayName: '我', avatar: '', banner: '', bio: '', joinedDate: '2026-01',
  },
  posts: [{
    id: 'post-1', entryType: 'thought', content: 'hello', images: [], createdAt: '2026-01-01T00:00:00.000Z',
    replies: [], isLiked: false,
  }],
  ledger: [{
    id: 'tx-1', type: 'expense', amount: 12.5, category: '餐饮', date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  }],
};

describe('parseBackup', () => {
  it('accepts a complete backup and preserves its records', () => {
    expect(parseBackup(validBackup)).toMatchObject({
      version: 1,
      posts: validBackup.posts,
      ledger: validBackup.ledger,
    });
  });

  it('rejects malformed or incomplete backups', () => {
    expect(parseBackup({ ...validBackup, posts: [{ ...validBackup.posts[0], isLiked: 'yes' }] })).toBeNull();
    expect(parseBackup({ ...validBackup, ledger: undefined })).toBeNull();
  });
});
