import { DurableObject } from 'cloudflare:workers';
import { createMergeableStore } from 'tinybase';
import { TABLES_SCHEMA, VALUES_SCHEMA, ROW_ID_PATTERN } from '../src/lib/schema';
import { recordContent, splitContent, encodeJson, type SyncRecord } from '../src/lib/sync';
import type { Env } from './env';
import { databasePaused, ensureSchema, execute, pull, saveRecord, saveRecords } from './d1';
import { migrateLegacy } from './migrate';
import { concernedJobs, nextDeliveryAt, runJob, runJobs } from './jobs';
import type { LoginOutcome } from './login';
import { d1Login } from './d1-login';

/** All diary data lives in D1. DO storage holds only a delivery wake-up alarm. */
export class D1Diary extends DurableObject<Env> {
  private ready?: Promise<void>;
  private scheduling: Promise<void> = Promise.resolve();

  private scheduleDeliveries(): Promise<void> {
    const next = this.scheduling.then(async () => {
      const at = await nextDeliveryAt(this.env.DB);
      if (at === null) return;
      const soon = Math.max(Date.now() + 250, at);
      const current = await this.ctx.storage.getAlarm();
      if (current === null || current > soon || current < Date.now() - 60_000) await this.ctx.storage.setAlarm(soon);
    });
    this.scheduling = next.catch(() => undefined);
    return next;
  }
  private async ensureReady(): Promise<void> {
    if (await databasePaused(this.env.DB)) throw new Error('日记数据库正在迁移，本机内容将在迁移后同步');
    await (this.ready ??= migrateLegacy(this.env).then(() => ensureSchema(this.env.DB)).catch(error => { this.ready = undefined; throw error; }));
  }

  async sync(records: SyncRecord[], cursor: number, device: { id: string; name: string; build: string }) {
    await this.ensureReady();
    if (records.length > 100 || !Number.isSafeInteger(cursor) || cursor < 0) throw new Error('Invalid sync request');
    const dirty = new Set<string>();
    const accepted: SyncRecord[] = [];
    for (let record of records) {
      const [kind, table, id] = record.key.split(':');
      if ((kind === 'r' && (!Object.hasOwn(TABLES_SCHEMA, table) || !id || !ROW_ID_PATTERN.test(id)))
        || (kind === 'v' && !Object.hasOwn(VALUES_SCHEMA, table)) || !['r','v'].includes(kind)) throw new Error('Invalid sync record');
      if (record.data.length > 1_000_000) throw new Error('Sync record too large');
      const parsed = createMergeableStore().applyMergeableChanges(recordContent(record));
      const fragments = splitContent(parsed.getMergeableContent());
      if (fragments.length !== 1 || fragments[0].key !== record.key) throw new Error('Invalid sync content');
      // Delivery state is server-owned. Devices may only submit commands.
      if (kind === 'r' && ['xtweets','xaccount','xfollowers','xmetrics','substackmetrics','threadsmetrics','devices'].includes(table)) continue;
      if (kind === 'r' && ['xposts', 'substackposts', 'threadsposts'].includes(table)) {
        const cells = recordContent(record)[0][0][table][0][id][0];
        for (const cell of Object.keys(cells)) if (cell !== 'command') delete cells[cell];
        const content = recordContent(record);
        content[0][0][table][0][id][0] = cells;
        record = { key: record.key, data: encodeJson(content) };
      }
      accepted.push(record);
      if (kind === 'r') for (const job of concernedJobs(record, table, id)) dirty.add(job);
    }
    await saveRecords(this.env.DB, accepted, [...dirty]);
    // Persist the wake-up before acknowledging the upload. Delivery no longer
    // depends on a phone staying open or the next minute's Cron invocation.
    if (dirty.size) await this.scheduleDeliveries();
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
    try { await runJobs(this.env); } finally { await this.scheduleDeliveries(); }
  }

  async alarm(): Promise<void> {
    if (await databasePaused(this.env.DB)) return;
    await this.ensureReady();
    // Keep statistics and backups on Cron; a slow collection cannot delay a post.
    try { await runJobs(this.env, true); } finally { await this.scheduleDeliveries(); }
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

