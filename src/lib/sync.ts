import { createMergeableStore, type MergeableContent, type MergeableChanges } from 'tinybase';

/** A row (including cell tombstones), or one profile value, with its CRDT clocks. */
export interface SyncRecord { key: string; data: string; revision?: number }
export interface SyncResponse { records: SyncRecord[]; cursor: number; more: boolean }

// JSON's null would turn TinyBase deletion clocks into actual null cells.
// Cells only accept primitives, so this object cannot collide with cell data.
export function encodeJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item === undefined ? { $diaryDeleted: 1 } : item);
}
export function decodeJson<T>(value: string): T {
  return JSON.parse(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    && Object.keys(item).length === 1 && item.$diaryDeleted === 1 ? undefined : item) as T;
}

export function recordContent(record: SyncRecord): MergeableContent {
  return decodeJson<MergeableContent>(record.data);
}

/** Rebuild hashes rather than relying on hashes of a larger, unrelated store. */
function canonical(changes: MergeableChanges): string {
  const store = createMergeableStore();
  store.applyMergeableChanges(changes);
  return encodeJson(store.getMergeableContent());
}

/** One row's exact clocks, without canonicalizing every other row. */
export function rowRecord(content: MergeableContent, table: string, id: string): SyncRecord | null {
  const [tables, values] = content;
  const rows = tables[0][table];
  const row = rows?.[0][id];
  if (!row) return null;
  return { key: `r:${table}:${id}`, data: canonical([
    [{ [table]: [{ [id]: [Object.fromEntries(Object.entries(row[0]).map(([cell, stamp]) => [cell, [stamp[0], stamp[1]]])), row[1]] }, rows[1]] }, tables[1]], [{}, values[1]], 1,
  ]) };
}

export function splitContent(content: MergeableContent): SyncRecord[] {
  const [tables, values] = content;
  const records: SyncRecord[] = [];
  for (const [table, rows] of Object.entries(tables[0])) {
    for (const id of Object.keys(rows[0])) {
      records.push(rowRecord(content, table, id)!);
    }
  }
  for (const [id, value] of Object.entries(values[0])) {
    records.push({ key: `v:${id}`, data: canonical([[{}, tables[1]], [{ [id]: [value[0], value[1]] }, values[1]], 1]) });
  }
  return records;
}

export function mergeRecord(current: string | null, incoming: string): string {
  const store = createMergeableStore();
  if (current) store.applyMergeableChanges(decodeJson<MergeableContent>(current));
  store.applyMergeableChanges(decodeJson<MergeableContent>(incoming));
  return encodeJson(store.getMergeableContent());
}
