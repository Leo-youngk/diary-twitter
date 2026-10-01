/// <reference types="node" />
import { createRequire } from 'node:module';
import { createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferApiError, bufferConfigured, createBufferPost, fetchBufferPost } from './buffer';
import { migrateAppTables } from './sql';
import { insertLedgerRow, runX } from './x';

vi.mock('./buffer', async (importOriginal) => ({
  ...await importOriginal<typeof import('./buffer')>(),
  bufferConfigured: vi.fn(() => true),
  createBufferPost: vi.fn(),
  fetchBufferPost: vi.fn(),
  tweetIdOf: (link?: string) => link?.match(/\/status\/(\d+)/)?.[1],
}));

interface Database {
  prepare(query: string): { all(...bindings: SqlStorageValue[]): Record<string, SqlStorageValue>[] };
  close(): void;
}
// Real SQLite exercises the delivery ledger; no Workers runtime is required.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Database;
};
const now = Date.parse('2026-09-30T02:00:00Z');
let db: Database;
let sql: SqlStorage;
let store: ReturnType<typeof createMergeableStore>;
const env = { BUFFER_API_KEY: 'test-key', BUFFER_CHANNEL_ID: 'test-channel' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  db = new DatabaseSync(':memory:');
  sql = { exec: (query: string, ...bindings: SqlStorageValue[]) => {
    const rows = db.prepare(query).all(...bindings);
    return { toArray: () => rows };
  } } as unknown as SqlStorage;
  migrateAppTables(sql);
  store = createMergeableStore();
  store.setRow('posts', 'p', { entryType: 'thought', content: '测试', xSync: true, createdAt: new Date(now).toISOString() });
  vi.mocked(createBufferPost).mockResolvedValue({ kind: 'ok', bufferPostId: 'b', status: 'scheduled' });
  vi.mocked(fetchBufferPost).mockResolvedValue({ status: 'scheduled' });
});
afterEach(() => { db.close(); vi.useRealTimers(); });

describe('X delivery progress', () => {
  it('acknowledges a received post and exposes sending before waiting for Buffer', async () => {
    vi.mocked(createBufferPost).mockImplementationOnce(async () => {
      expect(store.getCell('xposts', 'p', 'state')).toBe('sending');
      return { kind: 'ok', bufferPostId: 'b', status: 'sent', link: 'https://x.com/me/status/123' };
    });
    await runX(sql, store, env, now);
    expect(store.getCell('xposts', 'p', 'state')).toBe('sent');
  });

  it('shows the first result before a later delivery finishes', async () => {
    store.setRow('posts', 'q', { entryType: 'thought', content: '第二条', xSync: true, createdAt: new Date(now + 1).toISOString() });
    vi.mocked(createBufferPost)
      .mockResolvedValueOnce({ kind: 'ok', bufferPostId: 'b', status: 'sent', link: 'https://x.com/me/status/123' })
      .mockImplementationOnce(async () => {
        expect(store.getCell('xposts', 'p', 'state')).toBe('sent');
        expect(store.getCell('xposts', 'q', 'state')).toBe('sending');
        return { kind: 'rejected', message: '频道授权失效', retryable: false };
      });
    await runX(sql, store, env, now);
    expect(store.getCell('xposts', 'q', 'error')).toBe('频道授权失效');
  });

  it('does not poll Buffer on every unrelated app change', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'publishing', buffer_id: 'b' });
    await runX(sql, store, env, now);
    await runX(sql, store, env, now + 2000);
    expect(fetchBufferPost).toHaveBeenCalledTimes(1);
    expect(createBufferPost).not.toHaveBeenCalled();
  });

  it('schedules a follow-up for an interrupted sending state and never blindly resends it', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'sending', updated_at: now });
    const next = await runX(sql, store, env, now);
    expect(next).toBeGreaterThan(now);
    expect(next).toBeLessThanOrEqual(now + 60_000);
    await runX(sql, store, env, now + 60_001);
    expect(store.getCell('xposts', 'p', 'state')).toBe('failed');
    expect(createBufferPost).not.toHaveBeenCalled();
  });

  it('checks an existing Buffer post before a manual retry to avoid duplicating a successful post', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'failed', buffer_id: 'b' });
    store.setCell('xposts', 'p', 'command', 'retry');
    vi.mocked(fetchBufferPost).mockResolvedValue({ status: 'sent', link: 'https://x.com/me/status/123' });
    await runX(sql, store, env, now);
    expect(store.getCell('xposts', 'p', 'state')).toBe('sent');
    expect(createBufferPost).not.toHaveBeenCalled();
  });

  it('finishes the existing publication when Buffer reports it sent', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'publishing', buffer_id: 'b' });
    vi.mocked(fetchBufferPost).mockResolvedValue({ status: 'sent', link: 'https://x.com/me/status/123' });
    await runX(sql, store, env, now);
    expect(store.getCell('xposts', 'p', 'state')).toBe('sent');
    expect(store.getCell('xposts', 'p', 'link')).toBe('https://x.com/me/status/123');
    expect(createBufferPost).not.toHaveBeenCalled();
  });

  it('keeps an unavailable status query pending, visible, and scheduled', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'publishing', buffer_id: 'b' });
    vi.mocked(fetchBufferPost).mockResolvedValue(null);
    expect(await runX(sql, store, env, now)).toBeGreaterThan(now);
    expect(store.getCell('xposts', 'p', 'state')).toBe('publishing');
    expect(store.getCell('xposts', 'p', 'error')).toContain('暂时无法查询');
    expect(createBufferPost).not.toHaveBeenCalled();
  });

  it('stops polling during a rate limit even when unrelated changes trigger another pass', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'publishing', buffer_id: 'b' });
    vi.mocked(fetchBufferPost).mockRejectedValue(new BufferApiError('查询限流', 900_000));
    expect(await runX(sql, store, env, now)).toBe(now + 900_000);
    await runX(sql, store, env, now + 2000);
    expect(fetchBufferPost).toHaveBeenCalledTimes(1);
  });

  it('respects Retry-After and does not spend more API quota on the next queued post', async () => {
    store.setRow('posts', 'q', { entryType: 'thought', content: '第二条', xSync: true, createdAt: new Date(now).toISOString() });
    vi.mocked(createBufferPost).mockResolvedValue({ kind: 'rejected', retryable: true, message: '限流', retryAfterMs: 900_000 });
    expect(await runX(sql, store, env, now)).toBe(now + 900_000);
    expect(createBufferPost).toHaveBeenCalledTimes(1);
    await runX(sql, store, env, now + 60_000);
    expect(createBufferPost).toHaveBeenCalledTimes(1);
  });

  it('keeps a retry failed where Buffer is not configured instead of queueing it for ever', async () => {
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'failed', error: 'x' });
    store.setCell('xposts', 'p', 'command', 'retry');
    vi.mocked(bufferConfigured).mockReturnValueOnce(false);
    await runX(sql, store, {}, now);
    expect(store.getCell('xposts', 'p', 'state')).toBe('failed');
    expect(store.getCell('xposts', 'p', 'error')).toContain('没有配置 Buffer');
    expect(store.getCell('xposts', 'p', 'command')).toBe('');
  });
});
