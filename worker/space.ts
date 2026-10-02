import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
import type { Env } from './env';
import { runBackup } from './backup';
import { loginAttempt, migrateLoginTable, type LoginOutcome } from './login';
import { runObsidian } from './obsidian';
import { getMeta, migrateAppTables, setMeta } from './sql';
import { runX } from './x';
import { runXStats } from './xstats';
import type { LegacySnapshot } from './migrate';
import { encodeJson } from '../src/lib/sync';

// Changes are batched: one pass runs shortly after the first pending edit.
const RECONCILE_DELAY_MS = 2000;
// Allow normal failover and alarm retries before recovering a stopped alarm.
const OVERDUE_ALARM_MS = 5 * 60_000;

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
  declare private reconcileScheduling: Promise<void> | undefined;
  declare private migrationFrozen: boolean | undefined;
  declare private alarmRunning: Promise<void> | undefined;

  /** Private binding RPC: freeze the old copy before the D1 migration reads it. */
  async exportForMigration() {
    this.migrationFrozen = true;
    for (const socket of this.ctx.getWebSockets()) socket.close(1012, '应用已更新，请重新打开');
    if (this.alarmRunning) await this.alarmRunning;
    // With D1 bound, the legacy persister and alarm are read-only. Exporting
    // must also work when the old DO's daily write quota is exhausted.
    const read = (table: string) => this.ctx.storage.sql.exec(`SELECT * FROM ${table}`).toArray();
    if (!this.store) throw new Error('旧日记未加载，迁移已停止');
    const snapshot = {
      content: this.store.getMergeableContent(),
      meta: read('app_meta'), x: read('app_x'), obsidian: read('app_obsidian'), login: read('app_login'),
    } as LegacySnapshot;
    return encodeJson(snapshot);
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    migrateAppTables(ctx.storage.sql);
    migrateLoginTable(ctx.storage.sql);
  }

  createPersister() {
    const store = createMergeableStore();
    this.store = store;
    // Fragmented: separate rows, so the whole store need not fit in one SQL row.
    const persister = createDurableObjectSqlStoragePersister(store, this.ctx.storage.sql, {
      mode: 'fragmented',
      storagePrefix: 'tb_',
    });
    const changed = () => {
      // Loading an object is not a new edit. Scheduling from load or from an
      // empty transaction would wake it again, reload/save it, and loop forever.
      if (persister.getStatus() !== 1) this.ctx.waitUntil(this.requestReconcile());
    };
    store.addTableListener('posts', changed);
    store.addTableListener('replies', changed);
    store.addCellListener('xposts', null, 'command', (_store, _table, _row, _cell, command) => {
      if (command === 'retry' || command === 'dismiss') changed();
    });
    return this.env.DB ? { ...persister, startAutoSave: async () => persister } : persister;
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
    console.info('[space] sync ready', {
      posts: Object.keys(this.store?.getTable('posts') ?? {}).length,
      alarmAt: await this.ctx.storage.getAlarm(),
    });
  }

  /** Passphrase attempts are counted here, the one place every Worker instance shares. */
  async signIn(ip: string, correct: boolean): Promise<LoginOutcome> {
    return loginAttempt(this.ctx.storage.sql, ip, correct, Date.now());
  }

  private requestReconcile(): Promise<void> {
    if (this.env.DB || this.migrationFrozen || getMeta(this.ctx.storage.sql, 'd1_frozen') === '1') return Promise.resolve();
    // Coalesce only concurrent storage operations. A later edit or reconnect
    // must check the persisted alarm again, including recovery from a lost one.
    return this.reconcileScheduling ??= (async () => {
      const now = Date.now();
      const soon = now + RECONCILE_DELAY_MS;
      const current = await this.ctx.storage.getAlarm();
      // After the runtime exhausts its retries, a persisted past timestamp can
      // remain. Preserving it forever prevents recovery after the outage ends.
      if (current === null || current > soon || current < now - OVERDUE_ALARM_MS) {
        await this.ctx.storage.setAlarm(soon);
      }
    })().finally(() => { this.reconcileScheduling = undefined; });
  }

  async alarm(): Promise<void> {
    if (this.env.DB || this.migrationFrozen || getMeta(this.ctx.storage.sql, 'd1_frozen') === '1') return;
    this.alarmRunning = this.reconcile();
    try { await this.alarmRunning; } finally { this.alarmRunning = undefined; }
  }

  private async reconcile(): Promise<void> {
    console.info('[space] reconcile alarm');
    const sql = this.ctx.storage.sql;
    const store = this.store;
    const code = getMeta(sql, 'code');
    if (!store || !code) {
      console.error('[space] alarm without a loaded store or space id');
      return;
    }

    const now = Date.now();
    const wakeups: number[] = [];
    let nextX = Infinity;
    const passes: Array<[string, () => Promise<number>]> = [
      ['x', async () => { nextX = await runX(sql, store, this.env, now); return nextX; }],
      // Confirming a pending publication takes priority over refreshing stats.
      ['xstats', () => nextX <= Date.now() + 60_000 ? Promise.resolve(nextX) : runXStats(sql, store, this.env, now)],
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
    const xStates: Record<string, number> = {};
    for (const row of Object.values(store.getTable('xposts'))) {
      const state = String(row.state ?? 'unknown');
      xStates[state] = (xStates[state] ?? 0) + 1;
    }
    console.info('[space] reconcile complete', { xStates, alarmAt: await this.ctx.storage.getAlarm() });
  }
}
