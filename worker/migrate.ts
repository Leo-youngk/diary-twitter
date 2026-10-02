import { createMergeableStore, type MergeableContent } from 'tinybase';
import { splitContent, decodeJson, encodeJson } from '../src/lib/sync';
import type { Env } from './env';
import { execute, getMeta, loadStore, saveRecord, setMeta } from './d1';

export interface LegacySnapshot {
  content: MergeableContent;
  meta: Record<string, string | number | null>[];
  x: Record<string, string | number | null>[];
  obsidian: Record<string, string | number | null>[];
  login: Record<string, string | number | null>[];
}

/** Only callable through a private Cloudflare binding; no admin HTTP route. */
export async function migrateLegacy(env: Env): Promise<void> {
  if (!env.SPACE_ID || !env.SESSION_SECRET) throw new Error('缺少日记空间配置');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SESSION_SECRET));
  const owner = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('');
  if (await getMeta(env.DB, 'migration_complete') === '1') {
    // The initial D1 deployment may finish importing before this ownership
    // guard is rolled out. Bind that import only to its existing space.
    if (await getMeta(env.DB, 'owner_auth') === null && await getMeta(env.DB, 'code') === env.SPACE_ID) {
      await setMeta(env.DB, 'owner_space', env.SPACE_ID);
      await setMeta(env.DB, 'owner_auth', owner);
    }
    if (await getMeta(env.DB, 'owner_space') !== env.SPACE_ID || await getMeta(env.DB, 'owner_auth') !== owner) {
      throw new Error('当前部署与 D1 日记空间不匹配');
    }
    return;
  }
  const snapshot = decodeJson<LegacySnapshot>(await env.SPACES.get(env.SPACES.idFromName(env.SPACE_ID)).exportForMigration());
  const source = createMergeableStore().setMergeableContent(snapshot.content);
  await env.DATA_KV.put(`diary-migration:${env.SPACE_ID}:d1-v3`, encodeJson(snapshot));
  // Deduplication is committed before any new delivery job can run.
  const tables = { x: 'diary3_x', meta: 'diary3_meta', obsidian: 'diary3_obsidian', login: 'diary3_login' };
  for (const [name, table] of Object.entries(tables)) {
    for (const row of snapshot[name as keyof typeof tables]) {
      const columns = Object.keys(row);
      await execute(env.DB, `INSERT OR IGNORE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(row));
    }
  }
  for (const record of splitContent(snapshot.content)) await saveRecord(env.DB, record);
  const { store: target } = await loadStore(env.DB);
  if (JSON.stringify(source.getContent()) !== JSON.stringify(target.getContent())) {
    // Compare content independently of SQL row/object iteration order.
    for (const [table, rows] of Object.entries(source.getTables())) {
      for (const [id, row] of Object.entries(rows)) {
        for (const [cell, value] of Object.entries(row)) {
          if (target.getCell(table, id, cell) !== value) throw new Error('日记迁移校验失败');
        }
      }
    }
    for (const [id, value] of Object.entries(source.getValues())) {
      if (target.getValue(id) !== value) throw new Error('个人资料迁移校验失败');
    }
  }
  for (const name of ['x', 'obsidian', 'xstats', 'backup']) {
    await execute(env.DB, 'INSERT OR IGNORE INTO diary3_jobs(name) VALUES(?)', name);
  }
  await setMeta(env.DB, 'owner_space', env.SPACE_ID);
  await setMeta(env.DB, 'owner_auth', owner);
  await setMeta(env.DB, 'migration_complete', '1');
  console.info('[d1] migration complete', { posts: source.getRowCount('posts'), replies: source.getRowCount('replies'), xLedger: snapshot.x.length });
}
