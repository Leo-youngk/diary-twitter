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
import { publishPost, publishReply, syncPostToChannel, syncPostToX } from './publish';

beforeEach(() => {
  vi.clearAllMocks();
  store.delTables().delValues();
});
afterEach(() => vi.restoreAllMocks());

describe('publication feedback', () => {
  it('holds a post and its thread until an explicit request, preserving its edited text and original date', () => {
    const id = publishPost({ content: '先留着', images: [], toX: false, thread: ['第二条'] })!;
    const part = store.getRowIds('replies')[0];
    expect(store.getCell('posts', id, 'xSync')).toBe(false);
    expect(store.getCell('replies', part, 'xSync')).toBe(false);
    expect(store.hasRow('xposts', id)).toBe(false);
    const createdAt = new Date(Date.now() - 10 * 24 * 3600_000).toISOString();
    store.setPartialRow('posts', id, { content: '修改后的随想', createdAt });
    store.setRow('replies', 'quote', { postId: id, content: '独立追加', thread: false, xSync: false });
    store.setValue('xSyncEnabled', false);
    vi.mocked(trackPublication).mockClear();

    syncPostToX(id);
    expect(store.getRow('posts', id)).toMatchObject({ content: '修改后的随想', createdAt, xSync: true });
    expect(store.getCell('replies', part, 'xSync')).toBe(true);
    expect(store.getCell('replies', 'quote', 'xSync')).toBe(false);
    expect(store.getCell('xposts', id, 'command')).toBe('send');
    expect(trackPublication).toHaveBeenCalledOnce();
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'posts', requestedX: true, skippedX: false });
    syncPostToX(id);
    expect(trackPublication).toHaveBeenCalledOnce();
  });

  it('manually sends a held Premium long post and thread without dropping or truncating text', () => {
    const content = '长文'.repeat(2000), part = '追加'.repeat(1000);
    const id = publishPost({ content, images: [], toX: false, thread: [part] })!;
    vi.mocked(trackPublication).mockClear();
    syncPostToX(id);
    expect(store.getRow('posts', id)).toMatchObject({ content, xSync: true });
    expect(store.getRow('replies', store.getRowIds('replies')[0])).toMatchObject({ content: part, xSync: true });
    expect(store.getCell('xposts', id, 'command')).toBe('send');
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'posts', requestedX: true, skippedX: false });
    expect(toast).toHaveBeenLastCalledWith('已请求同步到 X', 'info');
  });

  it('does not queue a deleted post or duplicate a known publication', () => {
    syncPostToX('deleted');
    expect(store.hasRow('xposts', 'deleted')).toBe(false);
    const id = publishPost({ content: '已在 X 上', images: [], toX: false })!;
    store.setRow('xposts', id, { state: 'sent', link: 'https://x.com/test/status/123' });
    vi.mocked(trackPublication).mockClear();
    syncPostToX(id);
    expect(store.getCell('xposts', id, 'command')).toBe('');
    expect(store.getCell('posts', id, 'xSync')).toBe(false);
    expect(trackPublication).not.toHaveBeenCalled();
  });

  it('leaves a post on its way to X to the progress bar, without a toast', () => {
    const id = publishPost({ content: '今天的随想', images: [], toX: true })!;
    expect(store.getCell('posts', id, 'xSync')).toBe(true);
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'posts', requestedX: true, skippedX: false });
    expect(toast).not.toHaveBeenCalled();
  });

  it('submits a Premium long post instead of silently turning off X', () => {
    const content = '字'.repeat(15000);
    const id = publishPost({ content, images: [], toX: true })!;
    expect(store.getRow('posts', id)).toMatchObject({ content, xSync: true });
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'posts', requestedX: true, skippedX: false });
    expect(toast).not.toHaveBeenCalled();
  });

  it('tracks a normal reply on the progress bar too', () => {
    store.setRow('posts', 'p', { content: '原帖', xSync: true });
    const text = '追加'.repeat(1000);
    const id = publishReply('p', text)!;
    expect(store.getCell('replies', id, 'content')).toBe(text);
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

  it('takes each platform from its own compose switch, for the post and its thread alike', () => {
    const partOf = (postId: string) => Object.values(store.getTable('replies')).find((part) => part.postId === postId);
    const mixed = publishPost({ content: 'X 和 Threads', images: [], toX: true, toSubstack: false, toThreads: true, thread: ['二'] })!;
    expect(store.getRow('posts', mixed)).toMatchObject({ xSync: true, substackSync: false, threadsSync: true });
    expect(partOf(mixed)).toMatchObject({ xSync: true, substackSync: false, threadsSync: true });
    const substackOnly = publishPost({ content: '只发 Substack', images: [], toX: false, toSubstack: true, toThreads: false })!;
    expect(store.getRow('posts', substackOnly)).toMatchObject({ xSync: false, substackSync: true, threadsSync: false });
    expect(store.hasRow('xposts', substackOnly)).toBe(false);
    expect(trackPublication).toHaveBeenLastCalledWith({ id: substackOnly, table: 'posts', requestedX: false, skippedX: false });
  });

  it('makes a 追加 follow its post on each platform separately, while that platform\'s default is on', () => {
    store.setValue('substackSyncEnabled', true);
    store.setRow('posts', 'p', { content: '原帖', xSync: false, substackSync: true, threadsSync: true });
    const reply = publishReply('p', '追加')!;
    expect(store.getRow('replies', reply)).toMatchObject({ xSync: false, substackSync: true, threadsSync: false });
    store.setValue('threadsSyncEnabled', true);
    store.setValue('substackSyncEnabled', false);
    expect(store.getRow('replies', publishReply('p', '再追加')!)).toMatchObject({ xSync: false, substackSync: false, threadsSync: true });
  });

  it('sends a saved post to one more platform on request, without touching the others', () => {
    const id = publishPost({ content: '先留着', images: [], toX: false, thread: ['第二条'] })!;
    const part = store.getRowIds('replies')[0];
    store.setRow('replies', 'quote', { postId: id, content: '独立追加', thread: false });

    syncPostToX(id);
    expect(store.getRow('posts', id)).toMatchObject({ xSync: true, substackSync: false, threadsSync: false });
    expect(store.hasRow('substackposts', id)).toBe(false);

    syncPostToChannel('substack', id);
    expect(store.getRow('posts', id)).toMatchObject({ substackSync: true, threadsSync: false });
    expect(store.getCell('replies', part, 'substackSync')).toBe(true);
    expect(store.getCell('replies', 'quote', 'substackSync')).toBe(false);
    expect(store.getCell('substackposts', id, 'command')).toBe('send');
    expect(store.hasRow('threadsposts', id)).toBe(false);
    expect(toast).toHaveBeenLastCalledWith('已请求同步到 Substack', 'info');

    syncPostToChannel('substack', id);
    expect(toast).toHaveBeenLastCalledWith('这条已请求同步，请查看同步状态', 'info');
    syncPostToChannel('threads', id);
    expect(store.getCell('threadsposts', id, 'command')).toBe('send');
    expect(store.getCell('replies', part, 'threadsSync')).toBe(true);
  });

  it('saves a thread in order and submits long parts to X intact', () => {
    const id = publishPost({ content: '第一条', images: [], toX: true, thread: ['第二条', '  ', '第三条'] })!;
    const parts = Object.values(store.getTable('replies')).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    expect(parts.map((part) => [part.postId, part.content, part.thread, part.xSync])).toEqual([[id, '第二条', true, true], [id, '第三条', true, true]]);
    expect(trackPublication).toHaveBeenCalledWith({ id, table: 'posts', requestedX: true, skippedX: false });
    expect(toast).not.toHaveBeenCalled();

    const long = publishPost({ content: '短', images: [], toX: true, thread: ['长'.repeat(1000)] })!;
    expect(store.getCell('posts', long, 'xSync')).toBe(true);
    expect(Object.values(store.getTable('replies')).find((part) => part.postId === long)).toMatchObject({ content: '长'.repeat(1000), xSync: true });
    expect(toast).not.toHaveBeenCalled();
  });
});
