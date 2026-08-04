const SYNC_ID_KEY = 'diary-sync-id';

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

export interface SyncPayload {
  posts: unknown;
  user: unknown;
  updatedAt: string;
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
