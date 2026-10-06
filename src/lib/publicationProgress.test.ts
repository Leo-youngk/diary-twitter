import { describe, expect, it } from 'vitest';
import type { XPostRow } from './schema';
import { publicationProgress } from './publicationProgress';

const x = (state: string, extra: Partial<XPostRow> = {}) => ({ state, kind: 'post', link: '', error: '', at: 0, command: '', ...extra } as XPostRow);
const input = { synced: true, requestedX: true, online: true, x: null };
describe('publication stages from real acknowledgements', () => {
  it('does not infer a new post is in the cloud merely from an online connection', () => {
    expect(publicationProgress({ ...input, synced: false })).toMatchObject({ complete: [true, false, false], active: 1, done: false, message: '正在保存到云端' });
  });
  it('stays pending while offline and explains a server failure', () => {
    expect(publicationProgress({ ...input, synced: false, online: false, error: '服务器暂时不可用' })).toMatchObject({ done: false, waiting: true, detail: '服务器暂时不可用' });
  });
  it('separates a confirmed cloud save from X accepting and publishing the post', () => {
    for (const state of ['queued', 'sending', 'publishing']) {
      const progress = publicationProgress({ ...input, x: x(state) });
      expect(progress.complete).toEqual([true, true, false]);
      expect(progress.done).toBe(false);
    }
    expect(publicationProgress({ ...input, x: x('publishing') }).message).toBe('正在确认 X 发布结果');
    expect(publicationProgress({ ...input, x: x('sent') })).toMatchObject({ complete: [true, true, true], done: true });
  });
  it('preserves failure details and waits for the retry outcome', () => {
    expect(publicationProgress({ ...input, x: x('failed', { error: '账号需要重新连接' }) })).toMatchObject({ failed: true, done: false, detail: '账号需要重新连接' });
    expect(publicationProgress({ ...input, x: x('failed', { command: 'retry' }) })).toMatchObject({ retrying: true, failed: false, done: false });
  });
  it('shows cancellation without completing the X step', () => {
    expect(publicationProgress({ ...input, x: x('dismissed') })).toMatchObject({ complete: [true, true, false], done: true, active: -1 });
  });
  it('keeps an old post\'s explicit send pending while its previous age check is being replaced', () => {
    expect(publicationProgress({ ...input, x: x('failed', { command: 'send', error: '超过 3 天' }) }))
      .toMatchObject({ done: false, failed: false, waiting: true, message: '正在提交 X 同步请求' });
  });
  it('finishes cloud-only posts and explains the length limit', () => {
    expect(publicationProgress({ ...input, requestedX: false, skippedX: true })).toMatchObject({ labels: ['日记本', '云端保存'], complete: [true, true], done: true, detail: '超出 X 字数限制，此帖未同步到 X' });
  });
});
