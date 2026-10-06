import { useSyncExternalStore } from 'react';
import { createMergeableStore } from 'tinybase';
import { recordContent, rowRecord, splitContent, type SyncRecord, type SyncResponse } from '@/lib/sync';
import { deviceName, getToken, onTokenChange, signOut } from './auth';
import { store } from './store';

export type ConnectionState = 'connecting' | 'online' | 'offline';
interface Status { state: ConnectionState; syncedAt: number | null; error: string }
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
let status: Status = { state: 'connecting', syncedAt: null, error: '' };
const listeners = new Set<() => void>();
const firstSync: Array<() => void> = [];
const acknowledged = new Map<string, string>();
let cursor = 0;
let failures = 0;
let started = false;
let applying = false;
let inflight = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let epoch = 0;

function setStatus(next: Partial<Status>): void {
  status = { ...status, ...next };
  listeners.forEach(listener => listener());
}

/** IndexedDB's MergeableStore is the durable outbox. Unacknowledged clocks
 * remain there after a network error, tab close or device restart. */
export function outgoingRecords(): SyncRecord[] {
  return splitContent(store.getMergeableContent()).flatMap(record => {
    const [, table] = record.key.split(':');
    if (record.key.startsWith('v:') || ['posts', 'replies', 'goals', 'xlabels', 'xexperiments'].includes(table)) return [record];
    if (table !== 'xposts') return [];
    const content = recordContent(record);
    const id = record.key.split(':')[2];
    const cells = content[0][0].xposts[0][id][0];
    if (!cells.command) return [];
    for (const cell of Object.keys(cells)) if (cell !== 'command') delete cells[cell];
    const onlyCommand = createMergeableStore().applyMergeableChanges(content);
    return splitContent(onlyCommand.getMergeableContent());
  }).sort((a, b) => {
    // The server may publish as soon as it sees a root. Send its thread parts
    // first, including when the durable outbox needs several HTTP batches.
    const priority = (record: SyncRecord) => {
      const [, table, id] = record.key.split(':');
      return table === 'replies' && store.getCell('replies', id, 'thread') === true ? 0 : table === 'xposts' ? 2 : 1;
    };
    return priority(a) - priority(b);
  });
}

function schedule(delay: number): void {
  clearTimeout(timer);
  if (!getToken() || !navigator.onLine || document.visibilityState === 'hidden') return;
  timer = setTimeout(() => { void sync(); }, delay);
}

async function sync(): Promise<void> {
  if (inflight) { again = true; return; }
  const token = getToken();
  if (!token) return;
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  inflight = true;
  again = false;
  const ownEpoch = epoch;
  clearTimeout(timer);
  try {
    let more = true;
    while (more && ownEpoch === epoch) {
      const pending = outgoingRecords().filter(record => acknowledged.get(record.key) !== record.data);
      const records: SyncRecord[] = [];
      let size = 0;
      for (const record of pending) {
        if (records.length && (size + record.data.length > 500_000 || records.length >= 50)) break;
        records.push(record); size += record.data.length;
      }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 20_000);
      let response: Response;
      try {
        response = await fetch('/api/sync', {
          method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ records, cursor, name: deviceName(), build: __BUILD_ID__ }), signal: controller.signal,
          cache: 'no-store',
        });
      } finally { clearTimeout(timeout); }
      if (ownEpoch !== epoch) return;
      if (response.status === 401) { signOut(); setStatus({ state: 'offline' }); return; }
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(detail?.error || `同步请求失败 (${response.status})`);
      }
      const body = await response.json() as SyncResponse;
      if (!Array.isArray(body.records) || !Number.isSafeInteger(body.cursor) || body.cursor < cursor) throw new Error('无效同步响应');
      // Acknowledge exactly what was sent. Edits made while awaiting the
      // response differ from this snapshot and will be sent on the next pass.
      records.forEach(record => acknowledged.set(record.key, record.data));
      applying = true;
      try {
        store.transaction(() => { for (const record of body.records) store.applyMergeableChanges(recordContent(record)); });
      } finally { applying = false; }
      // A received record is acknowledged only when the local result matches
      // it. Otherwise a simultaneous offline edit must still go upstream.
      const local = new Map(outgoingRecords().map(record => [record.key, record.data]));
      for (const record of body.records) if (local.get(record.key) === record.data) acknowledged.set(record.key, record.data);
      cursor = body.cursor;
      // Publish per-row acknowledgements even when another batch is pending.
      setStatus({ state: 'online', error: '' });
      more = body.more || outgoingRecords().some(record => acknowledged.get(record.key) !== record.data);
    }
    if (ownEpoch !== epoch) return;
    failures = 0;
    setStatus({ state: 'online', syncedAt: Date.now(), error: '' });
    firstSync.splice(0).forEach(resolve => resolve());
  } catch (error) {
    if (ownEpoch !== epoch) return;
    console.warn('[sync] HTTP sync failed', error instanceof Error ? error.message : '连接异常');
    setStatus({ state: 'offline', error: error instanceof Error ? error.message : '连接异常' });
    schedule(BACKOFF_MS[Math.min(failures++, BACKOFF_MS.length - 1)]);
    return;
  } finally {
    inflight = false;
    controller = undefined;
    if (ownEpoch !== epoch && getToken()) schedule(0);
  }
  const recent = (createdAt: string | undefined) => Date.now() - Date.parse(createdAt ?? '') < 72 * 3600_000;
  const awaitingX = Object.values(store.getTable('xposts')).some(row => ['queued', 'sending', 'publishing'].includes(String(row.state)))
    || Object.entries(store.getTable('posts')).some(([id, row]) => row.xSync && row.entryType === 'thought' && recent(row.createdAt) && !store.hasRow('xposts', id))
    || Object.entries(store.getTable('replies')).some(([id, row]) => row.xSync && recent(row.createdAt) && !store.hasRow('xposts', id));
  schedule(again ? 0 : awaitingX ? 3000 : 30_000);
}

