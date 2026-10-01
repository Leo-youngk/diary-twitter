import { createIndexes, createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TABLES_SCHEMA, VALUES_SCHEMA } from '@/lib/schema';

vi.mock('@/data/store', () => {
  const store = createMergeableStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA);
  return { store, indexes: createIndexes(store) };
});
vi.mock('@/data/connection', () => ({ getConnectionState: vi.fn(() => 'online') }));
vi.mock('@/data/actions', async (importOriginal) => {
  const actions = await importOriginal<typeof import('@/data/actions')>();
  return { ...actions, addPost: vi.fn(actions.addPost) };
});
vi.mock('./toast', () => ({ toast: vi.fn() }));

import { store } from '@/data/store';
import { addPost } from '@/data/actions';
import { getConnectionState } from '@/data/connection';
import { toast } from './toast';
import { publishPost, publishReply } from './publish';

beforeEach(() => {
  vi.clearAllMocks();
  store.delTables().delValues();
  vi.mocked(getConnectionState).mockReturnValue('online');
});
afterEach(() => vi.restoreAllMocks());

describe('publication feedback', () => {
  it('confirms saving separately from the pending X outcome', () => {
    const id = publishPost({ content: '今天的随想', images: [], toX: true })!;
    expect(store.getCell('posts', id, 'xSync')).toBe(true);
    expect(toast).toHaveBeenCalledWith('已发布到日记本，正在同步到 X', 'success');
  });

  it('says that an offline post is waiting instead of implying it has reached X', () => {
    vi.mocked(getConnectionState).mockReturnValue('offline');
    const id = publishPost({ content: '离线随想', images: [], toX: true })!;
    expect(store.getCell('posts', id, 'xSync')).toBe(true);
    expect(toast).toHaveBeenCalledWith('已保存到本机，等待连接后同步到 X', 'info');
  });

  it('explicitly reports the existing length rule when an X-enabled post cannot sync', () => {
    const id = publishPost({ content: '字'.repeat(141), images: [], toX: true })!;
    expect(store.getCell('posts', id, 'xSync')).toBe(false);
    expect(toast).toHaveBeenCalledWith('已发布到日记本，超出 X 字数限制，未同步到 X', 'info');
  });

  it('confirms a normal reply from both reply entry points', () => {
    store.setRow('posts', 'p', { content: '原帖', xSync: true });
    const id = publishReply('p', '追加')!;
    expect(store.getCell('replies', id, 'xSync')).toBe(true);
    expect(toast).toHaveBeenCalledWith('追加已保存，正在同步到 X', 'success');
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
