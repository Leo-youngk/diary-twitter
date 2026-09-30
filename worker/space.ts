import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
import type { Env } from './env';
import { runBackup } from './backup';
import { loginAttempt, migrateLoginTable, type LoginOutcome } from './login';
import { runObsidian } from './obsidian';
import { getMeta, migrateAppTables, setMeta } from './sql';
import { runX } from './x';

// Changes are batched: one pass runs shortly after the last edit.
const RECONCILE_DELAY_MS = 2000;

export interface DeviceInfo {
  id: string;
  /** e.g. "iPhone · 主屏 App", reported by the device. */
  name: string;
  build: string;
}

/**
 * The deployment's one data space. TinyBase's WsServerDurableObject relays
 * changes between devices and keeps the server copy of the store in this
 * object's SQLite storage. On top of it, the alarm delivers to X and Obsidian
 * and writes the daily backup; those passes compare the store with ledgers,
 * so running one more time than needed is always harmless.
 */
export class DiarySpace extends WsServerDurableObject<Env> {
  // `declare`, not a field: the base constructor calls createPersister(), and
  // a class field would be reset to undefined once that constructor returns.
  declare private store: MergeableStore | undefined;
  declare private reconcileRequested: boolean;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrateAppTables(ctx.storage.sql);
    migrateLoginTable(ctx.storage.sql);
  }

  createPersister() {
    const store = createMergeableStore();
    this.store = store;
    store.addDidFinishTransactionListener(() => { this.ctx.waitUntil(this.requestReconcile()); });
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

  /**
   * Called by the worker before every sync connection. Records the device in
   * the synced `devices` table, so every device (and a look at the data) shows
   * which version each one last ran.
   */
  async ensureReady(space: string, device: DeviceInfo): Promise<void> {
    const sql = this.ctx.storage.sql;
    const known = getMeta(sql, 'code');
    if (known && known !== space) throw new Error('space mismatch');
    if (!known) setMeta(sql, 'code', space);
    this.store?.setRow('devices', device.id, { name: device.name, build: device.build, seenAt: Date.now() });
    // Reconnecting must also recover work whose alarm was lost during an interruption.
    await this.requestReconcile();
  }

  /** Passphrase attempts are counted here, the one place every Worker instance shares. */
  async signIn(ip: string, correct: boolean): Promise<LoginOutcome> {
    return loginAttempt(this.ctx.storage.sql, ip, correct, Date.now());
  }

  private async requestReconcile(): Promise<void> {
    if (this.reconcileRequested) return;
    this.reconcileRequested = true;
    try {
      const soon = Date.now() + RECONCILE_DELAY_MS;
      const current = await this.ctx.storage.getAlarm();
      if (current === null || current > soon) await this.ctx.storage.setAlarm(soon);
    } catch (error) {
      this.reconcileRequested = false;
      throw error;
    }
  }

  async alarm(): Promise<void> {
    this.reconcileRequested = false;
    const sql = this.ctx.storage.sql;
    const store = this.store;
    const code = getMeta(sql, 'code');
    if (!store || !code) {
      console.error('[space] alarm without a loaded store or space id');
      return;
    }

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
