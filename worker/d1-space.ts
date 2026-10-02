import { DurableObject } from 'cloudflare:workers';
import { createMergeableStore } from 'tinybase';
import { TABLES_SCHEMA, VALUES_SCHEMA, ROW_ID_PATTERN } from '../src/lib/schema';
import { recordContent, splitContent, encodeJson, type SyncRecord } from '../src/lib/sync';
import type { Env } from './env';
import { databasePaused, dirtyJobs, execute, pull, saveRecord } from './d1';
import { migrateLegacy } from './migrate';
import { runJob, runJobs } from './jobs';
import type { LoginOutcome } from './login';
import { d1Login } from './d1-login';

/** Compute coordinator only. All durable data lives in D1; no DO storage writes. */
export class D1Diary extends DurableObject<Env> {
  private ready?: Promise<void>;
  private async ensureReady(): Promise<void> {
    if (await databasePaused(this.env.DB)) throw new Error('日记数据库正在迁移，本机内容将在迁移后同步');
    await (this.ready ??= migrateLegacy(this.env).catch(error => { this.ready = undefined; throw error; }));
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
    if (await databasePaused(this.env.DB)) return;
    await this.ensureReady();
    await runJobs(this.env);
  }

  /** Look at X now rather than at the next minute; at most once every 20 seconds. */
  async checkX(): Promise<void> {
    if (await databasePaused(this.env.DB)) return;
    await this.ensureReady();
    // A run sets its next look a minute ahead, so a due time over 40s away means one ran under 20s ago.
    // Failing or unconfigured stats keep their longer wait.
    await execute(this.env.DB, `UPDATE diary3_jobs SET next_at=0 WHERE name='xstats' AND next_at>0 AND next_at<=?`, Date.now() + 40_000);
    await runJob(this.env, 'xstats');
  }

  async signIn(ip: string, correct: boolean): Promise<LoginOutcome> {
    await this.ensureReady();
    return d1Login(this.env.DB, ip, correct);
  }
}
