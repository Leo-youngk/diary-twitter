import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
import type { Env } from './env';
import { runBackup } from './backup';
import { importLegacy } from './legacy';
import { runObsidian } from './obsidian';
import { getMeta, migrateAppTables, setMeta } from './sql';
import { runX } from './x';

// Changes are batched: one pass runs shortly after the last edit.
const RECONCILE_DELAY_MS = 2000;

/**
 * One instance per sync code. TinyBase's WsServerDurableObject relays changes
 * between that code's devices and keeps the server copy of the store in this
 * object's SQLite storage. On top of it, the alarm delivers to X and Obsidian
 * and writes the daily backup; those passes compare the store with ledgers,
 * so running one more time than needed is always harmless.
 */
export class DiarySpace extends WsServerDurableObject<Env> {
  private store?: MergeableStore;
  private reconcileRequested = false;
  private importing?: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrateAppTables(ctx.storage.sql);
  }

  createPersister() {
    const store = createMergeableStore();
    this.store = store;
    store.addDidFinishTransactionListener(() => { void this.requestReconcile(); });
    // Fragmented: one row per cell, clear of the 2MB row limit as data grows.
    return createDurableObjectSqlStoragePersister(store, this.ctx.storage.sql, {
      mode: 'fragmented',
      storagePrefix: 'tb_',
    });
  }

  // Phones behind slow networks need more than the one-second default.
  getRequestTimeoutSeconds() {
    return 15;
  }

  /** Called by the worker before every sync connection. */
  async ensureReady(code: string): Promise<void> {
    const sql = this.ctx.storage.sql;
    const known = getMeta(sql, 'code');
    if (known && known !== code) throw new Error('sync code mismatch');
    if (!known) setMeta(sql, 'code', code);
    if (getMeta(sql, 'imported')) return;
    this.importing ??= this.importOnce(code).finally(() => { this.importing = undefined; });
    await this.importing;
  }

  private async importOnce(code: string): Promise<void> {
    const sql = this.ctx.storage.sql;
    const store = this.store;
    if (!store || getMeta(sql, 'imported')) return;
    if (Object.keys(store.getTable('posts')).length === 0) {
      const result = await importLegacy(this.env, store, sql, code);
      console.log('[space] legacy import', result);
    }
    setMeta(sql, 'imported', new Date().toISOString());
  }

  private async requestReconcile(): Promise<void> {
    if (this.reconcileRequested) return;
    this.reconcileRequested = true;
    const soon = Date.now() + RECONCILE_DELAY_MS;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > soon) await this.ctx.storage.setAlarm(soon);
  }

  async alarm(): Promise<void> {
    this.reconcileRequested = false;
    const sql = this.ctx.storage.sql;
    const store = this.store;
    const code = getMeta(sql, 'code');
    if (!store || !code || !getMeta(sql, 'imported')) return;

    const now = Date.now();
    const wakeups: number[] = [];
    const passes: Array<[string, () => Promise<number>]> = [
      ['x', () => runX(sql, store, this.env, now)],
      ['obsidian', () => runObsidian(sql, store, this.env, code, now)],
      ['backup', () => runBackup(sql, store, this.env.DATA_KV, code, now)],
    ];
    for (const [name, pass] of passes) {
      try {
        wakeups.push(await pass());
      } catch (error) {
        console.error(`[space] ${name} pass failed`, error);
        wakeups.push(Date.now() + 60_000);
      }
    }
    const next = Math.min(...wakeups);
    if (Number.isFinite(next)) {
      const current = await this.ctx.storage.getAlarm();
      const at = Math.max(next, Date.now() + 1000);
      if (current === null || current > at) await this.ctx.storage.setAlarm(at);
    }
  }
}
