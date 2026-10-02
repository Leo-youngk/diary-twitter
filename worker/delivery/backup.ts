import type { MergeableStore } from 'tinybase';
import { getMeta, setMeta } from '../d1';

const RETENTION_SECONDS = 35 * 24 * 60 * 60;

function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Once a day, copy the whole store to KV (kept 35 days), outside the Durable
 * Object, so a bad write or a lost object never takes every copy with it.
 * Returns when the next backup is due.
 */
export async function runBackup(
  sql: D1Database,
  store: MergeableStore,
  kv: KVNamespace,
  code: string,
  now: number,
): Promise<number> {
  const today = utcDay(now);
  const tomorrow = Date.parse(`${today}T00:00:00Z`) + 24 * 3600_000 + 5 * 60_000;
  if (await getMeta(sql, 'backup_day') === today) return tomorrow;
  if (Object.keys(store.getTable('posts')).length === 0) return tomorrow;

  await kv.put(
    `diary-backup:${code}:${today}`,
    JSON.stringify({ exportedAt: new Date(now).toISOString(), tables: store.getTables(), values: store.getValues() }),
    { expirationTtl: RETENTION_SECONDS },
  );
  await setMeta(sql, 'backup_day', today);
  return tomorrow;
}
