import { createMergeableStore, type MergeableStore } from 'tinybase';
import { mergeRecord, recordContent, splitContent, type SyncRecord, type SyncResponse } from '../src/lib/sync';

export async function query<T>(db: D1Database, statement: string, ...bindings: unknown[]): Promise<T[]> {
  return (await db.prepare(statement).bind(...bindings).all<T>()).results;
}
export async function execute(db: D1Database, statement: string, ...bindings: unknown[]): Promise<void> {
  await db.prepare(statement).bind(...bindings).run();
}
export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  return await db.prepare('SELECT value FROM diary3_meta WHERE key=?').bind(key).first<string>('value');
}
export async function setMeta(db: D1Database, key: string, value: string): Promise<void> {
  await execute(db, `INSERT INTO diary3_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE diary3_meta.value<>excluded.value`, key, value);
}

/** A retired database stays frozen even if an older binding is redeployed. */
export async function databasePaused(db: D1Database): Promise<boolean> {
  return await getMeta(db, 'maintenance') === '1';
}

/** Optimistic compare-and-swap: simultaneous devices cannot overwrite each other's cells. */
export async function saveRecord(db: D1Database, record: SyncRecord): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await db.prepare('SELECT data FROM diary3_records WHERE key=?').bind(record.key).first<string>('data');
    const next = mergeRecord(current, record.data);
    if (next === current) return false;
    const result = await db.prepare(`INSERT INTO diary3_records(key,data,revision) VALUES(?,?,(SELECT revision+1 FROM diary3_clock WHERE id=1))
      ON CONFLICT(key) DO UPDATE SET data=excluded.data,revision=excluded.revision WHERE diary3_records.data=?`).bind(record.key, next, current).run();
    if (result.meta.changes > 0) return true;
  }
  throw new Error('同步繁忙，请稍后再试');
}

export async function pull(db: D1Database, cursor: number): Promise<SyncResponse> {
  const records = await query<Required<SyncRecord>>(db, 'SELECT key,data,revision FROM diary3_records WHERE revision>? ORDER BY revision LIMIT 201', cursor);
  const more = records.length > 200;
  if (more) records.pop();
  return { records, cursor: records.at(-1)?.revision ?? cursor, more };
}

export async function loadStore(db: D1Database): Promise<{ store: MergeableStore; baseline: Map<string, string> }> {
  const store = createMergeableStore();
  const records = await query<SyncRecord>(db, 'SELECT key,data FROM diary3_records');
  for (const record of records) store.applyMergeableChanges(recordContent(record));
  return { store, baseline: new Map(records.map(row => [row.key, row.data])) };
}
export async function saveStore(db: D1Database, store: MergeableStore, baseline: Map<string, string>): Promise<void> {
  for (const record of splitContent(store.getMergeableContent())) {
    if (record.data !== baseline.get(record.key)) {
      await saveRecord(db, record);
      baseline.set(record.key, record.data);
    }
  }
}

export async function dirtyJobs(db: D1Database): Promise<void> {
  await execute(db, `UPDATE diary3_jobs SET next_at=0,generation=generation+1 WHERE name IN ('x','obsidian')`);
}
