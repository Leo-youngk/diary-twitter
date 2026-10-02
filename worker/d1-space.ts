import { DurableObject } from 'cloudflare:workers';
import { createMergeableStore } from 'tinybase';
import { TABLES_SCHEMA, VALUES_SCHEMA, ROW_ID_PATTERN } from '../src/lib/schema';
import { recordContent, splitContent, encodeJson, type SyncRecord } from '../src/lib/sync';
import type { Env } from './env';
import { dirtyJobs, execute, pull, query, saveRecord } from './d1';
import { migrateLegacy } from './migrate';
import { runJobs } from './jobs';
import { ALL_LIMIT, ALL_LOCK_MS, ALL_WINDOW_MS, IP_LIMIT, IP_LOCK_MS, type LoginOutcome } from './login';

/** Compute coordinator only. All durable data lives in D1; no DO storage writes. */
export class D1Diary extends DurableObject<Env> {
  private ready?: Promise<void>;
  private ensureReady(): Promise<void> {
    return this.ready ??= migrateLegacy(this.env).catch(error => { this.ready = undefined; throw error; });
  }

  async sync(records: SyncRecord[], cursor: number, device: { id: string; name: string; build: string }) {
    await this.ensureReady();
    if (records.length > 100 || !Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid sync request');
    let dirty = false;
    for (let record of records) {
      const [kind, table, id] = record.key.split(':');
      if ((kind === 'r' && (!Object.hasOwn(TABLES_SCHEMA, table) || !id || !ROW_ID_PATTERN.test(id)))
        || (kind === 'v' && !Object.hasOwn(VALUES_SCHEMA, table)) || !['r','v'].includes(kind)) throw new Error('Invalid sync record');
      if (record.data.length > 1_000_000) throw new Error('Sync record too large');
      const parsed = createMergeableStore().applyMergeableChanges(recordContent(record));
      const fragments = splitContent(parsed.getMergeableContent());
      if (fragments.length !== 1 || fragments[0].key !== record.key) throw new Error('Invalid sync content');
      // Delivery state is server-owned. Devices may only request retry/dismiss.
      if (kind === 'r' && ['xtweets','xaccount','devices'].includes(table)) continue;
      if (kind === 'r' && table === 'xposts') {
        const cells = recordContent(record)[0][0].xposts[0][id][0];
        for (const cell of Object.keys(cells)) if (cell !== 'command') delete cells[cell];
        const content = recordContent(record);
        content[0][0].xposts[0][id][0] = cells;
        record = { key: record.key, data: encodeJson(content) };
      }
      const changed = await saveRecord(this.env.DB, record);
      if (changed && (table === 'posts' || table === 'replies' || table === 'xposts')) dirty = true;
    }
    if (dirty) {
      await dirtyJobs(this.env.DB);
      this.ctx.waitUntil(runJobs(this.env, true));
    }
    // Device presence changes once per build/day, not every polling request.
    if (cursor === 0) {
      const store = createMergeableStore().setRow('devices', device.id, { name: device.name, build: device.build, seenAt: Date.now() });
      for (const record of splitContent(store.getMergeableContent())) await saveRecord(this.env.DB, record);
    }
    return pull(this.env.DB, cursor);
  }

  async tasks(): Promise<void> {
    await this.ensureReady();
    await runJobs(this.env);
  }

  async signIn(ip: string, correct: boolean): Promise<LoginOutcome> {
    await this.ensureReady();
    const now = Date.now();
    const keys = [`ip:${ip}`, 'all'];
    const locked = await query<{ locked_until: number }>(this.env.DB, 'SELECT locked_until FROM diary3_login WHERE key IN (?,?) AND locked_until>?', ...keys, now);
    if (locked.length) return { result: 'locked', retryAfterMs: Math.max(...locked.map(row => row.locked_until)) - now };
    if (correct) {
      await execute(this.env.DB, 'DELETE FROM diary3_login WHERE key=?', keys[0]);
      return { result: 'ok' };
    }
    await this.env.DB.batch(keys.map((key, index) => {
      const window = index === 0 ? IP_LOCK_MS : ALL_WINDOW_MS;
      const limit = index === 0 ? IP_LIMIT : ALL_LIMIT;
      const lock = index === 0 ? IP_LOCK_MS : ALL_LOCK_MS;
      return this.env.DB.prepare(`INSERT INTO diary3_login(key,failures,window_start,locked_until) VALUES(?,1,?,0)
        ON CONFLICT(key) DO UPDATE SET
        locked_until=CASE WHEN diary3_login.window_start+?>? AND diary3_login.failures+1>=? THEN ? ELSE diary3_login.locked_until END,
        failures=CASE WHEN diary3_login.window_start+?>? THEN diary3_login.failures+1 ELSE 1 END,
        window_start=CASE WHEN diary3_login.window_start+?>? THEN diary3_login.window_start ELSE ? END
        WHERE diary3_login.locked_until<=?`).bind(key, now, window, now, limit, now+lock, window, now, window, now, now, now);
    }));
    const after = await query<{ locked_until: number }>(this.env.DB, 'SELECT locked_until FROM diary3_login WHERE key IN (?,?) AND locked_until>?', ...keys, now);
    return after.length ? { result: 'locked', retryAfterMs: Math.max(...after.map(row => row.locked_until)) - now } : { result: 'wrong' };
  }
}
