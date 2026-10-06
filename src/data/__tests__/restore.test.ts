import { describe, expect, it, vi } from 'vitest';

// A real store, so the restore can be checked cell by cell; the backup has no images to store.
vi.mock('../store', async () => {
  const { createMergeableStore } = await import('tinybase');
  const { TABLES_SCHEMA, VALUES_SCHEMA } = await import('@/lib/schema');
  return { store: createMergeableStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA) };
});
vi.mock('../blobs', () => ({}));

const { parseBackup, restoreBackup } = await import('../backup');
const { store } = await import('../store');

describe('restoreBackup', () => {
  it('never publishes a restored post or 追加 to X or Substack, keeping the flags the account already had', async () => {
    const row = (content: string) => ({
      entryType: 'thought', category: '', title: '', content, images: '[]', createdAt: new Date().toISOString(), isLiked: false, xSync: true, substackSync: true,
    });
    store.setRow('posts', 'kept', row('已经发出的'));
    const backup = parseBackup({
      version: 2,
      posts: { kept: row('已经发出的'), restored: row('只在备份里的') },
      replies: { r: { postId: 'restored', content: '追加', createdAt: new Date().toISOString(), xSync: true, substackSync: true, thread: false } },
      images: {},
      profile: {},
    });
    await restoreBackup(backup!);
    expect(store.getRow('posts', 'kept')).toMatchObject({ xSync: true, substackSync: true });
    expect(store.getRow('posts', 'restored')).toMatchObject({ content: '只在备份里的', xSync: false, substackSync: false });
    expect(store.getRow('replies', 'r')).toMatchObject({ xSync: false, substackSync: false });
  });
});
