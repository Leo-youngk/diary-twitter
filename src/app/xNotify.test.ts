import { createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TABLES_SCHEMA, VALUES_SCHEMA } from '@/lib/schema';

vi.mock('@/data/store', () => ({ store: createMergeableStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA) }));
vi.mock('./toast', () => ({ toast: vi.fn() }));

const now = Date.parse('2026-10-01T14:00:00Z');
let data: typeof import('@/data/store');
let notify: typeof import('./xNotify');
let toast: typeof import('./toast').toast;
let stop: (() => void) | undefined;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  data = await import('@/data/store');
  data.store.delTables();
  notify = await import('./xNotify');
  toast = (await import('./toast')).toast;
  vi.mocked(toast).mockClear();
});
afterEach(() => { stop?.(); vi.useRealTimers(); });

describe('X delivery notifications', () => {
  it('announces success even when the first server row is already sent', () => {
    stop = notify.announceXDeliveries();
    data.store.setRow('xposts', 'post', { state: 'sent', kind: 'post', at: now, link: 'https://x.com/me/status/1' });
    expect(toast).toHaveBeenCalledWith('同步到 X 成功！🎉');
  });

  it('announces a first-row failure with the reason supplied by the server', () => {
    stop = notify.announceXDeliveries();
    data.store.setRow('xposts', 'post', { state: 'failed', kind: 'post', at: now, error: 'X 账号需要重新连接' });
    expect(toast).toHaveBeenCalledWith('X 同步失败：X 账号需要重新连接', 'error');
  });

  it('reads reply metadata from the complete transaction, not the state cell alone', () => {
    data.store.setRow('xposts', 'reply', { state: 'publishing', kind: 'reply', at: now - 60_000 });
    stop = notify.announceXDeliveries();
    data.store.setPartialRow('xposts', 'reply', { state: 'sent', at: now, link: 'https://x.com/me/status/2' });
    expect(toast).toHaveBeenCalledWith('追加已同步到 X！🎉');
  });

  it('does not repeat a terminal notification on metadata updates', () => {
    stop = notify.announceXDeliveries();
    data.store.setRow('xposts', 'post', { state: 'sent', kind: 'post', at: now });
    data.store.setPartialRow('xposts', 'post', { at: now + 1000, link: 'https://x.com/me/status/1' });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('does not announce already-loaded or old terminal rows on reconnection', () => {
    data.store.setRow('xposts', 'loaded', { state: 'sent', kind: 'post', at: now });
    stop = notify.announceXDeliveries();
    data.store.setRow('xposts', 'old', { state: 'sent', kind: 'post', at: now - 20 * 60_000 });
    data.store.setPartialRow('xposts', 'loaded', { link: 'https://x.com/me/status/1' });
    expect(toast).not.toHaveBeenCalled();
  });
});
