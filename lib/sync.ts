const SYNC_ID_KEY = 'diary-sync-id';
const UPDATED_AT_KEY = 'diary-updated-at';

// A random device/sync id, generated once and persisted in localStorage.
// Anyone with this id can read/write the same data — treat it like a share link.
export function getSyncId(): string {
  try {
    let id = localStorage.getItem(SYNC_ID_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      localStorage.setItem(SYNC_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

export function setSyncId(id: string) {
  try { localStorage.setItem(SYNC_ID_KEY, id); } catch {}
}

// Timestamp of the local copy, used to decide who wins against the remote copy.
export function getLocalUpdatedAt(): string | null {
  try { return localStorage.getItem(UPDATED_AT_KEY); } catch { return null; }
}

export function setLocalUpdatedAt(updatedAt: string) {
  try { localStorage.setItem(UPDATED_AT_KEY, updatedAt); } catch {}
}

export interface SyncPayload {
  posts: unknown;
  user: unknown;
  updatedAt: string;
}

export type Reconciliation =
  | { action: 'adopt-remote'; payload: SyncPayload }
  | { action: 'push-local' }
  | { action: 'none' };

// Single user across a few devices, so last-write-wins by timestamp is enough.
// What matters is never silently discarding the newer copy.
export function reconcile(
  localUpdatedAt: string | null,
  remote: SyncPayload | null
): Reconciliation {
  if (!remote) return { action: 'push-local' };

  const remoteTime = Date.parse(remote.updatedAt ?? '');
  if (!Number.isFinite(remoteTime)) return { action: 'push-local' };

  const localTime = Date.parse(localUpdatedAt ?? '');
  if (!Number.isFinite(localTime)) return { action: 'adopt-remote', payload: remote };

  if (remoteTime > localTime) return { action: 'adopt-remote', payload: remote };
  if (localTime > remoteTime) return { action: 'push-local' };
  return { action: 'none' };
}

export async function pullSync(id: string): Promise<SyncPayload | null> {
  const res = await fetch(`/api/sync?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const { data } = await res.json() as { data: SyncPayload | null };
  return data ?? null;
}

export async function pushSync(id: string, payload: SyncPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, data: payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
