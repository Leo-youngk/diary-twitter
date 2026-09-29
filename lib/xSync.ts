// Client side of the X (via Buffer) sync. The server owns delivery; this only
// asks how it went and reports it to the user.

import type { XSyncStatus } from './bufferIntegration';

export type { XSyncFailure, XSyncStatus } from './bufferIntegration';

const TOGGLE_KEY = 'diary-x-sync';
// Buffer answers within a second or two, X a little later.
const WATCH_DELAYS_MS = [3_000, 6_000, 12_000, 24_000];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStatus(value: unknown): XSyncStatus | null {
  if (!isRecord(value) || !Array.isArray(value.failed)) return null;
  if (typeof value.inProgress !== 'number' || typeof value.publishing !== 'number') return null;
  const failed = value.failed.filter(isRecord).map((item) => ({
    postId: String(item.postId ?? ''),
    preview: String(item.preview ?? ''),
    message: String(item.message ?? '发布失败'),
  }));
  const lastSent = isRecord(value.lastSent) && typeof value.lastSent.at === 'string'
    ? { at: value.lastSent.at, link: typeof value.lastSent.link === 'string' ? value.lastSent.link : undefined }
    : undefined;
  return {
    enabled: value.enabled === true,
    inProgress: value.inProgress,
    publishing: value.publishing,
    failed,
    lastSent,
  };
}

export async function fetchXSyncStatus(syncId: string): Promise<XSyncStatus | null> {
  try {
    const res = await fetch(`/api/x-sync?id=${encodeURIComponent(syncId)}`);
    return res.ok ? parseStatus(await res.json()) : null;
  } catch {
    return null;
  }
}

export async function actOnXSync(
  syncId: string,
  action: 'retry' | 'dismiss',
  postId?: string,
): Promise<XSyncStatus | null> {
  try {
    const res = await fetch('/api/x-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: syncId, action, postId }),
    });
    return res.ok ? parseStatus(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Follow a just-queued post until it is published or fails, so a failure is
 * seen as a toast now rather than found later in settings.
 */
export async function watchXSync(
  syncId: string,
  notify: (message: string, type: 'success' | 'error' | 'info') => void,
): Promise<void> {
  for (const delay of WATCH_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const status = await fetchXSyncStatus(syncId);
    if (!status) continue;
    if (status.failed.length > 0) {
      notify(`同步到 X 失败：${status.failed[0].message}（可在设置页重试）`, 'error');
      return;
    }
    if (status.inProgress === 0 && status.publishing === 0) {
      notify('已同步到 X', 'success');
      return;
    }
  }
  notify('同步到 X 仍在进行，稍后可在设置页查看结果', 'info');
}

// Whether new 随想 go to X. On unless switched off in settings; per device.
export function readXSyncPreference(): boolean {
  try { return localStorage.getItem(TOGGLE_KEY) !== '0'; } catch { return true; }
}

export function writeXSyncPreference(on: boolean) {
  try { localStorage.setItem(TOGGLE_KEY, on ? '1' : '0'); } catch {}
}
