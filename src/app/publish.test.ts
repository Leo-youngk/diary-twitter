import { createIndexes, createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TABLES_SCHEMA, VALUES_SCHEMA } from '@/lib/schema';

vi.mock('@/data/store', () => {
  const store = createMergeableStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA);
  return { store, indexes: createIndexes(store) };
});
vi.mock('./publications', () => ({ trackPublication: vi.fn() }));
vi.mock('@/data/actions', async (importOriginal) => {
  const actions = await importOriginal<typeof import('@/data/actions')>();
  return { ...actions, addPost: vi.fn(actions.addPost) };
});
vi.mock('./toast', () => ({ toast: vi.fn() }));

import { store } from '@/data/store';
import { addPost } from '@/data/actions';
import { trackPublication } from './publications';
import { toast } from './toast';
import { publishPost, publishReply } from './publish';

beforeEach(() => {
  vi.clearAllMocks();
  store.delTables().delValues();
});
afterEach(() => vi.restoreAllMocks());

describe('publication feedback', () => {
  it('leaves a post on its way to X to the progress bar, without a toast', () => {
    const id = publishPost({ content: '今天的随想', images: [], toX: true })!;
    expect(store.getCell('posts', id, 'xSync')).toBe(true);
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'posts', requestedX: true, skippedX: false });
    expect(toast).not.toHaveBeenCalled();
  });

  it('explicitly reports the existing length rule when an X-enabled post cannot sync', () => {
    const id = publishPost({ content: '字'.repeat(141), images: [], toX: true })!;
    expect(store.getCell('posts', id, 'xSync')).toBe(false);
    expect(toast).toHaveBeenCalledWith('已发布到日记本，超出 X 字数限制，未同步到 X', 'info');
  });

  it('tracks a normal reply on the progress bar too', () => {
    store.setRow('posts', 'p', { content: '原帖', xSync: true });
    const id = publishReply('p', '追加')!;
    expect(store.getCell('replies', id, 'xSync')).toBe(true);
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'replies', requestedX: true, skippedX: false });
    expect(toast).not.toHaveBeenCalled();
  });

  it('does not report success for a reply whose parent was deleted', () => {
    expect(publishReply('gone', '追加')).toBeNull();
    expect(store.getRowIds('replies')).toHaveLength(0);
    expect(toast).toHaveBeenCalledWith('原帖已被删除，追加没有保存', 'error');
  });

  it('returns a failure to the composer, keeping its draft when a write throws', () => {
    vi.mocked(addPost).mockImplementationOnce(() => { throw new Error('write failed'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(publishPost({ content: '保留草稿', images: [], toX: true })).toBeNull();
    expect(toast).toHaveBeenCalledWith('发布失败，内容仍保留在输入框，请重试', 'error');
  });
});