const X_CHECK_EVERY_MS = 30_000;
let xCheckedAt = 0;

/** Ask the server to look at X now, then bring back what it found. */
export function checkX(): void {
  const token = getToken();
  if (!token || !navigator.onLine || Date.now() - xCheckedAt < X_CHECK_EVERY_MS) return;
  xCheckedAt = Date.now();
  void fetch('/api/x/check', { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
    .then(response => { if (response.ok) reconnect(); })
    .catch(() => undefined);
}

function reconnect(): void {
  failures = 0;
  if (inflight) { again = true; return; }
  schedule(0);
}

export function startConnection(): void {
  if (started) return;
  started = true;
  const edited = () => { if (!applying) schedule(150); };
  store.addTablesListener(edited);
  store.addValuesListener(edited);
  onTokenChange(() => {
    epoch++; controller?.abort(); clearTimeout(timer);
    cursor = 0; acknowledged.clear();
    setStatus({ state: getToken() ? 'connecting' : 'offline', syncedAt: null, error: '' });
    if (getToken()) reconnect();
  });
  window.addEventListener('online', reconnect);
  window.addEventListener('offline', () => { controller?.abort(); clearTimeout(timer); setStatus({ state: 'offline' }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') clearTimeout(timer);
    else { reconnect(); checkX(); }
  });
  window.addEventListener('focus', reconnect);
  void sync();
  checkX();
}

export function whenSynced(): Promise<void> {
  return status.syncedAt !== null ? Promise.resolve() : new Promise(resolve => firstSync.push(resolve));
}
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function useConnection(): Status { return useSyncExternalStore(subscribe, () => status); }
export function useConnectionState(): ConnectionState { return useSyncExternalStore(subscribe, () => status.state); }
export function getConnectionState(): ConnectionState { return status.state; }
export function rowIsSynced(table: 'posts' | 'replies', id: string): boolean {
  const record = rowRecord(store.getMergeableContent(), table, id);
  return !!record && acknowledged.get(record.key) === record.data;
}
/** A new row cannot borrow the success of an earlier connection. */
export function useRowIsSynced(table: 'posts' | 'replies', id: string): boolean {
  return useSyncExternalStore(listener => {
    const stop = subscribe(listener);
    const rowListener = store.addRowListener(table, id, listener);
    return () => { stop(); store.delListener(rowListener); };
  }, () => rowIsSynced(table, id));
}
export function retrySync(): void { reconnect(); }
export function useAwaitingFirstSync(): boolean { return useSyncExternalStore(subscribe, () => status.syncedAt === null && status.state !== 'offline'); }
