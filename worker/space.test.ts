/// <reference types="node" />
import { createRequire } from 'node:module';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiarySpace } from './space';
import { insertLedgerRow } from './x';

// Reproduce TinyBase's base-class initialization without the Workers runtime.
// Persistence, transactions, the delivery ledger, and scheduling remain real.
vi.mock('tinybase/synchronizers/synchronizer-ws-server-durable-object', () => ({
  WsServerDurableObject: class {
    ctx: DurableObjectState;
    env: unknown;
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx;
      this.env = env;
      const persister = (this as unknown as DiarySpace).createPersister();
      ctx.blockConcurrencyWhile(async () => {
        await persister.load();
        await persister.startAutoSave();
      });
    }
  },
}));
vi.mock('./xstats', () => ({ runXStats: vi.fn(async () => Infinity) }));
vi.mock('./obsidian', () => ({ runObsidian: vi.fn(async () => Infinity) }));
vi.mock('./backup', () => ({ runBackup: vi.fn(async () => Infinity) }));

interface Database {
  prepare(query: string): { all(...bindings: SqlStorageValue[]): Record<string, SqlStorageValue>[] };
  exec(query: string): void;
  close(): void;
}
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Database;
};
const now = Date.parse('2026-10-02T00:00:00Z');
let db: Database;
let sql: SqlStorage;
let ctx: DurableObjectState;
let alarmAt: number | null;
let pending: Promise<unknown>[];
let initialized: Promise<unknown>;
const device = { id: 'device', name: 'test', build: 'test' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  db = new DatabaseSync(':memory:');
  sql = { exec: (query: string, ...bindings: SqlStorageValue[]) => {
    if (query.trimStart().startsWith('CREATE')) {
      db.exec(query);
      return { toArray: () => [] };
    }
    const rows = db.prepare(query).all(...bindings);
    return { toArray: () => rows };
  } } as unknown as SqlStorage;
  alarmAt = null;
  pending = [];
  ctx = {
    storage: {
      sql,
      getAlarm: vi.fn(async () => alarmAt),
      setAlarm: vi.fn(async (at: number) => { alarmAt = at; }),
    },
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
    blockConcurrencyWhile: (callback: () => Promise<unknown>) => {
      initialized = callback();
      return initialized;
    },
  } as unknown as DurableObjectState;
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(async () => {
  await flush();
  db.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function flush() {
  while (pending.length) await Promise.all(pending.splice(0));
}
async function open() {
  const space = new DiarySpace(ctx, {} as ConstructorParameters<typeof DiarySpace>[1]);
  await initialized;
  await flush();
  return space;
}
function storeOf(space: DiarySpace): MergeableStore {
  return (space as unknown as { store: MergeableStore }).store;
}

describe('background reconciliation scheduling', () => {
  it('does not schedule another alarm from an empty delivery pass', async () => {
    const space = await open();
    await space.ensureReady('test-space', device);
    await flush();
    alarmAt = null; // The runtime consumes an alarm before calling its handler.
    await space.alarm();
    await flush();
    expect(alarmAt).toBeNull();
  });

  it('does not schedule from restored data or delivery status writes', async () => {
    const seed = createMergeableStore().setRow('posts', 'p', { content: 'saved', xSync: false });
    const persister = createDurableObjectSqlStoragePersister(seed, sql, { mode: 'fragmented', storagePrefix: 'tb_' });
    await persister.save();
    const space = await open();
    expect(storeOf(space).getCell('posts', 'p', 'content')).toBe('saved');
    expect(alarmAt).toBeNull();
    await space.ensureReady('test-space', device);
    await flush();
    insertLedgerRow(sql, { id: 'p', kind: 'post', state: 'sent', link: 'https://x.com/test/status/123' });
    alarmAt = null;
    await space.alarm();
    await flush();
    expect(storeOf(space).getCell('xposts', 'p', 'state')).toBe('sent');
    expect(alarmAt).toBeNull();
  });

  it('recovers a missing alarm on a reconnect even without an intervening alarm', async () => {
    const space = await open();
    await space.ensureReady('test-space', device);
    await flush();
    alarmAt = null;
    await space.ensureReady('test-space', device);
    await flush();
    expect(alarmAt).toBe(now + 2000);
  });

  it('schedules real edits and retry commands, but ignores statistics and cleared commands', async () => {
    const space = await open();
    const store = storeOf(space);
    store.setRow('posts', 'p', { content: 'new' });
    await flush();
    expect(alarmAt).toBe(now + 2000);
    alarmAt = null;
    store.setRow('replies', 'r', { content: 'reply', postId: 'p' });
    await flush();
    expect(alarmAt).toBe(now + 2000);
    alarmAt = null;
    store.setCell('xposts', 'p', 'command', 'retry');
    await flush();
    expect(alarmAt).toBe(now + 2000);
    alarmAt = null;
    store.setCell('xposts', 'p', 'command', '');
    store.setRow('xtweets', '123', { views: 10 });
    store.transaction(() => {});
    await flush();
    expect(alarmAt).toBeNull();
  });

  it('preserves an earlier alarm and coalesces simultaneous scheduling requests', async () => {
    const space = await open();
    alarmAt = now + 1000;
    const store = storeOf(space);
    store.transaction(() => {
      store.setRow('posts', 'p', { content: 'new' });
      store.setRow('replies', 'r', { content: 'reply', postId: 'p' });
    });
    await flush();
    expect(alarmAt).toBe(now + 1000);
    expect(ctx.storage.setAlarm).not.toHaveBeenCalled();
    expect(ctx.storage.getAlarm).toHaveBeenCalledTimes(1);
  });
});
