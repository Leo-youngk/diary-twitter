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
    expect(publicationProgress({ ...input, requestedX: false })).toMatchObject({ done: true, detail: '此帖未开启同步' });
  });
});

describe('publication stages on Substack and Threads', () => {
  it('follows a post sent only to Substack until Substack has it', () => {
    const substack = (row: XPostRow | null) => publicationProgress({ ...input, requestedX: false, channels: [{ name: 'Substack', row }] });
    expect(substack(null)).toMatchObject({ labels: ['日记本', '云端保存', 'Substack 发布'], complete: [true, true, false], active: 2, done: false, message: '等待发送到 Substack' });
    expect(substack(x('sending'))).toMatchObject({ done: false, message: '正在发送到 Substack' });
    expect(substack(x('sent'))).toMatchObject({ complete: [true, true, true], active: -1, done: true, message: '已同步到 Substack' });
  });

  it('is done only when every platform the post went to is', () => {
    const progress = (threads: XPostRow | null) => publicationProgress({ ...input, x: x('sent'), channels: [{ name: 'Threads', row: threads }] });
    expect(progress(x('publishing'))).toMatchObject({ complete: [true, true, true, false], active: 3, done: false, message: '正在确认 Threads 发布结果' });
    expect(progress(x('sent'))).toMatchObject({ done: true, message: '已同步到 X、Threads' });
    expect(progress(x('dismissed'))).toMatchObject({ done: true, message: '已同步到 X，Threads 同步已取消' });
  });

  it('tells a platform\'s failure even while another is still on its way', () => {
    const progress = publicationProgress({ ...input, x: x('sending'), channels: [
      { name: 'Substack', row: x('failed', { error: 'Buffer 里还没有连接可用的 Substack 频道' }) },
      { name: 'Threads', row: null },
    ] });
    expect(progress).toMatchObject({ failed: true, done: false, message: 'Substack 同步失败', detail: 'Buffer 里还没有连接可用的 Substack 频道' });
    expect(publicationProgress({ ...input, requestedX: false, channels: [{ name: 'Threads', row: x('failed', { command: 'retry' }) }] }))
      .toMatchObject({ failed: false, retrying: true, message: '正在提交 Threads 重试请求' });
  });
});
